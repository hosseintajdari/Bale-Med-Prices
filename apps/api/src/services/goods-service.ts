import { goodsRepository } from "../repositories/goods-repository.ts";
import { aggregatorService } from "./aggregator/aggregator-service.ts";
import {
  normalizeUserQuery,
  splitCompoundQuery,
  normalizedFormOf
} from "../search/query-normalization.ts";
import { normalizeSearchText } from "../search/search-normalization.ts";

/**
 * Merge Darukade supplement hits into a local answer (F2): local
 * (official) items keep their order and come first; web items are
 * appended only when their normalized name + price pair is new, capped
 * so a big brand family cannot flood the answer.
 */
export function mergeSupplement(localItems, webItems, cap = 20) {
  const keyOf = (item) =>
    `${normalizeSearchText(item.persianTitle || item.title || "")}|${item.consumerUnitPrice ?? 0}`;
  const seen = new Set(localItems.map(keyOf));
  const merged = [...localItems];
  let appended = 0;
  for (const item of webItems) {
    if (appended >= cap) {
      break;
    }
    const key = keyOf(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
    appended++;
  }
  return merged;
}

function toPatientSource(source) {
  return {
    key: source.key,
    label: source.label,
    role: source.role,
    priority: source.priority
  };
}

function toPatientSearchItem(good) {
  return {
    id: good.id,
    title: good.title,
    persianTitle: good.persianTitle,
    englishTitle: good.englishTitle,
    aliases: good.aliases,
    unitLabel: good.unitLabel,
    packLabel: good.packLabel,
    dosageForm: good.dosageForm,
    routeQualifier: good.routeQualifier,
    strengthLabel: good.strengthLabel,
    patientFormLabel: good.patientFormLabel,
    packageDescription: good.packageDescription,
    activeStatus: good.activeStatus,
    consumerUnitPrice: good.sellPrice || good.tempPrice || 0,
    countInPackage: good.countInPackage,
    brand: good.brand,
    crawledAt: good.crawledAt,
    sources: good.sources.map(toPatientSource)
  };
}

/**
 * Maps a web aggregator hit onto the patient search-item shape so web
 * results flow through the same presenters (web + telegram) as local goods.
 * `webSource: true` marks the item as a live web price, not catalog data.
 */
function toWebSearchItem(hit) {
  return {
    id: `web:${hit.sourceName}:${encodeURIComponent(hit.url)}`,
    title: hit.productName,
    persianTitle: hit.productName,
    englishTitle: "",
    aliases: [],
    unitLabel: "",
    packLabel: "",
    dosageForm: undefined,
    routeQualifier: undefined,
    strengthLabel: undefined,
    patientFormLabel: undefined,
    packageDescription: undefined,
    activeStatus: "unknown",
    consumerUnitPrice: hit.priceRial,
    countInPackage: 1,
    brand: "",
    webSource: true,
    webSourceName: hit.sourceName,
    webSourceUrl: hit.url,
    webInStock: hit.inStock,
    crawledAt: hit.crawledAt,
    sources: []
  };
}

export const goodsService = {
  /** Exact tier only — the fallback chain below composes its own steps. */
  searchExact(input) {
    const items = goodsRepository.search({ query: input?.query ?? "" }).map(toPatientSearchItem);

    return {
      items,
      total: items.length
    };
  },

  /**
   * Exact tier first; on a miss, the guarded fuzzy tier (F2) answers
   * with its correction report attached as `fuzzy` — presenters label
   * those results «نتیجه‌ی نزدیک», they are never silent exact answers.
   */
  search(input) {
    const exact = this.searchExact(input);
    if (exact.items.length > 0) {
      return { ...exact, fuzzy: null };
    }
    const { goods, fuzzy } = goodsRepository.searchFuzzy({ query: input?.query ?? "" });
    if (!fuzzy || goods.length === 0) {
      return { items: [], total: 0, fuzzy: null };
    }
    const items = goods.map(toPatientSearchItem);
    return { items, total: items.length, fuzzy };
  },

  /**
   * Local catalog first; when it has nothing, fall back to the live web
   * price aggregator (darukade, delgarm). Same item shape, flagged as web.
   * Source failures (rate-limit/timeout) never surface as errors here: the
   * aggregator degrades to whatever healthy sources returned, and the
   * per-source outcomes travel in `webMeta` for observability/degrade
   * labels. A web-only miss therefore reads as an honest total=0, not a 429.
   */
  async searchWithWebFallback(input) {
    const rawQuery = input?.query ?? "";
    const userQuery = normalizeUserQuery(rawQuery);

    // Nothing drug-like remains (symbol/emoji/filler-only input): honest
    // empty answer WITHOUT scanning the catalog or fanning out — those
    // inputs were the Prime R2-5 hang class.
    if (!userQuery) {
      return { items: [], total: 0, webFallback: false, fuzzy: null };
    }

    const local = this.searchExact(input);
    if (local.items.length > 0) {
      return this.withSupplement({ ...local, webFallback: false, fuzzy: null }, userQuery);
    }

    // Conversational fallback: the raw sentence matched nothing, but its
    // filler-stripped core («قیمت آموکسی‌سیلین چنده» → «آموکسی سیلین»)
    // may be a plain catalog query.
    if (userQuery !== normalizedFormOf(rawQuery)) {
      const retried = this.searchExact({ query: userQuery });
      if (retried.items.length > 0) {
        return this.withSupplement({ ...retried, webFallback: false, fuzzy: null }, userQuery);
      }
    }

    // Compound fallback: two drugs in one question, merged per part.
    // Runs only after the whole query missed, so real combination
    // products are never split. The split answer pre-empts the web
    // fallback ONLY when every part hit locally — otherwise a single
    // product whose name contains «و» («لوسیون دست و بدن») would be
    // shadowed by generic local matches on one part («بدن») and never
    // reach the web catalog that actually carries it (review B1).
    const parts = splitCompoundQuery(userQuery);
    if (parts.length >= 2) {
      const seen = new Set();
      const merged = [];
      let everyPartHit = true;
      for (const part of parts) {
        const partResult = this.searchExact({ query: part });
        if (partResult.items.length === 0) {
          everyPartHit = false;
        }
        for (const item of partResult.items) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
      }
      if (everyPartHit && merged.length > 0) {
        return { items: merged, total: merged.length, webFallback: false, fuzzy: null };
      }
    }

    // Guarded fuzzy tier (F2): the exact chain missed; a distance-1 typo
    // of a real catalog drug answers here, labeled — before the web,
    // whose scorers cannot be trusted with a misspelling (شربت سیتریزین
    // used to return unrelated syrups from the web fan-out).
    const fuzzyResult = goodsRepository.searchFuzzy({ query: userQuery });
    if (fuzzyResult.goods.length > 0) {
      const items = fuzzyResult.goods.map(toPatientSearchItem);
      return { items, total: items.length, webFallback: false, fuzzy: fuzzyResult.fuzzy };
    }

    const { hits, meta } = await aggregatorService.searchWebWithMeta(userQuery);
    const items = hits.map(toWebSearchItem);

    return {
      items,
      total: items.length,
      webFallback: true,
      webMeta: meta,
      fuzzy: null
    };
  },

  /**
   * Darukade supplement (F2, Prime R2-2/R2-6): when the query IS a
   * Darukade brand or bare product name, that catalog's family joins the
   * local answer instead of being shadowed by it — local items stay
   * first (official prices lead), supplement hits are appended deduped.
   * Any failure or non-indexed query returns the result untouched.
   */
  async withSupplement(result, userQuery) {
    try {
      if (!aggregatorService.isDarukadeIndexedQuery(userQuery)) {
        return result;
      }
      const hits = await aggregatorService.searchDarukadeOnly(userQuery);
      if (hits.length === 0) {
        return result;
      }
      const items = mergeSupplement(result.items, hits.map(toWebSearchItem));
      if (items.length === result.items.length) {
        return result;
      }
      return { ...result, items, total: items.length, webSupplemented: true };
    } catch {
      return result;
    }
  },

  getById(id) {
    const good = goodsRepository.getById(id);

    if (!good) {
      const error = new Error(`Good '${id}' not found`);
      error.statusCode = 404;
      throw error;
    }

    return toPatientSearchItem(good);
  }
};

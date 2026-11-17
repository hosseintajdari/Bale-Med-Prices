import { goodsRepository } from "../repositories/goods-repository.ts";
import { aggregatorService } from "./aggregator/aggregator-service.ts";
import {
  normalizeUserQuery,
  splitCompoundQuery,
  normalizedFormOf
} from "../search/query-normalization.ts";

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
  search(input) {
    const items = goodsRepository.search({ query: input?.query ?? "" }).map(toPatientSearchItem);

    return {
      items,
      total: items.length
    };
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
      return { items: [], total: 0, webFallback: false };
    }

    const local = this.search(input);
    if (local.items.length > 0) {
      return { ...local, webFallback: false };
    }

    // Conversational fallback: the raw sentence matched nothing, but its
    // filler-stripped core («قیمت آموکسی‌سیلین چنده» → «آموکسی سیلین»)
    // may be a plain catalog query.
    if (userQuery !== normalizedFormOf(rawQuery)) {
      const retried = this.search({ query: userQuery });
      if (retried.items.length > 0) {
        return { ...retried, webFallback: false };
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
        const partResult = this.search({ query: part });
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
        return { items: merged, total: merged.length, webFallback: false };
      }
    }

    const { hits, meta } = await aggregatorService.searchWebWithMeta(userQuery);
    const items = hits.map(toWebSearchItem);

    return {
      items,
      total: items.length,
      webFallback: true,
      webMeta: meta
    };
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

import { goodsRepository } from "../repositories/goods-repository.ts";
import { aggregatorService } from "./aggregator/aggregator-service.ts";

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
   * price aggregator (torob, delgarm). Same item shape, flagged as web.
   * RateLimitedError propagates: the controller turns it into a 429 so
   * callers stop and report instead of hammering the sources.
   */
  async searchWithWebFallback(input) {
    const local = this.search(input);
    if (local.items.length > 0) {
      return { ...local, webFallback: false };
    }

    const query = (input?.query ?? "").trim();
    const hits = await aggregatorService.searchWeb(query);
    const items = hits.map(toWebSearchItem);

    return {
      items,
      total: items.length,
      webFallback: true
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

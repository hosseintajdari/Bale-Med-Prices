import { goodsRepository } from "../repositories/goods-repository.ts";

function parseSearchOptions(queryString) {
  const url = new URL(queryString, "http://localhost");
  return {
    query:
      url.searchParams.get("q") ??
      url.searchParams.get("query") ??
      url.searchParams.get("term") ??
      "",
    format: url.searchParams.get("format") ?? "default"
  };
}

function toPatientSearchItem(good) {
  return {
    id: good.id,
    title: good.title,
    persianTitle: good.persianTitle,
    englishTitle: good.englishTitle,
    brand: good.brand,
    genericCode: good.genericCode,
    barcode: good.barcode,
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
    sources: good.sources,
    internalCode: good.internalCode,
    sellPrice: good.sellPrice,
    tempPrice: good.tempPrice,
    nonPharma: good.nonPharma,
    countInPackage: good.countInPackage
  };
}

function buildTelegramSearchText(items, query) {
  if (items.length === 0) {
    return `No medicine was found for: ${query || "your search"}`;
  }

  const lines = [`Search: ${query || "all medicines"}`, `Matches: ${items.length}`];

  for (const item of items.slice(0, 5)) {
    lines.push(
      `- ${item.title} | ${item.persianTitle} | ${item.unitLabel} | ${item.consumerUnitPrice}`
    );
  }

  if (items.length > 5) {
    lines.push(`More results are available. Narrow the search query.`);
  }

  return lines.join("\n");
}

export const goodsService = {
  search(queryString) {
    const options = parseSearchOptions(queryString);
    const items = goodsRepository.search(queryString).map(toPatientSearchItem);

    if (options.format === "telegram") {
      return {
        query: options.query,
        total: items.length,
        text: buildTelegramSearchText(items, options.query),
        copyReady: true,
        items: items.slice(0, 5).map((item) => ({
          id: item.id,
          title: item.title,
          persianTitle: item.persianTitle,
          consumerUnitPrice: item.consumerUnitPrice,
          unitLabel: item.unitLabel
        }))
      };
    }

    return {
      items,
      total: items.length
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

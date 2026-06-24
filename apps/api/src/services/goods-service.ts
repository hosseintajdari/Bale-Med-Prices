import { goodsRepository } from "../repositories/goods-repository.ts";

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

export const goodsService = {
  search(input) {
    const items = goodsRepository.search({ query: input?.query ?? "" }).map(toPatientSearchItem);

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

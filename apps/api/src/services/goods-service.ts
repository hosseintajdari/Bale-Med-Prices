import { goodsRepository } from "../repositories/goods-repository.ts";

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

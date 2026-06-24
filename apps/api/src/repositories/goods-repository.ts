import { goods } from "../data/mock-data.ts";

function tokenize(term) {
  return term
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export const goodsRepository = {
  search(input) {
    const term = (input?.query ?? "").trim().toLowerCase();
    const tokens = tokenize(term);

    if (!term) {
      return goods.slice(0, 20);
    }

    return goods.filter((good) => {
      const haystacks = [
        good.id,
        good.internalCode,
        good.barcode,
        good.genericCode,
        good.title,
        good.brand,
        good.persianTitle,
        good.englishTitle,
        good.dosageForm,
        good.routeQualifier,
        good.strengthLabel,
        good.patientFormLabel,
        good.packageDescription,
        good.activeStatus,
        ...good.aliases
      ].filter(Boolean);

      const searchableText = haystacks.map((value) => value.toLowerCase()).join(" ");
      return tokens.every((token) => searchableText.includes(token));
    });
  },

  getById(id) {
    return goods.find((good) => good.id === id) ?? null;
  }
};

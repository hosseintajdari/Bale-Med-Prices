import { goods } from "../data/mock-data.ts";

function parseSearchTerm(queryString) {
  const url = new URL(queryString, "http://localhost");
  return (
    url.searchParams.get("q") ??
    url.searchParams.get("query") ??
    url.searchParams.get("term") ??
    ""
  )
    .trim()
    .toLowerCase();
}

export const goodsRepository = {
  search(queryString) {
    const term = parseSearchTerm(queryString);

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
        ...good.aliases
      ];

      return haystacks.some((value) => value.toLowerCase().includes(term));
    });
  },

  getById(id) {
    return goods.find((good) => good.id === id) ?? null;
  }
};

import { stockSnapshots } from "../data/mock-data.ts";

export const stockRepository = {
  getAverageCost(goodId, warehouseId) {
    const exactMatch = stockSnapshots
      .filter((entry) => entry.goodId === goodId && entry.warehouseId === warehouseId)
      .sort((left, right) => right.count - left.count)[0];

    if (exactMatch) {
      return exactMatch;
    }

    const fallback = stockSnapshots
      .filter((entry) => entry.goodId === goodId)
      .sort((left, right) => right.count - left.count)[0];

    return fallback ?? null;
  }
};

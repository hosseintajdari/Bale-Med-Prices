import { taxTables } from "../data/mock-data.ts";

export const taxRepository = {
  findByGood(good) {
    for (const code of good.taxCodes) {
      const taxTable = taxTables.find((entry) => entry.code === code);

      if (taxTable) {
        return taxTable;
      }
    }

    return null;
  }
};

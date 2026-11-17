import test from "node:test";
import assert from "node:assert/strict";

// F2 service chain: fuzzy tier inside the local search, Darukade
// supplement for brand / bare-name queries (Prime R2-2/R2-3/R2-6).

test("goodsService.search falls back to the guarded fuzzy tier and labels it", async () => {
  const { goodsService } = await import("./goods-service.ts");
  const result = goodsService.search({ query: "استامنوفن" });
  assert.ok(result.total >= 1);
  assert.ok(result.items.some((item) => item.id === "g-1006"));
  assert.equal(result.fuzzy?.ambiguous, false);
  assert.equal(result.fuzzy?.matchedTerm, "استامینوفن");
});

test("goodsService.search keeps exact answers unlabeled", async () => {
  const { goodsService } = await import("./goods-service.ts");
  const result = goodsService.search({ query: "لوزارتان" });
  assert.equal(result.total, 1);
  assert.equal(result.fuzzy, null);
});

test("searchWithWebFallback answers a transposed typo locally, labeled, without the web", async () => {
  const { goodsService } = await import("./goods-service.ts");
  const result = await goodsService.searchWithWebFallback({ query: "لوزاتران" });
  assert.equal(result.webFallback, false);
  assert.ok(result.items.some((item) => item.id === "g-1003"));
  assert.equal(result.fuzzy?.matchedTerm, "لوزارتان");
  assert.equal(result.fuzzy?.ambiguous, false);
});

test("mergeSupplement appends new Darukade items, dedupes by name+price, keeps local first", async () => {
  const { mergeSupplement } = await import("./goods-service.ts");
  const local = [
    { id: "g-1", persianTitle: "لوزارتان ۵۰", title: "LOSARTAN 50", consumerUnitPrice: 96000 },
    { id: "g-2", persianTitle: "متفورمین ۵۰۰", title: "METFORMIN 500", consumerUnitPrice: 50000 }
  ];
  const web = [
    { id: "web:1", persianTitle: "لوزارتان ۵۰", title: "لوزارتان ۵۰", consumerUnitPrice: 96000 },
    { id: "web:2", persianTitle: "لوزارتان ۲۵", title: "لوزارتان ۲۵", consumerUnitPrice: 70000 }
  ];
  const merged = mergeSupplement(local, web);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].id, "g-1");
  assert.equal(merged[2].id, "web:2");
});



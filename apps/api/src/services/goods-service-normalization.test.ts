import test from "node:test";
import assert from "node:assert/strict";
import { goodsService } from "./goods-service.ts";

// Prime QA round 2, class A10 (0/8) and R2-5: conversational sentences
// and symbol-only inputs must not come back as a bare miss / hang.

test("conversational price question finds the drug locally", async () => {
  const result = await goodsService.searchWithWebFallback({ query: "قیمت آموکسی‌سیلین چنده" });
  assert.ok(result.total >= 1, `expected a hit, got total=${result.total}`);
  assert.equal(result.webFallback, false);
  assert.ok(result.items.some((item) => item.id === "g-1001"));
});

test("symbol-only query short-circuits to an honest zero, no web fan-out", async () => {
  const result = await goodsService.searchWithWebFallback({ query: "_" });
  assert.equal(result.total, 0);
  assert.equal(result.webFallback, false);
});

test("emoji-only query short-circuits to an honest zero", async () => {
  const result = await goodsService.searchWithWebFallback({ query: "😊😊😊" });
  assert.equal(result.total, 0);
  assert.equal(result.webFallback, false);
});

test("two-drug question returns items for both drugs", async () => {
  const result = await goodsService.searchWithWebFallback({ query: "آموکسی‌سیلین و استامینوفن" });
  const ids = new Set(result.items.map((item) => item.id));
  assert.ok(ids.has("g-1001"), "amoxicillin missing");
  assert.ok(ids.has("g-1006"), "acetaminophen missing");
});

test("plain query behavior is unchanged", async () => {
  const result = await goodsService.searchWithWebFallback({ query: "آموکسی‌سیلین" });
  assert.ok(result.total >= 1);
  assert.equal(result.webFallback, false);
});

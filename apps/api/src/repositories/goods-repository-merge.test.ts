import test from "node:test";
import assert from "node:assert/strict";
import { mergeRestComplement, sanitizeRestGoods } from "./goods-repository.ts";
import type { Good } from "../../../../packages/domain/src/types.ts";

function good(partial: Partial<Good> & { id: string }): Good {
  return {
    internalCode: "",
    barcode: "",
    genericCode: "",
    title: "",
    persianTitle: "",
    englishTitle: "",
    aliases: [],
    brand: "",
    sellPrice: 0,
    taxCodes: [],
    nonPharma: false,
    countInPackage: 1,
    unitLabel: "",
    packLabel: "",
    sources: [],
    ...partial,
  } as Good;
}

const base: Good[] = [
  good({ id: "q-1", internalCode: "6534", persianTitle: "شربت پدیاکید", title: "PEDIAKID SYRUP", sellPrice: 1000 }),
  good({ id: "q-2", internalCode: "111", persianTitle: "قرص استامینوفن", title: "ACETAMINOPHEN TAB", sellPrice: 2000 }),
];

test("REST item with an existing numeric code is skipped — token price always wins", () => {
  const rest = [good({ id: "r-1", internalCode: "6534", persianTitle: "شربت پدیاکید", sellPrice: 9999 })];
  const merged = mergeRestComplement(base, rest);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((g) => g.internalCode === "6534")?.sellPrice, 1000);
});

test("REST item whose code has surrounding whitespace still matches the base code", () => {
  const rest = [good({ id: "r-2", internalCode: " 6534 ", persianTitle: "چیز دیگر", sellPrice: 5 })];
  assert.equal(mergeRestComplement(base, rest).length, 2);
});

test("REST item with a new code and new title is appended", () => {
  const rest = [good({ id: "r-3", internalCode: "777", persianTitle: "شیر خشک اس ام ای گلد", sellPrice: 108050 })];
  const merged = mergeRestComplement(base, rest);
  assert.equal(merged.length, 3);
  assert.equal(merged[2].id, "r-3");
});

test("unkeyed REST item is appended only when its title is new", () => {
  const fresh = [good({ id: "r-4", internalCode: "", persianTitle: "شستشوی تناسلی", sellPrice: 484000 })];
  assert.equal(mergeRestComplement(base, fresh).length, 3);
  const dupe = [good({ id: "r-5", internalCode: "", persianTitle: "قرص استامینوفن", sellPrice: 1 })];
  assert.equal(mergeRestComplement(base, dupe).length, 2);
});

test("duplicate REST ids and self-duplicates collapse", () => {
  const rest = [
    good({ id: "r-6", internalCode: "888", persianTitle: "کالای الف", sellPrice: 10 }),
    good({ id: "r-6", internalCode: "888", persianTitle: "کالای الف", sellPrice: 10 }),
    good({ id: "r-7", internalCode: "888", persianTitle: "کالای ب", sellPrice: 20 }),
  ];
  const merged = mergeRestComplement(base, rest);
  assert.equal(merged.length, 3);
  assert.equal(merged[2].id, "r-6");
});

test("empty REST set returns the base untouched", () => {
  assert.equal(mergeRestComplement(base, []), base);
});

test("sanitize drops null and id-less entries instead of throwing downstream", () => {
  const cleaned = sanitizeRestGoods([null, 42, "x", { noId: true }, good({ id: "r-9", internalCode: "999", persianTitle: "کالای تازه" })]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].id, "r-9");
  assert.doesNotThrow(() => mergeRestComplement(base, cleaned));
});

test("sanitize coerces a numeric internalCode to string so keyOf never throws", () => {
  const cleaned = sanitizeRestGoods([{ id: "r-10", internalCode: 6534, persianTitle: "شربت پدیاکید" }]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].internalCode, "6534");
  // coerced code matches the base code -> skipped by the fill-only merge
  assert.equal(mergeRestComplement(base, cleaned).length, 2);
});

test("sanitize of a non-array payload is an empty complement", () => {
  assert.deepEqual(sanitizeRestGoods({ goods: [] }), []);
  assert.deepEqual(sanitizeRestGoods(null), []);
});

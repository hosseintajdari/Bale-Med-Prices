import test from "node:test";
import assert from "node:assert/strict";
import { assembleCatalog, mergeRestComplement, sanitizeRestGoods } from "./goods-repository.ts";
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

// --- assembleCatalog: the REST-primary switch (Scan-B verdict 2026-11-18)

const restPrimary: Good[] = [
  good({ id: "r-1", internalCode: "6534", persianTitle: "شربت پدیاکید", title: "PEDIAKID SYRUP", sellPrice: 1500 }),
  good({ id: "r-2", internalCode: "222", persianTitle: "کپسول امپرازول", title: "OMEPRAZOLE CAP", sellPrice: 3000 }),
];
const tokenFallback: Good[] = [
  good({ id: "q-1", internalCode: "6534", persianTitle: "شربت پدیاکید", title: "PEDIAKID SYRUP", sellPrice: 1000 }),
  good({ id: "q-9", internalCode: "999", persianTitle: "حق فنی", title: "TECHNICAL FEE", sellPrice: 500 }),
];

test("assembleCatalog: REST is primary — identity and price come from REST for matched items", () => {
  const merged = assembleCatalog({ tokenGoods: tokenFallback, tokenFromFile: true, restGoods: restPrimary });
  const matched = merged.find((g) => g.internalCode === "6534");
  assert.equal(matched?.id, "r-1", "the REST record is the served identity");
  assert.equal(matched?.sellPrice, 1500, "REST price wins when the token snapshot is not fresher");
});

test("assembleCatalog: token-only items fill in (the technical-fee service survives the switch)", () => {
  const merged = assembleCatalog({ tokenGoods: tokenFallback, tokenFromFile: true, restGoods: restPrimary });
  assert.equal(merged.length, 3);
  assert.ok(merged.some((g) => g.id === "q-9"));
});

test("assembleCatalog: a FRESHER token snapshot updates matched prices, identity stays REST", () => {
  const merged = assembleCatalog({
    tokenGoods: tokenFallback,
    tokenFromFile: true,
    tokenAt: 2000,
    restGoods: restPrimary,
    restAt: 1000,
  });
  const matched = merged.find((g) => g.internalCode === "6534");
  assert.equal(matched?.id, "r-1");
  assert.equal(matched?.sellPrice, 1000, "fresher fallback price applies under the same guards");
});

test("assembleCatalog: no REST → token alone; mock token (not from file) never fills into REST", () => {
  assert.equal(
    assembleCatalog({ tokenGoods: tokenFallback, tokenFromFile: true, restGoods: [] }),
    tokenFallback
  );
  const restOnly = assembleCatalog({ tokenGoods: tokenFallback, tokenFromFile: false, restGoods: restPrimary });
  assert.equal(restOnly, restPrimary, "bundled mock data must not pollute the primary catalog");
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

test("sanitize fully defaults a sparse entry so unguarded downstream reads are safe", () => {
  // The reviewer's boot-crash repro: no aliases/sources/taxCodes at all.
  const cleaned = sanitizeRestGoods([{ id: "r-1", internalCode: "999999", persianTitle: "x" }]);
  assert.equal(cleaned.length, 1);
  const g = cleaned[0];
  assert.deepEqual(g.aliases, []);
  assert.deepEqual(g.sources, []);
  assert.deepEqual(g.taxCodes, []);
  assert.equal(g.sellPrice, 0);
  assert.equal(g.countInPackage, 1);
  assert.equal(g.barcode, "");
  // the exact unguarded operations from the precompute and the scorer:
  assert.doesNotThrow(() => [...g.aliases]);
  assert.doesNotThrow(() => { for (const a of g.aliases ?? []) void a; });
  assert.doesNotThrow(() => g.sources.map((s) => s));
});

test("fresher REST snapshot updates the price of a code-matched item, identity stays primary", () => {
  const rest = [good({ id: "r-f1", internalCode: "6534", persianTitle: "عنوان دیگر", sellPrice: 1500, crawledAt: "2026-11-17T10:00:00Z" })];
  const merged = mergeRestComplement(base, rest, { baseAt: 1000, restAt: 2000 });
  const item = merged.find((g) => g.internalCode === "6534");
  assert.equal(item?.sellPrice, 1500);
  assert.equal(item?.persianTitle, "شربت پدیاکید", "identity must stay with the primary item");
  assert.equal(item?.crawledAt, "2026-11-17T10:00:00Z");
  assert.equal(merged.length, 2, "no append for a matched item");
});

test("older REST snapshot never overrides — fill-only", () => {
  const rest = [good({ id: "r-f2", internalCode: "6534", persianTitle: "شربت پدیاکید", sellPrice: 1500 })];
  const merged = mergeRestComplement(base, rest, { baseAt: 2000, restAt: 1000 });
  assert.equal(merged.find((g) => g.internalCode === "6534")?.sellPrice, 1000);
});

test("missing timestamps mean fill-only, never override", () => {
  const rest = [good({ id: "r-f3", internalCode: "6534", persianTitle: "شربت پدیاکید", sellPrice: 1500 })];
  assert.equal(mergeRestComplement(base, rest).find((g) => g.internalCode === "6534")?.sellPrice, 1000);
  assert.equal(mergeRestComplement(base, rest, { restAt: 9999 }).find((g) => g.internalCode === "6534")?.sellPrice, 1000);
});

test("title-only match is never price-swapped, even when REST is fresher", () => {
  const rest = [good({ id: "r-f4", internalCode: "424242", persianTitle: "قرص استامینوفن", sellPrice: 9999 })];
  const merged = mergeRestComplement(base, rest, { baseAt: 1000, restAt: 2000 });
  assert.equal(merged.find((g) => g.internalCode === "111")?.sellPrice, 2000);
  assert.equal(merged.length, 2, "title-matched REST item is not appended either");
});

test("a fresher REST price of 0 never erases a real primary price", () => {
  const rest = [good({ id: "r-f5", internalCode: "6534", persianTitle: "شربت پدیاکید", sellPrice: 0 })];
  const merged = mergeRestComplement(base, rest, { baseAt: 1000, restAt: 2000 });
  assert.equal(merged.find((g) => g.internalCode === "6534")?.sellPrice, 1000);
});

test("duplicate REST codes are disambiguated by title before any price swap", () => {
  // Vendor reality: two REST records share one code with different prices.
  const rest = [
    good({ id: "r-d1", internalCode: "111", persianTitle: "محصول دیگر", sellPrice: 555 }),
    good({ id: "r-d2", internalCode: "111", persianTitle: "قرص استامینوفن", sellPrice: 777 }),
  ];
  const merged = mergeRestComplement(base, rest, { baseAt: 1000, restAt: 2000 });
  assert.equal(merged.find((g) => g.internalCode === "111")?.sellPrice, 777,
    "the title-matching candidate must win over the first candidate");
});

test("duplicate REST codes with no title match fall back to the first candidate", () => {
  const rest = [
    good({ id: "r-d3", internalCode: "111", persianTitle: "نام الف", sellPrice: 555 }),
    good({ id: "r-d4", internalCode: "111", persianTitle: "نام ب", sellPrice: 777 }),
  ];
  const merged = mergeRestComplement(base, rest, { baseAt: 1000, restAt: 2000 });
  assert.equal(merged.find((g) => g.internalCode === "111")?.sellPrice, 555);
});

test("sanitize cleans sources ELEMENTS — [null] can never reach toPatientSource", () => {
  const cleaned = sanitizeRestGoods([{
    id: "r-3", internalCode: "888006", persianTitle: "کالای منبع‌دار",
    sources: [null, 42, { key: "qanoon", label: "Qanoon", role: "pricing", priority: 1 }],
  }]);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].sources.length, 1);
  assert.equal(cleaned[0].sources[0].key, "qanoon");
  assert.doesNotThrow(() => cleaned[0].sources.map((s) => s.key));
});

test("sanitize preserves the producer's crawledAt stamp and tempPrice", () => {
  const cleaned = sanitizeRestGoods([{
    id: "r-4", internalCode: "888007", persianTitle: "کالای تازه",
    crawledAt: "2026-11-17T06:24:36+0000", tempPrice: 123,
  }]);
  assert.equal(cleaned[0].crawledAt, "2026-11-17T06:24:36+0000");
  assert.equal(cleaned[0].tempPrice, 123);
});

test("sanitize drops non-string aliases and mistyped fields instead of passing them through", () => {
  const cleaned = sanitizeRestGoods([{
    id: "r-2", internalCode: "888", persianTitle: "کالا",
    aliases: ["معتبر", 42, null, { x: 1 }], sellPrice: "not-a-number",
    activeStatus: "bogus", sources: "nope",
  }]);
  assert.equal(cleaned.length, 1);
  assert.deepEqual(cleaned[0].aliases, ["معتبر"]);
  assert.equal(cleaned[0].sellPrice, 0);
  assert.equal(cleaned[0].activeStatus, undefined);
  assert.deepEqual(cleaned[0].sources, []);
});

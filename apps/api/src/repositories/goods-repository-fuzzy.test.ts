import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchableEntry,
  exactSearchEntries,
  searchFuzzyEntries
} from "./goods-repository.ts";
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
    ...partial
  } as Good;
}

// Synthetic catalog mirroring the real Qanun shapes behind the Prime
// R2-3/R2-4 classes (cetirizine spellings, aspirin/aseptine, forms).
const catalog: Good[] = [
  good({
    id: "cet-syrup",
    persianTitle: "ستیریزین 5میلیگرم/5میلیلیتر 60میلیلیتر ( عبیدی ) - شربت",
    title: "CETIRIZINE 5MG/5ML 60ML ( ABIDI ) - SYRUP",
    englishTitle: "CETIRIZINE 5MG/5ML 60ML ( ABIDI ) - SYRUP",
    aliases: ["ستیریزین 5میلیگرم/5میلیلیتر 60میلیلیتر ( عبیدی ) - شربت", "cetirizine 5mg/5ml 60ml ( abidi ) - syrup"],
    dosageForm: "syrup",
    unitLabel: "syrup",
    strengthLabel: "5MG",
    sellPrice: 1000000
  }),
  good({
    id: "cet-tab",
    persianTitle: "ستیریزین 10میلیگرم ( عبیدی ) - قرص",
    title: "CETIRIZINE 10MG ( ABIDI ) - TABLET",
    englishTitle: "CETIRIZINE 10MG ( ABIDI ) - TABLET",
    aliases: ["ستیریزین 10میلیگرم ( عبیدی ) - قرص"],
    dosageForm: "tablet",
    unitLabel: "tablet",
    strengthLabel: "10MG",
    sellPrice: 23000
  }),
  good({
    id: "cet-cap",
    persianTitle: "ستریزین 10میلیگرم ( آلراژل ) - کپسول",
    title: "CETIRIZINE 10MG ( ALERAGEL ) - CAPSULE",
    englishTitle: "CETIRIZINE 10MG ( ALERAGEL ) - CAPSULE",
    aliases: ["ستریزین 10میلیگرم ( آلراژل ) - کپسول"],
    dosageForm: "capsule",
    unitLabel: "capsule",
    strengthLabel: "10MG",
    sellPrice: 40000
  }),
  good({
    id: "aseptine",
    persianTitle: "سپتی بادی 140میلیلیتر ( آسپتین ) - دوش واژینال",
    title: "SEPTIBODY 140ML ( ASEPTINE ) - VAGINAL DOUCHE",
    englishTitle: "SEPTIBODY 140ML ( ASEPTINE ) - VAGINAL DOUCHE",
    aliases: ["سپتی بادی 140میلیلیتر ( آسپتین ) - دوش واژینال"],
    sellPrice: 500000
  }),
  good({
    id: "asa-tab",
    persianTitle: "آ.اس.آ 80میلیگرم ( آسپریمکس ) - قرص",
    title: "ASA 80MG ( ASPRIMEX ) - TABLET",
    englishTitle: "ASA 80MG ( ASPRIMEX ) - TABLET",
    aliases: ["آ.اس.آ 80میلیگرم ( آسپریمکس ) - قرص"],
    dosageForm: "tablet",
    unitLabel: "tablet",
    strengthLabel: "80MG",
    sellPrice: 15000
  }),
  good({
    id: "los-tab",
    persianTitle: "لوزارتان 50میلیگرم - قرص",
    title: "LOSARTAN 50MG - TABLET",
    englishTitle: "LOSARTAN 50MG - TABLET",
    aliases: ["لوزارتان 50میلیگرم - قرص"],
    dosageForm: "tablet",
    unitLabel: "tablet",
    strengthLabel: "50MG",
    sellPrice: 96000
  }),
  good({
    id: "ibu-tab",
    persianTitle: "ایبوپروفن 400میلیگرم - قرص",
    title: "IBUPROFEN 400MG - TABLET",
    englishTitle: "IBUPROFEN 400MG - TABLET",
    aliases: ["ایبوپروفن 400میلیگرم - قرص"],
    dosageForm: "tablet",
    unitLabel: "tablet",
    strengthLabel: "400MG",
    sellPrice: 30000
  }),
  good({
    id: "amox-cap",
    persianTitle: "آموکسی سیلین 500میلیگرم - کپسول",
    title: "AMOXICILLIN 500MG - CAPSULE",
    englishTitle: "AMOXICILLIN 500MG - CAPSULE",
    aliases: ["آموکسی سیلین 500میلیگرم - کپسول", "amoxicillin 500mg - capsule"],
    dosageForm: "capsule",
    unitLabel: "capsule",
    strengthLabel: "500MG",
    sellPrice: 185000
  }),
  good({
    id: "acet-tab",
    persianTitle: "استامینوفن 500میلیگرم - قرص",
    title: "ACETAMINOPHEN 500MG - TABLET",
    englishTitle: "ACETAMINOPHEN 500MG - TABLET",
    aliases: ["استامینوفن 500میلیگرم - قرص"],
    dosageForm: "tablet",
    unitLabel: "tablet",
    strengthLabel: "500MG",
    sellPrice: 27000
  })
];
const entries = catalog.map(buildSearchableEntry);
const ids = (goods: Good[]) => goods.map((g) => g.id).sort();

// --- Exact tier purity (R2-4): fuzz no longer lives in the exact path ---

test("exact tier: the cetirizine typo no longer returns the wrong neighbour as an exact hit", () => {
  // Before F2 this returned [cet-cap] — a different form at a different
  // price, presented as the answer. Now the exact tier is honest: zero.
  assert.deepEqual(ids(exactSearchEntries(entries, "سیتریزین")), []);
});

test("exact tier: aspirin does not leak to the aseptine douche", () => {
  const hits = ids(exactSearchEntries(entries, "آسپرین"));
  assert.ok(!hits.includes("aseptine"), `aseptine leaked into exact results: ${hits}`);
});

test("exact tier: joined spelling matches the two-token catalog name (concat)", () => {
  assert.deepEqual(ids(exactSearchEntries(entries, "آموکسیسیلین")), ["amox-cap"]);
  assert.deepEqual(ids(exactSearchEntries(entries, "آموکسی‌سیلین")), ["amox-cap"]);
  assert.deepEqual(ids(exactSearchEntries(entries, "آموکسی سیلین")), ["amox-cap"]);
});

// --- Guarded fuzzy tier (R2-3) ---

test("fuzzy: transposed losartan resolves, unambiguous, with the correction named", () => {
  const { goods, fuzzy } = searchFuzzyEntries(entries, "لوزاتران");
  assert.deepEqual(ids(goods), ["los-tab"]);
  assert.equal(fuzzy?.ambiguous, false);
  assert.equal(fuzzy?.matchedTerm, "لوزارتان");
});

test("fuzzy: transposed ibuprofen resolves", () => {
  const { goods, fuzzy } = searchFuzzyEntries(entries, "ایبوپورفن");
  assert.deepEqual(ids(goods), ["ibu-tab"]);
  assert.equal(fuzzy?.ambiguous, false);
});

test("fuzzy: cetirizine typo surfaces BOTH spellings and flags ambiguity — never one silent price", () => {
  const { goods, fuzzy } = searchFuzzyEntries(entries, "سیتریزین");
  assert.deepEqual(ids(goods), ["cet-cap", "cet-syrup", "cet-tab"]);
  assert.equal(fuzzy?.ambiguous, true);
  assert.equal(fuzzy?.matchedTerm, null);
});

test("fuzzy form guard: «شربت سیتریزین» resolves to the cetirizine syrups only, unambiguous", () => {
  const { goods, fuzzy } = searchFuzzyEntries(entries, "شربت سیتریزین");
  assert.deepEqual(ids(goods), ["cet-syrup"]);
  assert.equal(fuzzy?.ambiguous, false);
  assert.equal(fuzzy?.matchedTerm, "ستیریزین");
});

test("fuzzy strength guard: a stated strength that no candidate carries kills the match", () => {
  // Losartan exists only at 50mg in this catalog; «لوزاتران 25» must not
  // borrow the 50mg price.
  const { goods } = searchFuzzyEntries(entries, "لوزاتران 25");
  assert.deepEqual(goods, []);
});

test("fuzzy: «آسپرین» lists the aseptine neighbour ONLY as an ambiguous suggestion, never a named correction", () => {
  // آسپتین exists in the catalog only as a brand — it never heads a
  // title — so the correction is not confident enough to name. The
  // patient sees labeled suggestions with full product names, not a
  // price presented as aspirin's.
  const { goods, fuzzy } = searchFuzzyEntries(entries, "آسپرین");
  assert.ok(ids(goods).includes("aseptine"));
  assert.equal(fuzzy?.ambiguous, true);
  assert.equal(fuzzy?.matchedTerm, null);
});

test("fuzzy strength guard: «آسپرین 80» never lands on the 140ml aseptine douche", () => {
  const { goods } = searchFuzzyEntries(entries, "آسپرین 80");
  assert.ok(!ids(goods).includes("aseptine"));
});

test("fuzzy: an exactly-spelled query is not a fuzzy result (exact tier owns it)", () => {
  const { goods, fuzzy } = searchFuzzyEntries(entries, "لوزارتان");
  assert.deepEqual(goods, []);
  assert.equal(fuzzy, null);
});

test("fuzzy: distance-two typos stay out — honest zero beats a guessed price", () => {
  const { goods } = searchFuzzyEntries(entries, "تسامینوفن");
  assert.deepEqual(goods, []);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  searchCatalog,
  resolveItem,
  normalizeDigits,
  normalizeText,
  normalizeCodeString,
  createCatalogResolver,
  CatalogResolver,
} from "../src/catalog-resolver.js";

test("CR_01: String preservation of leading zeroes on genericCode and brandCode", () => {
  const results = searchCatalog("00001");
  assert.ok(results.length > 0, "Should return results for 00001");
  const item = results[0];
  assert.strictEqual(typeof item.genericCode, "string", "genericCode must be string");
  assert.strictEqual(item.genericCode, "00001", "genericCode must strictly preserve leading zeroes");
  assert.strictEqual(typeof item.brandCode, "string", "brandCode must be string");
  assert.strictEqual(item.brandCode, "00001", "brandCode must strictly preserve leading zeroes");
  assert.strictEqual(item.score, 1.0, "Exact code match must receive score 1.0");
});

test("CR_02: String preservation for secondary zero-padded codes", () => {
  const testCodes = ["08234", "00025", "00115", "00999"];
  for (const code of testCodes) {
    const results = searchCatalog(code);
    assert.ok(results.length > 0, `Should return results for ${code}`);
    const match = results.find((r) => r.genericCode === code);
    assert.ok(match, `Should find candidate with genericCode ${code}`);
    assert.strictEqual(typeof match.genericCode, "string");
    assert.strictEqual(match.genericCode, code);
    assert.strictEqual(match.genericCode.length, 5);
  }
});

test("CR_03: Persian and Arabic numeral transliteration preserving leading zeroes", () => {
  assert.strictEqual(normalizeDigits("۰۰۰۰۱"), "00001");
  assert.strictEqual(normalizeDigits("۰۸۲۳۴"), "08234");
  assert.strictEqual(normalizeDigits("٠٠٠٢٥"), "00025"); // Arabic-Indic digits

  const results = searchCatalog("۰۰۰۰۱");
  assert.ok(results.length > 0);
  assert.strictEqual(results[0].genericCode, "00001");
  assert.strictEqual(typeof results[0].genericCode, "string");
  assert.strictEqual(results[0].score, 1.0);
});

test("CR_04: Persian text normalization with ZWNJ (half-space)", () => {
  const norm1 = normalizeText("میلی‌گرم"); // with ZWNJ \u200c
  const norm2 = normalizeText("میلی گرم");  // with space
  assert.strictEqual(norm1, norm2, "ZWNJ must normalize to standard spacing");

  const results = searchCatalog("میلی‌گرم");
  assert.ok(results.length > 0, "Should match items regardless of ZWNJ");
});

test("CR_05: Arabic/Persian character equivalence (Yeh/Keheh)", () => {
  const normArabic = normalizeText("آموكسي سيلين"); // Arabic Keheh \u0643 and Arabic Yeh \u064A
  const normPersian = normalizeText("آموکسی سیلین"); // Persian Keheh \u06A9 and Persian Yeh \u06CC
  assert.strictEqual(normArabic, normPersian, "Arabic and Persian characters must normalize to identical string");

  const results = searchCatalog("آموكسي");
  assert.ok(results.length > 0, "Arabic keyboard input should find Persian records");
  assert.strictEqual(results[0].genericCode, "00001");
});

test("CR_06: Multi-token attribute ranking with dosage form and strength boost", () => {
  const fullSearch = searchCatalog("کپسول آموکسی سیلین ۵۰۰");
  const partialSearch = searchCatalog("قرص ۵۰۰");

  assert.ok(fullSearch.length > 0);
  assert.ok(partialSearch.length > 0);

  const fullScore = fullSearch[0].score;
  assert.ok(fullScore >= 0.85, "Multi-attribute matching tokens should yield high score");
  assert.strictEqual(fullSearch[0].genericCode, "00001");
});

test("CR_07: Alias resolution", () => {
  const ampiSearch = searchCatalog("آمپیسیلین");
  assert.ok(ampiSearch.length > 0);
  assert.strictEqual(ampiSearch[0].genericCode, "00001");

  const amoxSearch = searchCatalog("آموکسی");
  assert.ok(amoxSearch.length > 0);
  assert.strictEqual(amoxSearch[0].genericCode, "00001");
});

test("CR_08: Custom catalog injection via options and class", () => {
  const customItems = [
    {
      genericCode: "00777",
      brandCode: "00077",
      title: "داروی سفارشی تست",
      dosageForm: "قطره",
      strength: "10 ml",
      aliases: ["تست"],
    },
  ];

  const functionalResults = searchCatalog("00777", { catalog: customItems });
  assert.strictEqual(functionalResults.length, 1);
  assert.strictEqual(functionalResults[0].genericCode, "00777");

  const resolver = createCatalogResolver({ catalog: customItems });
  assert.ok(resolver instanceof CatalogResolver);
  const classResults = resolver.searchCatalog("تست");
  assert.strictEqual(classResults.length, 1);
  assert.strictEqual(classResults[0].genericCode, "00777");
});

test("CR_09: Disambiguation evaluation in resolveItem", () => {
  const ambiguousCatalog = [
    {
      genericCode: "00001",
      brandCode: "00001",
      title: "Amoxicillin 500mg Capsule",
      dosageForm: "کپسول",
      strength: "500 mg",
      aliases: ["آموکسی"],
    },
    {
      genericCode: "00002",
      brandCode: "00001",
      title: "Amoxicillin 250mg Capsule",
      dosageForm: "کپسول",
      strength: "250 mg",
      aliases: ["آموکسی"],
    },
  ];

  const resolution = resolveItem("آموکسی", null, { catalog: ambiguousCatalog });
  assert.strictEqual(resolution.resolved, false, "Close competing candidates must not be auto-resolved");
  assert.strictEqual(resolution.confidence, "medium");
  assert.strictEqual(resolution.isAmbiguous, true, "Must be flagged as ambiguous");
  assert.strictEqual(resolution.candidates.length, 2);
  assert.ok(resolution.bestMatch);
  assert.ok(resolution.suggestedReference);
});

test("CR_10: High-confidence resolution in resolveItem for exact code", () => {
  const resolution = resolveItem("00001");
  assert.strictEqual(resolution.resolved, true, "Exact code query must resolve with high confidence");
  assert.strictEqual(resolution.confidence, "high");
  assert.strictEqual(resolution.isAmbiguous, false);
  assert.ok(resolution.bestMatch);
  assert.strictEqual(resolution.bestMatch.genericCode, "00001");
  assert.strictEqual(typeof resolution.bestMatch.genericCode, "string");
  assert.strictEqual(resolution.suggestedReference.genericCode, "00001");
  assert.strictEqual(typeof resolution.suggestedReference.genericCode, "string");
});

test("CR_11: Alef normalization variants across Arabic/Persian forms ([آأإٱ] -> ا)", () => {
  assert.strictEqual(normalizeText("آموکسی"), normalizeText("اموکسی"));
  assert.strictEqual(normalizeText("استامینوفن"), normalizeText("آستامینوفن"));
  const r1 = searchCatalog("اموکسی");
  assert.ok(r1.length > 0, "اموکسی must resolve to Amoxicillin");
  assert.strictEqual(r1[0].genericCode, "00001");
  const r2 = searchCatalog("آستامینوفن");
  assert.ok(r2.length > 0, "آستامینوفن must resolve to Acetaminophen");
  assert.strictEqual(r2[0].genericCode, "00025");
});

test("CR_12: Dosage-form specific clinical query does not match Educational Sample Vial (M2-C2-01)", () => {
  const hits = searchCatalog("ویال سفتریاکسون ۱ گرم");
  assert.strictEqual(hits.some((h) => h.goodId === "g-1007" || h.genericCode === "14083"), false, "Must not match Educational Sample Vial");
  const res = resolveItem("ویال سفتریاکسون ۱ گرم");
  assert.notStrictEqual(res.suggestedReference?.goodId, "g-1007");
});

test("CR_13: Formulation-only query does not trigger false positive matches on unrelated active ingredients", () => {
  const ketotifenHits = searchCatalog("شربت کتوتیفن");
  assert.strictEqual(ketotifenHits.some((h) => h.goodId === "g-1002-diphen" || h.goodId === "g-1004"), false);
  const hydroHits = searchCatalog("کرم هیدروکورتیزون");
  assert.strictEqual(hydroHits.some((h) => h.goodId === "g-1002"), false);
});

test("CR_14: Status placeholder words do not match Out of Stock Item (M2-C2-02)", () => {
  const hits = searchCatalog("سفتریاکسون ناموجود");
  assert.strictEqual(hits.some((h) => h.goodId === "g-1006"), false);
  const outOfStockHits = searchCatalog("داروی ناموجود");
  assert.ok(outOfStockHits.length > 0);
  assert.strictEqual(outOfStockHits[0].goodId, "g-1006");
});

test("CR_15: Legitimate drug and sample aliases remain fully functional", () => {
  const sampleVialHits = searchCatalog("sample vial");
  assert.ok(sampleVialHits.length > 0);
  assert.strictEqual(sampleVialHits[0].goodId, "g-1007");
  assert.ok(sampleVialHits[0].score >= 0.95);
});

test("CR_16: Punctuation-only queries reject all matches and return empty array", () => {
  for (const p of [",", "-", "--", ";", ":", "()", "\u200c"]) {
    const hits = searchCatalog(p);
    assert.strictEqual(hits.length, 0, `Punctuation '${p}' must return 0 hits`);
    const res = resolveItem(p);
    assert.strictEqual(res.resolved, false, `Punctuation '${p}' must not resolve`);
  }
});

test("CR_17: Isolated units and pure dosages reject false-positive candidate resolution", () => {
  for (const u of ["mg", "ml", "واحد", "۵۰۰ میلی گرم", "500 mg"]) {
    const hits = searchCatalog(u);
    assert.strictEqual(hits.length, 0, `Isolated unit/dosage '${u}' must yield 0 hits`);
    const res = resolveItem(u);
    assert.strictEqual(res.suggestedReference, null, `Isolated unit/dosage '${u}' must not suggest reference`);
    assert.strictEqual(res.resolved, false);
  }
});

test("CR_18: Standalone dosage forms do not auto-resolve to specific medicines", () => {
  for (const form of ["ویال", "شربت", "کرم", "قرص", "کپسول", "cream", "vial"]) {
    const res = resolveItem(form);
    assert.strictEqual(res.resolved, false, `Standalone dosage form '${form}' must not auto-resolve`);
  }
});

test("CR_19: Inventory status phrases do not match Out of Stock Item unless canonical title/alias", () => {
  for (const q of ["سفتریاکسون ناموجود", "دارو ناموجود", "ceftriaxone out of stock", "item out of stock"]) {
    const hits = searchCatalog(q);
    assert.strictEqual(hits.some((h) => h.goodId === "g-1006"), false, `Query '${q}' must not match g-1006`);
  }
  const legitimateTitle = searchCatalog("out of stock item");
  assert.ok(legitimateTitle.length > 0);
  assert.strictEqual(legitimateTitle[0].goodId, "g-1006");

  const legitimateAlias = searchCatalog("داروی ناموجود");
  assert.ok(legitimateAlias.length > 0);
  assert.strictEqual(legitimateAlias[0].goodId, "g-1006");
});

test("CR_20: Dual genericCode and brandCode match takes precedence over genericCode-only tie for 08234", () => {
  const hits = searchCatalog("08234");
  assert.ok(hits.length > 0);
  assert.strictEqual(hits[0].goodId, "g-1002-diphen");
  assert.strictEqual(hits[0].genericCode, "08234");
  assert.strictEqual(hits[0].score, 1.0);
});

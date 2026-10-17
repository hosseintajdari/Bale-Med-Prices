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

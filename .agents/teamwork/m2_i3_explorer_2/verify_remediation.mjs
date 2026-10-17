import assert from "node:assert/strict";
import {
  searchCatalog,
  resolveItem,
  normalizeText,
  scoreCandidate,
  BUILTIN_REFERENCE_ITEMS
} from "/tmp/catalog-resolver-mod.js";

console.log("=== VERIFYING CATALOG RESOLVER REMEDIATION ===");

// 1. Punctuation Queries
console.log("\n1. Testing Punctuation Queries:");
const punctuationQueries = [",", "-", ";", ".", "!", "   ,   ", "...", "،", "؛", "؟", " \t \n , ; - \r "];
for (const q of punctuationQueries) {
  const hits = searchCatalog(q);
  const res = resolveItem(q);
  assert.strictEqual(hits.length, 0, `Query "${q}" must yield 0 hits, got ${hits.length}`);
  assert.strictEqual(res.resolved, false, `Query "${q}" must not be resolved`);
  assert.strictEqual(res.confidence, "none", `Query "${q}" confidence must be none`);
  assert.strictEqual(res.suggestedReference, null, `Query "${q}" must have no suggestedReference`);
  console.log(`  PASS: Punctuation query "${q.trim() || q}" cleanly rejected`);
}

// 2. Isolated Units, Dosages, Forms, and Statuses
console.log("\n2. Testing Isolated Generic Queries:");
const genericQueries = [
  "mg", "ml", "واحد", "ویال", "شربت", "کرم", "قرص", "کپسول", "ناموجود",
  "۵۰۰ میلی گرم", "500 mg", "120 ml", "1000 iu", "1 g"
];
for (const q of genericQueries) {
  const hits = searchCatalog(q);
  const res = resolveItem(q);
  assert.strictEqual(hits.length, 0, `Generic query "${q}" must yield 0 hits, got ${hits.length} (${hits[0]?.title})`);
  assert.strictEqual(res.suggestedReference, null, `Generic query "${q}" must not have suggestedReference, got "${res.suggestedReference?.title}"`);
  console.log(`  PASS: Generic query "${q}" cleanly rejected (0 hits, null suggestedReference)`);
}

// 3. Legitimate Code Queries
console.log("\n3. Testing Code Queries:");
const codeQueries = [
  { q: "00001", expectedGeneric: "00001", minScore: 1.0 },
  { q: "08234", expectedGeneric: "08234", minScore: 1.0 },
  { q: "00025", expectedGeneric: "00025", minScore: 1.0 },
  { q: "00115", expectedGeneric: "00115", minScore: 1.0 },
  { q: "00999", expectedGeneric: "00999", minScore: 1.0 },
  { q: "۰۰۰۰۱", expectedGeneric: "00001", minScore: 1.0 },
];
for (const { q, expectedGeneric, minScore } of codeQueries) {
  const hits = searchCatalog(q);
  const res = resolveItem(q);
  assert.ok(hits.length > 0, `Code query "${q}" must return results`);
  assert.strictEqual(hits[0].genericCode, expectedGeneric, `Code query "${q}" genericCode must be ${expectedGeneric}`);
  assert.ok(hits[0].score >= minScore, `Code query "${q}" score must be >= ${minScore}`);
  if (q === "08234") {
    assert.strictEqual(res.isAmbiguous, true, "08234 must be ambiguous due to multiple brand items");
  } else {
    assert.strictEqual(res.resolved, true, `Code query "${q}" must be resolved`);
  }
  console.log(`  PASS: Code query "${q}" matched ${expectedGeneric} with score ${hits[0].score}`);
}

// 4. Legitimate Clinical and Text Queries
console.log("\n4. Testing Legitimate Text Queries:");
const textQueries = [
  { q: "آموکسی", expectedGoodId: "g-1001" },
  { q: "اموکسی", expectedGoodId: "g-1001" },
  { q: "أموكسي", expectedGoodId: "g-1001" },
  { q: "آستامینوفن", expectedGeneric: "00025" },
  { q: "استامینوفن", expectedGeneric: "00025" },
  { q: "کرم محافظ بزرگسال", expectedGoodId: "g-1002" },
  { q: "sample vial", expectedGoodId: "g-1007" },
  { q: "داروی ناموجود", expectedGoodId: "g-1006" },
  { q: "کپسول آموکسی سیلین ۵۰۰", expectedGoodId: "g-1001" },
];
for (const t of textQueries) {
  const hits = searchCatalog(t.q);
  assert.ok(hits.length > 0, `Text query "${t.q}" must return results`);
  if (t.expectedGoodId) {
    assert.strictEqual(hits[0].goodId, t.expectedGoodId, `Text query "${t.q}" must match goodId ${t.expectedGoodId}`);
  }
  if (t.expectedGeneric) {
    assert.strictEqual(hits[0].genericCode, t.expectedGeneric, `Text query "${t.q}" must match genericCode ${t.expectedGeneric}`);
  }
  console.log(`  PASS: Text query "${t.q}" resolved to ${hits[0].title} (score: ${hits[0].score})`);
}

// 5. Compound Clinical Formulation Queries (Negative match checks)
console.log("\n5. Testing Negative Formulation / Status Matching:");
const ceftHits = searchCatalog("ویال سفتریاکسون ۱ گرم");
assert.strictEqual(ceftHits.some(h => h.goodId === "g-1007"), false, "Must not match Educational Sample Vial");
console.log("  PASS: 'ویال سفتریاکسون ۱ گرم' rejects Educational Sample Vial");

const ketoHits = searchCatalog("شربت کتوتیفن");
assert.strictEqual(ketoHits.some(h => h.goodId === "g-1002-diphen" || h.goodId === "g-1004"), false, "Must not match unrelated syrups");
console.log("  PASS: 'شربت کتوتیفن' rejects Cough Syrup / Diphenhydramine");

const hydroHits = searchCatalog("کرم هیدروکورتیزون");
assert.strictEqual(hydroHits.some(h => h.goodId === "g-1002"), false, "Must not match Adult Protective Cream");
console.log("  PASS: 'کرم هیدروکورتیزون' rejects Adult Protective Cream");

const oosHits = searchCatalog("سفتریاکسون ناموجود");
assert.strictEqual(oosHits.some(h => h.goodId === "g-1006"), false, "Must not match Out of Stock Item");
console.log("  PASS: 'سفتریاکسون ناموجود' rejects Out of Stock Item");

console.log("\n>>> ALL 28 ADVERSARIAL AND CLINICAL CHECKS PASSED ON PATCHED RESOLVER <<<");

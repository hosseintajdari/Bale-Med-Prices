import test from "node:test";
import assert from "node:assert/strict";
import {
  damerauWithinOne,
  isFuzzyCandidate,
  isHardToken,
  formKeysOfTokens,
  formCorrectionFor,
  isIdentityToken
} from "./fuzzy-match.ts";

// F2 guarded fuzzy — Prime R2-3/R2-4 regression battery (pure layer).
// A wrong price is worse than "not found": every positive below is a
// distance-1 typo of a REAL catalog token; every negative is a leak class.

test("damerauWithinOne: adjacent transposition counts as one edit (R2-3 class)", () => {
  // The live cetirizine error class: ی/ت swapped inside the word.
  assert.equal(damerauWithinOne("سیتریزین", "ستیریزین"), true);
  assert.equal(damerauWithinOne("لوزاتران", "لوزارتان"), true);
  assert.equal(damerauWithinOne("ایبوپورفن", "ایبوپروفن"), true);
});

test("damerauWithinOne: single substitution / insertion / deletion count as one edit", () => {
  assert.equal(damerauWithinOne("متفرمین", "متفورمین"), true); // deletion (already worked)
  assert.equal(damerauWithinOne("گلوکفوژ", "گلوکوفاژ"), false); // insertion + substitution = 2
  assert.equal(damerauWithinOne("آفامکس", "آفاموکس"), true); // substitution
});

test("damerauWithinOne: distance two or more is rejected", () => {
  assert.equal(damerauWithinOne("تسامینوفن", "استامینوفن"), false);
  assert.equal(damerauWithinOne("امرپزول", "امپرازول"), false);
  assert.equal(damerauWithinOne("پیتزا", "استامینوفن"), false);
});

test("isFuzzyCandidate: short tokens and length gaps never fuzz", () => {
  assert.equal(isFuzzyCandidate("قرص", "قرض"), false); // < 5 chars
  assert.equal(isFuzzyCandidate("آسپرین", "آسپاراژیناز"), false); // length gap > 1
  assert.equal(isFuzzyCandidate("سیتریزین", "ستیریزین"), true);
  assert.equal(isFuzzyCandidate("سیتریزین", "ستریزین"), true); // distance 1 too — ambiguity is the caller's guard
});

test("isHardToken: strengths, doses and form words are never fuzzed", () => {
  assert.equal(isHardToken("500"), true);
  assert.equal(isHardToken("80"), true);
  assert.equal(isHardToken("mg"), true);
  assert.equal(isHardToken("قرص"), true);
  assert.equal(isHardToken("شربت"), true);
  assert.equal(isHardToken("capsule"), true);
  assert.equal(isHardToken("سیتریزین"), false);
  assert.equal(isHardToken("لوزارتان"), false);
});

test("formKeysOfTokens: Persian and English form words map to canonical keys", () => {
  assert.deepEqual(formKeysOfTokens(["شربت", "سیتریزین"]), ["syrup"]);
  assert.deepEqual(formKeysOfTokens(["قرص", "آسپرین", "80"]), ["tablet"]);
  assert.deepEqual(formKeysOfTokens(["cetirizine"]), []);
  assert.deepEqual(formKeysOfTokens(["کپسول", "امپرازول"]), ["capsule"]);
});

test("formCorrectionFor: a mistyped form word resolves inside the closed form vocabulary only", () => {
  assert.equal(formCorrectionFor("قرث"), "tablet"); // قرص mistyped — one family, safe
  assert.equal(formCorrectionFor("قرص"), null); // already a form word, nothing to correct
  assert.equal(formCorrectionFor("سیتریزین"), null); // identity typo — not a form correction
  assert.equal(formCorrectionFor("لوزاتران"), null);
});

test("isIdentityToken: form/unit/number tokens carry no product identity", () => {
  assert.equal(isIdentityToken("شربت"), false);
  assert.equal(isIdentityToken("60"), false);
  assert.equal(isIdentityToken("عددی"), false);
  assert.equal(isIdentityToken("mg"), false);
  assert.equal(isIdentityToken("سیتریزین"), true);
  assert.equal(isIdentityToken("lafarrerr"), true);
});

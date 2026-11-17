import test from "node:test";
import assert from "node:assert/strict";
import { goodsRepository, fuzzyTokenMatch, hasExactTokenMatch } from "./goods-repository.ts";

test("a joined ZWNJ-less query finds the split catalog name", () => {
  // The catalog writes «آموکسی سیلین» (split); patients type it joined.
  const withAlefMadda = goodsRepository.search({ query: "آموکسیسیلین" });
  assert.ok(withAlefMadda.some((g) => g.id === "g-1001"), "joined query with آ must find amoxicillin");
  const plain = goodsRepository.search({ query: "اموکسیسیلین" });
  assert.ok(plain.some((g) => g.id === "g-1001"), "joined query without آ must find amoxicillin");
  const split = goodsRepository.search({ query: "آموکسی سیلین" });
  assert.ok(split.some((g) => g.id === "g-1001"), "the split form keeps working");
});

test("exact-token universe drives the fuzzy precedence", () => {
  assert.equal(hasExactTokenMatch("اموکسی"), true, "a real catalog token");
  assert.equal(hasExactTokenMatch("اموکسیسیلین"), true, "the joined compound is itself indexed (alias/joined form)");
  assert.equal(hasExactTokenMatch("اموکسیسیلینن"), false, "a near-miss of a real name stays fuzzy-eligible");
  assert.equal(hasExactTokenMatch("xyzناوجود"), false);
});

test("a dosage-form candidate never bridges by edit distance", () => {
  // اسپری (spray) is Levenshtein-1 from اسپرین (aspirin): without the
  // guard, every spray floods an aspirin query on Persian-rich data.
  assert.equal(fuzzyTokenMatch("اسپرین", "اسپری"), false);
  assert.equal(fuzzyTokenMatch("اسپرین", "اسپرین بینی"), true, "substring/exact paths are untouched");
  assert.equal(fuzzyTokenMatch("قرص", "قرس"), false, "short-token rule unchanged (candidate must be a form)");
  assert.equal(fuzzyTokenMatch("قرس", "قرص"), true, "a short typo may still reach a form token");
});

test("edit-distance matching is what the precedence switches off", () => {
  // اسپرین (aspirin) vs اسپتین (septin): Levenshtein 1 — a neighbour
  // drug, not a typo, once the typed token is itself a real drug name.
  assert.equal(fuzzyTokenMatch("اسپرین", "اسپتین"), true, "default keeps typo tolerance");
  assert.equal(fuzzyTokenMatch("اسپرین", "اسپتین", { editAllowed: false }), false, "strict mode blocks the neighbour");
  assert.equal(fuzzyTokenMatch("اسپرین", "اسپرین", { editAllowed: false }), true, "strict mode keeps exact");
  assert.equal(fuzzyTokenMatch("اسپرین", "قرص اسپرین ۸۰", { editAllowed: false }), true, "strict mode keeps substring");
});

test("an exact drug name does not drag in other drugs", () => {
  const results = goodsRepository.search({ query: "ایبوپروفن" });
  assert.ok(results.length > 0);
  assert.ok(results.every((g) => (g.persianTitle ?? "").includes("ایبوپروفن")));
});

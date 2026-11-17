import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUserQuery, splitCompoundQuery } from "./query-normalization.ts";

test("normalizeUserQuery strips conversational fillers, keeps the drug", () => {
  assert.equal(normalizeUserQuery("قیمت آموکسی‌سیلین چنده"), "اموکسی سیلین");
  assert.equal(normalizeUserQuery("امپرازول 20 دارین"), "امپرازول 20");
  assert.equal(normalizeUserQuery("سلام میشه قیمت قرص استامینوفن ۵۰۰ رو بگید برای من"), "قرص استامینوفن 500");
  assert.equal(normalizeUserQuery("آموکسی‌سیلین داره؟"), "اموکسی سیلین");
});

test("normalizeUserQuery drops symbol/emoji-only input to empty", () => {
  assert.equal(normalizeUserQuery("_"), "");
  assert.equal(normalizeUserQuery("%%"), "");
  assert.equal(normalizeUserQuery("😊😊😊"), "");
  assert.equal(normalizeUserQuery('"\\|;'), "");
  assert.equal(normalizeUserQuery("سلام"), "");
});

test("normalizeUserQuery leaves ordinary drug queries untouched", () => {
  assert.equal(normalizeUserQuery("آموکسی‌سیلین"), "اموکسی سیلین");
  assert.equal(normalizeUserQuery("کرم ضد آفتاب SPF50"), "کرم ضد افتاب spf 50");
  assert.equal(normalizeUserQuery("Lafarrerr"), "lafarrerr");
});

test("normalizeUserQuery caps token count and raw length", () => {
  const out = normalizeUserQuery("یک دو سه چهار پنج شش هفت هشت نه ده");
  assert.equal(out.split(" ").length, 6);
  assert.ok(normalizeUserQuery("آ".repeat(500)).length <= 100);
});

test("splitCompoundQuery splits two-drug questions only", () => {
  assert.deepEqual(splitCompoundQuery("متفورمین و لوزارتان"), ["متفورمین", "لوزارتان"]);
  assert.deepEqual(splitCompoundQuery("استامینوفن یا ایبوپروفن"), ["استامینوفن", "ایبوپروفن"]);
  assert.deepEqual(splitCompoundQuery("اموکسی سیلین"), []);
  assert.deepEqual(splitCompoundQuery("کرم ضد آفتاب"), []);
});

import test from "node:test";
import assert from "node:assert/strict";
import { botLookupService } from "./bot-lookup-service.ts";
import { selectionHistoryStore } from "./selection-history-store.ts";
import { selectionSessionStore } from "./selection-session-store.ts";

test.beforeEach(() => {
  selectionHistoryStore.resetForTest();
  selectionSessionStore.resetForTest();
});

test("botLookupService returns resolved telegram text for a single match", () => {
  const result = botLookupService.lookup({
    query: "لوزارتان",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.type, "resolved");
  assert.equal(result.goodId, "g-1003");
  assert.equal(result.copyReady, true);
  assert.match(result.text, /Losartan 50mg Tablet/);
});

test("botLookupService asks for form selection when several forms match", () => {
  const result = botLookupService.lookup({
    query: "استامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.type, "needs_form_selection");
  assert.equal(result.copyReady, true);
  assert.match(result.text, /شکل دارو را انتخاب کنید/);
  assert.ok(result.items.length > 1);
  assert.equal(result.selection.kind, "single_choice");
  assert.equal(result.selection.sessionId, "sel-1");
  assert.ok(result.selection.choices.some((choice) => choice.label === "قرص"));
  assert.ok(result.selection.choices.some((choice) => choice.label === "مطمئن نیستم"));
  assert.equal(
    result.telegram.replyMarkup.inline_keyboard[0][0].callback_data.startsWith("ms:sel-1:"),
    true
  );
});

test("botLookupService continues selection from form to strength", () => {
  const firstStep = botLookupService.lookup({
    query: "استامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const tabletChoice = firstStep.selection.choices.find((choice) => choice.label === "قرص");

  const result = botLookupService.select({
    sessionId: firstStep.sessionId,
    choiceId: tabletChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.type, "needs_strength_selection");
  assert.match(result.text, /دوز دارو را انتخاب کنید/);
  assert.ok(result.selection.choices.some((choice) => choice.label === "۵۰۰ میلی‌گرم"));
});

test("botLookupService resolves a selected strength to unit price", () => {
  const firstStep = botLookupService.lookup({
    query: "استامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const tabletChoice = firstStep.selection.choices.find((choice) => choice.label === "قرص");
  const strengthStep = botLookupService.select({
    sessionId: firstStep.sessionId,
    choiceId: tabletChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const strengthChoice = strengthStep.selection.choices.find(
    (choice) => choice.label === "۵۰۰ میلی‌گرم"
  );

  const result = botLookupService.select({
    sessionId: strengthStep.sessionId,
    choiceId: strengthChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.type, "resolved");
  assert.equal(result.goodId, "g-1006");
  assert.equal(result.copyReady, true);
  assert.match(result.text, /Acetaminophen 500mg Tablet/);
  assert.deepEqual(result.moreInfo, {
    ttacDetail: null
  });
});

test("botLookupService returns not_found for missing match", () => {
  const result = botLookupService.lookup({
    query: "zzzz-not-found",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.type, "not_found");
  assert.match(result.text, /No medicine was found/);
});

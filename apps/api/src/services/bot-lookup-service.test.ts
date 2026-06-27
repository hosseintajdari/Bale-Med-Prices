import test from "node:test";
import assert from "node:assert/strict";
import { botController } from "../controllers/bot-controller.ts";
import { botLookupService } from "./bot-lookup-service.ts";
import { selectionHistoryStore } from "./selection-history-store.ts";
import { selectionSessionStore } from "./selection-session-store.ts";

function invokeSelectController(url) {
  let body = "";
  const response = {
    statusCode: 200,
    setHeader() {},
    end(value) {
      body = value;
    }
  };

  botController.select({ url }, response);

  return {
    statusCode: response.statusCode,
    body: JSON.parse(body)
  };
}

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

test("botController select accepts Telegram callbackData with colon-separated choice ids", () => {
  const firstStep = botLookupService.lookup({
    query: "استامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const tabletButton = firstStep.telegram.replyMarkup.inline_keyboard
    .flat()
    .find((button) => button.text === "قرص");

  const result = invokeSelectController(
    `/bot/select?callbackData=${encodeURIComponent(tabletButton.callback_data)}&documentDate=2026-06-24&quantity=1&warehouseId=main&includeTechnicalFee=on`
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.type, "needs_strength_selection");
  assert.match(result.body.text, /دوز دارو را انتخاب کنید/);
  assert.ok(result.body.selection.choices.some((choice) => choice.label === "۵۰۰ میلی‌گرم"));
});

test("botController select returns patient-readable text for an expired selection", () => {
  const result = invokeSelectController(
    `/bot/select?callbackData=${encodeURIComponent("ms:sel-old:form:tablet")}&documentDate=2026-06-24&quantity=1&warehouseId=main&includeTechnicalFee=on`
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.type, "expired_selection");
  assert.match(result.body.text, /این جستجو قدیمی شده/);
});

test("botController select rejects malformed Telegram callbackData", () => {
  const result = invokeSelectController(
    `/bot/select?callbackData=${encodeURIComponent("broken-callback")}&documentDate=2026-06-24&quantity=1&warehouseId=main&includeTechnicalFee=on`
  );

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.error, "Invalid callback data");
});

test("botController select resolves form and strength callbacks to Persian unit price", () => {
  const firstStep = botLookupService.lookup({
    query: "استامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const tabletButton = firstStep.telegram.replyMarkup.inline_keyboard
    .flat()
    .find((button) => button.text === "قرص");
  const strengthStep = invokeSelectController(
    `/bot/select?callbackData=${encodeURIComponent(tabletButton.callback_data)}&documentDate=2026-06-24&quantity=1&warehouseId=main&includeTechnicalFee=on`
  ).body;
  const strengthButton = strengthStep.telegram.replyMarkup.inline_keyboard
    .flat()
    .find((button) => button.text === "۵۰۰ میلی‌گرم");

  const result = invokeSelectController(
    `/bot/select?callbackData=${encodeURIComponent(strengthButton.callback_data)}&documentDate=2026-06-24&quantity=1&warehouseId=main&includeTechnicalFee=on`
  );

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.type, "resolved");
  assert.equal(result.body.goodId, "g-1006");
  assert.match(result.body.text, /قیمت هر قرص:/);
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
    ttacDetail: {
      sourceKey: "ttac",
      sourceLabel: "TTAC",
      status: "not_loaded",
      ttacCode: "TTAC-ACET-500-TAB",
      availableActions: [
        {
          key: "view_ttac_detail",
          label: "مشاهده اطلاعات دارو در TTAC",
          status: "available"
        }
      ]
    }
  });
});

test("botLookupService reuses learned selection history across normalized query variants", () => {
  const noisyLookup = botLookupService.lookup({
    query: "اِستـامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const suppositoryChoice = noisyLookup.selection.choices.find((choice) => choice.label === "شیاف");

  const resolved = botLookupService.select({
    sessionId: noisyLookup.sessionId,
    choiceId: suppositoryChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(resolved.type, "resolved");
  assert.equal(resolved.goodId, "g-1008");

  const plainLookup = botLookupService.lookup({
    query: "استامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(plainLookup.type, "needs_form_selection");
  assert.equal(plainLookup.selection.choices[0].label, "شیاف");
});

test("botLookupService learns from direct resolved lookups after final price is shown", () => {
  assert.equal(selectionHistoryStore.getSelectionCount("لوزارتان", "g-1003"), 0);

  const directResolved = botLookupService.lookup({
    query: "لوزارتان",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(directResolved.type, "resolved");
  assert.equal(directResolved.goodId, "g-1003");
  assert.match(directResolved.text, /قیمت/);
  assert.equal(selectionHistoryStore.getSelectionCount("لوزارتان", "g-1003"), 1);
});

test("botLookupService separates route qualifiers when the dosage form is shared", () => {
  const result = botLookupService.lookup({
    query: "کلرامفنیکل قطره",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.type, "needs_form_selection");
  assert.ok(result.selection.choices.some((choice) => choice.label === "قطره چشمی"));
  assert.ok(result.selection.choices.some((choice) => choice.label === "قطره گوشی"));
  assert.ok(result.selection.choices.some((choice) => choice.label === "قطره بینی"));
});

test("botLookupService unknown-unit path keeps identity cues and hides price before resolution", () => {
  const firstStep = botLookupService.lookup({
    query: "استامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const unknownChoice = firstStep.selection.choices.find((choice) => choice.label === "مطمئن نیستم");

  const result = botLookupService.select({
    sessionId: firstStep.sessionId,
    choiceId: unknownChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.type, "needs_identity_selection");
  assert.match(result.text, /داروی مورد نظر را انتخاب کنید/);
  assert.doesNotMatch(result.text, /قیمت/);
  assert.ok(result.selection.choices.every((choice) => choice.label.includes("|")));
  assert.ok(result.selection.choices.every((choice) => choice.description));
  assert.ok(result.items.every((item) => "consumerUnitPrice" in item === false));
  assert.ok(result.items.some((item) => item.packageDescription));
});

test("botLookupService offers refine_search when more than five form choices remain", () => {
  const firstStep = botLookupService.lookup({
    query: "ایبوپروفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(firstStep.type, "needs_form_selection");
  assert.ok(firstStep.selection.choices.some((choice) => choice.label === "جستجوی دقیق‌تر"));
  assert.ok(firstStep.selection.choices.some((choice) => choice.label === "مطمئن نیستم"));
  assert.equal(firstStep.selection.choices.length, 7);

  const refineChoice = firstStep.selection.choices.find(
    (choice) => choice.label === "جستجوی دقیق‌تر"
  );
  const refined = botLookupService.select({
    sessionId: firstStep.sessionId,
    choiceId: refineChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(refined.type, "refine_search");
  assert.match(refined.text, /نام کامل‌تر دارو یا دوز را بفرستید/);
});

test("botLookupService closes the selection session after final identity resolution", () => {
  const firstStep = botLookupService.lookup({
    query: "استامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const unknownChoice = firstStep.selection.choices.find((choice) => choice.label === "مطمئن نیستم");
  const identityStep = botLookupService.select({
    sessionId: firstStep.sessionId,
    choiceId: unknownChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const chosenIdentity = identityStep.selection.choices.find((choice) =>
    choice.label.includes("۵۰۰ میلی گرم قرص")
  );

  assert.equal(selectionHistoryStore.getSelectionCount("استامینوفن", "g-1006"), 0);

  const resolved = botLookupService.select({
    sessionId: identityStep.sessionId,
    choiceId: chosenIdentity.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(resolved.type, "resolved");
  assert.equal(resolved.goodId, "g-1006");
  assert.equal(selectionHistoryStore.getSelectionCount("استامینوفن", "g-1006"), 1);

  const reused = botLookupService.select({
    sessionId: identityStep.sessionId,
    choiceId: chosenIdentity.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(reused.type, "expired_selection");
  assert.match(reused.text, /این جستجو قدیمی شده/);
  assert.equal(selectionHistoryStore.getSelectionCount("استامینوفن", "g-1006"), 1);
});

test("botLookupService does not learn from intermediate selection steps before final resolution", () => {
  const firstStep = botLookupService.lookup({
    query: "استامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(selectionHistoryStore.getSelectionCount("استامینوفن", "g-1006"), 0);

  const tabletChoice = firstStep.selection.choices.find((choice) => choice.label === "قرص");
  const strengthStep = botLookupService.select({
    sessionId: firstStep.sessionId,
    choiceId: tabletChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(strengthStep.type, "needs_strength_selection");
  assert.equal(selectionHistoryStore.getSelectionCount("استامینوفن", "g-1006"), 0);

  const unknownFirstStep = botLookupService.lookup({
    query: "استامینوفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const unknownChoice = unknownFirstStep.selection.choices.find(
    (choice) => choice.label === "مطمئن نیستم"
  );
  const identityStep = botLookupService.select({
    sessionId: unknownFirstStep.sessionId,
    choiceId: unknownChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(identityStep.type, "needs_identity_selection");
  assert.equal(selectionHistoryStore.getSelectionCount("استامینوفن", "g-1006"), 0);
});

test("botLookupService keeps unknown-unit crowded identity selection compact and price-safe", () => {
  const firstStep = botLookupService.lookup({
    query: "ایبوپروفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const unknownChoice = firstStep.selection.choices.find((choice) => choice.label === "مطمئن نیستم");

  const identityStep = botLookupService.select({
    sessionId: firstStep.sessionId,
    choiceId: unknownChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(identityStep.type, "needs_identity_selection");
  assert.ok(identityStep.selection.choices.some((choice) => choice.label === "جستجوی دقیق‌تر"));
  assert.equal(identityStep.selection.choices.length, 6);
  assert.doesNotMatch(identityStep.text, /قیمت/);
  assert.ok(identityStep.selection.choices.some((choice) => choice.label.includes("|")));
  assert.ok(identityStep.items.every((item) => "consumerUnitPrice" in item === false));
});

test("botLookupService asks for dosage form when qualifier is explicit but several forms share it", () => {
  const result = botLookupService.lookup({
    query: "کلرامفنیکل چشمی",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.type, "needs_form_selection");
  assert.ok(result.selection.choices.some((choice) => choice.label === "قطره چشمی"));
  assert.ok(result.selection.choices.some((choice) => choice.label === "پماد چشمی"));
  assert.ok(result.selection.choices.some((choice) => choice.label === "مطمئن نیستم"));
});

test("botLookupService keeps strength selection price-safe before final resolution", () => {
  const result = botLookupService.lookup({
    query: "استامینوفن قرص",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.type, "needs_strength_selection");
  assert.match(result.text, /دوز دارو را انتخاب کنید/);
  assert.doesNotMatch(result.text, /قیمت/);
  assert.ok(result.selection.choices.some((choice) => choice.label === "۵۰۰ میلی‌گرم"));
  assert.ok(result.selection.choices.some((choice) => choice.label === "۳۲۵ میلی‌گرم"));
  assert.ok(result.items.every((item) => "consumerUnitPrice" in item === false));
});

test("botLookupService refine callback works inside unknown-unit crowded identity selection", () => {
  const firstStep = botLookupService.lookup({
    query: "ایبوپروفن",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const unknownChoice = firstStep.selection.choices.find((choice) => choice.label === "مطمئن نیستم");
  const identityStep = botLookupService.select({
    sessionId: firstStep.sessionId,
    choiceId: unknownChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });
  const refineChoice = identityStep.selection.choices.find(
    (choice) => choice.label === "جستجوی دقیق‌تر"
  );

  const refined = botLookupService.select({
    sessionId: identityStep.sessionId,
    choiceId: refineChoice.id,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(refined.type, "refine_search");
  assert.match(refined.text, /نام کامل‌تر دارو یا دوز را بفرستید/);
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

import test from "node:test";
import assert from "node:assert/strict";
import { botLookupService } from "./bot-lookup-service.ts";

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

test("botLookupService asks for selection when several matches exist", () => {
  const result = botLookupService.lookup({
    query: "a",
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: true
  });

  assert.equal(result.type, "needs_selection");
  assert.equal(result.copyReady, true);
  assert.match(result.text, /Reply with one id/);
  assert.ok(result.items.length > 1);
  assert.equal(result.selection.kind, "single_choice");
  assert.equal(result.selection.choices.length, result.items.length);
  assert.equal(result.selection.choices[0].value.goodId, result.items[0].id);
  assert.equal(result.telegram.replyMarkup.inline_keyboard.length, result.items.length);
  assert.deepEqual(result.telegram.replyMarkup.inline_keyboard[0][0], {
    text: `${result.items[0].id} | ${result.items[0].title}`,
    callback_data: `select_good:${result.items[0].id}`
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

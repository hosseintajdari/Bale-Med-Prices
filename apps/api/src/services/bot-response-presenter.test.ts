import test from "node:test";
import assert from "node:assert/strict";
import { botResponsePresenter } from "./bot-response-presenter.ts";
import { formatJalaliDateFa } from "../../../../packages/domain/src/format-price.ts";

function pricingInput(extra = {}) {
  return {
    persianTitle: "آموکسی‌سیلین ۵۰۰",
    title: "Amoxicillin 500",
    unitLabel: "capsule",
    consumerUnitPrice: 450000,
    quantity: 1,
    finalConsumerPrice: 450000,
    documentDate: "2026-11-17",
    warnings: [],
    ...extra
  };
}

test("the update line shows the item's snapshot date, not the pricing date", () => {
  const { text } = botResponsePresenter.pricing(pricingInput({ crawledAt: "2026-11-10T05:27:20.711Z" }));
  const expected = formatJalaliDateFa("2026-11-10T05:27:20.711Z");
  assert.ok(text.includes(`به‌روزرسانی: ${expected}`), `expected the snapshot date in: ${text}`);
  const today = formatJalaliDateFa("2026-11-17");
  assert.ok(!text.includes(`به‌روزرسانی: ${today}`), "must not claim the price was updated on the document date");
});

test("without a snapshot time the update line falls back to the document date", () => {
  const { text } = botResponsePresenter.pricing(pricingInput());
  const expected = formatJalaliDateFa("2026-11-17");
  assert.ok(text.includes(`به‌روزرسانی: ${expected}`));
});

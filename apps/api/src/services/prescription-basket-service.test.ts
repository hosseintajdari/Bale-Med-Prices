import test from "node:test";
import assert from "node:assert/strict";
import { botController } from "../controllers/bot-controller.ts";
import { pricingService } from "./pricing-service.ts";
import {
  prescriptionBasketService,
  setPriceResolverForTest
} from "./prescription-basket-service.ts";
import { prescriptionSessionStore } from "./prescription-session-store.ts";
import { selectionHistoryStore } from "./selection-history-store.ts";
import { selectionSessionStore } from "./selection-session-store.ts";

test.beforeEach(() => {
  selectionHistoryStore.resetForTest();
  selectionSessionStore.resetForTest();
  prescriptionSessionStore.resetForTest();
  setPriceResolverForTest(null);
});

function expectedPrice(goodId) {
  const pricing = pricingService.calculate({
    goodId,
    documentDate: "2026-06-24",
    quantity: 1,
    warehouseId: "main",
    includeTechnicalFee: false
  });
  return pricing.finalConsumerPrice;
}

// Walks the suggestion-button flow: at each needs_selection step picks the
// first choice whose label contains one of the preferred fragments.
function walkSelection(basketId, firstResult, preferences) {
  let result = firstResult;

  for (let step = 0; step < 5 && result.type === "needs_selection"; step += 1) {
    const choice =
      result.choices.find((candidate) =>
        preferences.some((fragment) => candidate.label?.includes(fragment))
      ) ?? result.choices[0];

    result = prescriptionBasketService.addSelect({
      basketId,
      sessionId: result.sessionId,
      choiceId: choice.id
    });
  }

  return result;
}

test("sample Rx 1 (simple): two single-match items, exact total", () => {
  const { basketId } = prescriptionBasketService.start();

  const first = prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
  assert.equal(first.type, "added");
  assert.equal(first.item.goodId, "g-1003");

  const second = prescriptionBasketService.addQuery({ basketId, query: "آموکسی سیلین" });
  assert.equal(second.type, "added");
  assert.equal(second.item.goodId, "g-1001");

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.type, "prescription_total");
  assert.equal(finished.items.length, 2);

  const expectedTotal = expectedPrice("g-1003") + expectedPrice("g-1001");
  const actualTotal = finished.items.reduce((sum, item) => sum + item.unitPrice, 0);
  assert.equal(actualTotal, expectedTotal);
  assert.match(finished.text, /جمع کل نسخه/);
  assert.match(finished.text, /لوزارتان/);
  assert.match(finished.text, /آموکسی/);

  // Finishing closes the basket.
  assert.throws(() => prescriptionBasketService.view({ basketId }), /قدیمی شده/);
});

test("sample Rx 2 (selection flow): form and strength picked via suggestion buttons", () => {
  const { basketId } = prescriptionBasketService.start();

  const acetaminophen = walkSelection(
    basketId,
    prescriptionBasketService.addQuery({ basketId, query: "استامینوفن" }),
    ["قرص", "۵۰۰"]
  );
  assert.equal(acetaminophen.type, "added");
  assert.equal(acetaminophen.item.goodId, "g-1006");

  const ibuprofen = walkSelection(
    basketId,
    prescriptionBasketService.addQuery({ basketId, query: "ایبوپروفن" }),
    ["قرص"]
  );
  assert.equal(ibuprofen.type, "added");
  assert.equal(ibuprofen.item.goodId, "g-1012");

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.items.length, 2);
  assert.match(finished.text, /جمع کل نسخه/);
});

test("sample Rx 3: not-found item stays out; unpriced item is flagged and excluded from the total", () => {
  const { basketId } = prescriptionBasketService.start();

  const miss = prescriptionBasketService.addQuery({ basketId, query: "پیتزا" });
  assert.equal(miss.type, "not_found");
  assert.equal(miss.items.length, 0);
  assert.match(miss.text, /عکس نسخه/);

  setPriceResolverForTest((goodId) => (goodId === "g-1003" ? null : undefined));

  const unpriced = prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
  assert.equal(unpriced.type, "added");
  assert.equal(unpriced.item.unitPrice, null);

  const priced = prescriptionBasketService.addQuery({ basketId, query: "آموکسی سیلین" });
  assert.equal(priced.type, "added");
  assert.ok(priced.item.unitPrice > 0);

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.items.length, 2);
  assert.match(finished.text, /جمع اقلام قیمت‌دار/);
  assert.match(finished.text, /قیمت رسمی در دسترس نیست/);

  const totalLine = finished.items
    .filter((item) => item.unitPrice != null)
    .reduce((sum, item) => sum + item.unitPrice, 0);
  assert.equal(totalLine, expectedPrice("g-1001"));
});

test("remove drops the item and the total follows", () => {
  const { basketId } = prescriptionBasketService.start();

  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
  prescriptionBasketService.addQuery({ basketId, query: "آموکسی سیلین" });

  const afterRemove = prescriptionBasketService.remove({ basketId, index: 0 });
  assert.equal(afterRemove.items.length, 1);
  assert.equal(afterRemove.items[0].goodId, "g-1001");

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.items.length, 1);
  assert.equal(finished.items[0].unitPrice, expectedPrice("g-1001"));
});

function invokePrescription(url) {
  let body = "";
  const response = {
    statusCode: 200,
    setHeader() {},
    end(value) {
      body = value;
    }
  };

  botController.prescription({ url }, response);

  return { statusCode: response.statusCode, body: JSON.parse(body) };
}

test("HTTP surface: start → add → finish over /bot/prescription", () => {
  const started = invokePrescription("/bot/prescription?action=start");
  assert.equal(started.statusCode, 200);
  assert.equal(started.body.type, "basket_started");

  const basketId = started.body.basketId;
  const added = invokePrescription(
    `/bot/prescription?action=add&basketId=${basketId}&q=${encodeURIComponent("لوزارتان")}`
  );
  assert.equal(added.body.type, "added");

  const finished = invokePrescription(
    `/bot/prescription?action=finish&basketId=${basketId}`
  );
  assert.equal(finished.body.type, "prescription_total");
  assert.match(finished.body.text, /جمع کل نسخه/);
});

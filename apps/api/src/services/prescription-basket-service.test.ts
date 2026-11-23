import test from "node:test";
import assert from "node:assert/strict";
import { botController } from "../controllers/bot-controller.ts";
import { insuranceShares } from "./prescription-presenter.ts";
import { pricingService } from "./pricing-service.ts";
import {
  prescriptionBasketService,
  setPriceResolverForTest,
  setServiceFeeResolverForTest
} from "./prescription-basket-service.ts";
import { prescriptionSessionStore } from "./prescription-session-store.ts";
import { selectionHistoryStore } from "./selection-history-store.ts";
import { selectionSessionStore } from "./selection-session-store.ts";

// The current official tariffs (ابلاغیه تعرفه خدمات دارویی ۱۴۰۵):
// prescription dispensing 727,000 Rial per prescription; OTC /
// free-purchase management 81,000 Rial per visit. Two distinct numbers —
// the tests pin that they never mix.
const PRESCRIPTION_FEE = 727000;
const FREE_FEE = 81000;

test.beforeEach(() => {
  selectionHistoryStore.resetForTest();
  selectionSessionStore.resetForTest();
  prescriptionSessionStore.resetForTest();
  setPriceResolverForTest(null);
  setServiceFeeResolverForTest(null);
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

test("sample Rx 1 (simple): two items + prescription tariff as its own line in the total", () => {
  setServiceFeeResolverForTest((kind) =>
    kind === "prescription" ? PRESCRIPTION_FEE : FREE_FEE
  );
  const { basketId } = prescriptionBasketService.start();

  const first = prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
  assert.equal(first.type, "added");
  assert.equal(first.item.goodId, "g-1003");
  assert.ok(first.actions.some((action) => action.key === "finish"));

  const second = prescriptionBasketService.addQuery({ basketId, query: "آموکسی سیلین" });
  assert.equal(second.type, "added");

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.type, "prescription_total");
  assert.equal(finished.items.length, 2);

  const itemsTotal = expectedPrice("g-1003") + expectedPrice("g-1001");
  assert.equal(finished.totals.itemsTotal, itemsTotal);
  assert.equal(finished.totals.serviceFee, PRESCRIPTION_FEE);
  assert.equal(finished.totals.grandTotal, itemsTotal + PRESCRIPTION_FEE);
  assert.equal(finished.serviceFee.label, "تعرفه‌ی خدمات درمانی (نسخه)");
  assert.match(finished.text, /تعرفه‌ی خدمات درمانی \(نسخه\)/);
  assert.match(finished.text, /جمع کل نسخه/);
  assert.match(finished.text, /لوزارتان/);

  // Finishing closes the basket.
  assert.throws(() => prescriptionBasketService.view({ basketId }), /قدیمی شده/);
});

test("sample Rx 2 (selection flow): form and strength picked via suggestion buttons; default tariff is the official one", () => {
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

  // No seam set: the default resolver serves the official 1405 tariff.
  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.totals.serviceFee, PRESCRIPTION_FEE);
  assert.equal(
    finished.totals.grandTotal,
    finished.totals.itemsTotal + PRESCRIPTION_FEE
  );
});

test("unknown tariff (resolver returns null): the card says so and the total excludes it", () => {
  setServiceFeeResolverForTest(() => null);
  const { basketId } = prescriptionBasketService.start();

  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.totals.serviceFee, null);
  assert.equal(finished.totals.grandTotal, finished.totals.itemsTotal);
  assert.match(finished.text, /بدون تعرفه‌ی خدمات/);
});

test("sample Rx 3: not-found item stays out; unpriced item is flagged and excluded; tariff still added", () => {
  setServiceFeeResolverForTest((kind) =>
    kind === "prescription" ? PRESCRIPTION_FEE : FREE_FEE
  );
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
  assert.match(finished.text, /جمع داروهایی که قیمت دارند/);
  assert.match(finished.text, /قیمتش پیدا نشد/);
  assert.equal(finished.totals.itemsTotal, expectedPrice("g-1001"));
  assert.equal(
    finished.totals.grandTotal,
    expectedPrice("g-1001") + PRESCRIPTION_FEE
  );
});

test("free purchase: its own tariff, its own label — never the prescription number", () => {
  setServiceFeeResolverForTest((kind) =>
    kind === "prescription" ? PRESCRIPTION_FEE : FREE_FEE
  );

  const freeBasket = prescriptionBasketService.start({ kind: "free" });
  assert.equal(freeBasket.kind, "free");
  prescriptionBasketService.addQuery({
    basketId: freeBasket.basketId,
    query: "لوزارتان"
  });
  const freeFinished = prescriptionBasketService.finish({
    basketId: freeBasket.basketId
  });
  assert.equal(freeFinished.serviceFee.amount, FREE_FEE);
  assert.equal(freeFinished.serviceFee.label, "تعرفه‌ی خدمات درمانی (خرید آزاد)");
  assert.equal(
    freeFinished.totals.grandTotal,
    expectedPrice("g-1003") + FREE_FEE
  );
  assert.match(freeFinished.text, /جمع کل خرید/);

  const rxBasket = prescriptionBasketService.start();
  prescriptionBasketService.addQuery({ basketId: rxBasket.basketId, query: "لوزارتان" });
  const rxFinished = prescriptionBasketService.finish({ basketId: rxBasket.basketId });
  assert.equal(rxFinished.serviceFee.amount, PRESCRIPTION_FEE);
});

test("brand level: same substance/form/strength, two brands — the picked brand's own price lands", () => {
  const { basketId } = prescriptionBasketService.start();

  const firstStep = prescriptionBasketService.addQuery({ basketId, query: "متفورمین" });
  assert.equal(firstStep.type, "needs_selection");
  assert.ok(
    firstStep.choices.some((choice) => choice.label?.includes("الف‌دارو")) &&
      firstStep.choices.some((choice) => choice.label?.includes("ب‌دارو"))
  );

  const added = walkSelection(basketId, firstStep, ["ب‌دارو"]);
  assert.equal(added.type, "added");
  assert.equal(added.item.goodId, "g-1020");
  assert.equal(added.item.unitPrice, expectedPrice("g-1020"));
  assert.notEqual(added.item.unitPrice, expectedPrice("g-1019"));
  assert.match(added.item.title, /ب‌دارو/);
});

test("remove and removeLast drop items and the totals follow", () => {
  const { basketId } = prescriptionBasketService.start();

  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
  prescriptionBasketService.addQuery({ basketId, query: "آموکسی سیلین" });

  const afterRemoveLast = prescriptionBasketService.removeLast({ basketId });
  assert.equal(afterRemoveLast.items.length, 1);
  assert.equal(afterRemoveLast.items[0].goodId, "g-1003");

  prescriptionBasketService.addQuery({ basketId, query: "آموکسی سیلین" });
  const afterRemove = prescriptionBasketService.remove({ basketId, index: 0 });
  assert.equal(afterRemove.items.length, 1);
  assert.equal(afterRemove.items[0].goodId, "g-1001");

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.totals.itemsTotal, expectedPrice("g-1001"));
});

test("insurance shares: the IHIO worked example (generic 00020) reproduces exactly", () => {
  // mdp.ihio.gov.ir notice: 400,000 × 71.62% = 286,480 org share.
  const shares = insuranceShares({ itemsTotal: 400000, serviceFee: null, percent: 71.62 });
  assert.equal(shares.orgDrugs, 286480);
  assert.equal(shares.patientDrugs, 113520);
  assert.equal(shares.orgTotal + shares.patientTotal, 400000);
});

test("insurance shares on a basket: drugs and tariff split separately, patient takes the rest", () => {
  const { basketId } = prescriptionBasketService.start({ insurancePercent: 70 });
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });

  const finished = prescriptionBasketService.finish({ basketId });
  const itemsTotal = expectedPrice("g-1003");
  assert.equal(finished.insurance.percent, 70);
  assert.equal(finished.insurance.orgDrugs, Math.round(itemsTotal * 0.7));
  assert.equal(finished.insurance.orgFee, Math.round(PRESCRIPTION_FEE * 0.7));
  assert.equal(
    finished.insurance.orgTotal + finished.insurance.patientTotal,
    finished.totals.grandTotal
  );
  assert.match(finished.text, /سهم بیمه/);
  assert.match(finished.text, /سهم شما/);
});

test("no insurance percent → no share lines; free baskets never carry shares", () => {
  const plain = prescriptionBasketService.start();
  prescriptionBasketService.addQuery({ basketId: plain.basketId, query: "لوزارتان" });
  const plainFinished = prescriptionBasketService.finish({ basketId: plain.basketId });
  assert.equal(plainFinished.insurance, null);
  assert.doesNotMatch(plainFinished.text, /سهم بیمه/);

  const free = prescriptionBasketService.start({ kind: "free", insurancePercent: 70 });
  prescriptionBasketService.addQuery({ basketId: free.basketId, query: "لوزارتان" });
  const freeFinished = prescriptionBasketService.finish({ basketId: free.basketId });
  assert.equal(freeFinished.insurance, null);
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

test("HTTP surface: start (both kinds) → add → finish over /bot/prescription", () => {
  setServiceFeeResolverForTest((kind) =>
    kind === "prescription" ? PRESCRIPTION_FEE : FREE_FEE
  );

  const started = invokePrescription("/bot/prescription?action=start");
  assert.equal(started.statusCode, 200);
  assert.equal(started.body.type, "basket_started");
  assert.equal(started.body.kind, "prescription");

  const basketId = started.body.basketId;
  const added = invokePrescription(
    `/bot/prescription?action=add&basketId=${basketId}&q=${encodeURIComponent("لوزارتان")}`
  );
  assert.equal(added.body.type, "added");

  const finished = invokePrescription(
    `/bot/prescription?action=finish&basketId=${basketId}`
  );
  assert.equal(finished.body.type, "prescription_total");
  assert.equal(finished.body.totals.serviceFee, PRESCRIPTION_FEE);
  assert.match(finished.body.text, /جمع کل نسخه/);

  const freeStarted = invokePrescription("/bot/prescription?action=start&kind=free");
  assert.equal(freeStarted.body.kind, "free");
});

import test from "node:test";
import assert from "node:assert/strict";
import { botController } from "../controllers/bot-controller.ts";
import { insuranceShares, rowSubsidy } from "./prescription-presenter.ts";
import { pricingService } from "./pricing-service.ts";
import {
  prescriptionBasketService,
  setPriceResolverForTest,
  setServiceFeeResolverForTest,
  setSubsidyResolverForTest
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
  setSubsidyResolverForTest(null);
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

test("currency subsidy (یارانه ارزی): Qanun's per-row rule — config value capped at the unit price, times covered count", () => {
  assert.equal(rowSubsidy({ unitSubsidy: 5000, unitPrice: 42000, coveredCount: 3 }), 15000);
  // The subsidy never exceeds the item's own price.
  assert.equal(rowSubsidy({ unitSubsidy: 999999, unitPrice: 42000, coveredCount: 2 }), 84000);
  assert.equal(rowSubsidy({ unitSubsidy: null, unitPrice: 42000, coveredCount: 2 }), 0);
  assert.equal(rowSubsidy({ unitSubsidy: 5000, unitPrice: null, coveredCount: 2 }), 0);
});

test("currency subsidy in shares: outside the percent multiplication, fully on the insurer side", () => {
  // Same headline numbers as the IHIO example, but with a 50,000 subsidy
  // part: Qanun's two-channel accounting gives a different org total
  // than the blended IHIO multiplication — the documented structural
  // difference, pinned here on purpose.
  const shares = insuranceShares({
    itemsTotal: 400000,
    serviceFee: null,
    percent: 71.62,
    subsidyTotal: 50000
  });
  assert.equal(shares.subsidy, 50000);
  assert.equal(shares.orgDrugs, 250670); // round(350,000 × 71.62%)
  assert.equal(shares.orgTotal, 300670); // orgDrugs + the whole subsidy
  assert.equal(shares.patientTotal, 99330);
  assert.equal(shares.orgTotal + shares.patientTotal, 400000);
});

test("currency subsidy on a basket: item subsidy flows into the shares and the card", () => {
  setSubsidyResolverForTest((goodId) => (goodId === "g-1003" ? 20000 : null));
  const { basketId } = prescriptionBasketService.start({ insurancePercent: 70 });
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });

  const finished = prescriptionBasketService.finish({ basketId });
  const itemsTotal = expectedPrice("g-1003");
  assert.equal(finished.insurance.subsidy, 20000);
  assert.equal(
    finished.insurance.orgTotal + finished.insurance.patientTotal,
    finished.totals.grandTotal
  );
  assert.equal(
    finished.insurance.orgDrugs,
    Math.round((itemsTotal - 20000) * 0.7)
  );
  assert.match(finished.text, /یارانه ارزی/);
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

test("review: invalid resolver outputs are treated as unavailable, never as totals", () => {
  for (const badPrice of [Number.NaN, Number.POSITIVE_INFINITY, -5, 0]) {
    prescriptionSessionStore.resetForTest();
    selectionSessionStore.resetForTest();
    selectionHistoryStore.resetForTest();
    setPriceResolverForTest(() => badPrice);

    const { basketId } = prescriptionBasketService.start();
    const added = prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
    assert.equal(added.item.unitPrice, null);
    assert.equal(added.totals.itemsTotal, 0);
    assert.equal(added.totals.unpricedCount, 1);
  }

  setPriceResolverForTest(null);
  for (const badFee of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    prescriptionSessionStore.resetForTest();
    selectionSessionStore.resetForTest();
    selectionHistoryStore.resetForTest();
    setServiceFeeResolverForTest(() => badFee);

    const { basketId } = prescriptionBasketService.start();
    prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
    const finished = prescriptionBasketService.finish({ basketId });
    assert.equal(finished.totals.serviceFee, null);
    assert.equal(finished.totals.grandTotal, finished.totals.itemsTotal);
    assert.match(finished.text, /بدون تعرفه‌ی خدمات/);
  }
});

test("review: a NaN subsidy for one item does not erase a valid subsidy for another", () => {
  setSubsidyResolverForTest((goodId) =>
    goodId === "g-1003" ? Number.NaN : goodId === "g-1001" ? 5000 : null
  );
  const { basketId } = prescriptionBasketService.start({ insurancePercent: 70 });
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
  prescriptionBasketService.addQuery({ basketId, query: "آموکسی سیلین" });

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.insurance.subsidy, 5000);
  assert.equal(
    finished.insurance.orgTotal + finished.insurance.patientTotal,
    finished.totals.grandTotal
  );
  assert.equal(rowSubsidy({ unitSubsidy: Number.NaN, unitPrice: 42000 }), 0);
  assert.equal(
    rowSubsidy({ unitSubsidy: 5000, unitPrice: 42000, coveredCount: Number.NaN }),
    0
  );
});

test("review: a selection session belongs to the basket that started it", () => {
  const basketA = prescriptionBasketService.start().basketId;
  const basketB = prescriptionBasketService.start().basketId;

  const step = prescriptionBasketService.addQuery({
    basketId: basketA,
    query: "متفورمین"
  });
  assert.equal(step.type, "needs_selection");
  const brandChoice = step.choices.find((choice) =>
    choice.label?.includes("ب‌دارو")
  );

  const crossBasket = prescriptionBasketService.addSelect({
    basketId: basketB,
    sessionId: step.sessionId,
    choiceId: brandChoice.id
  });
  assert.equal(crossBasket.type, "invalid_selection");
  assert.match(crossBasket.text, /قدیمی شده/);
  assert.equal(prescriptionBasketService.view({ basketId: basketB }).items.length, 0);

  const ownBasket = prescriptionBasketService.addSelect({
    basketId: basketA,
    sessionId: step.sessionId,
    choiceId: brandChoice.id
  });
  assert.equal(ownBasket.type, "added");
  assert.equal(ownBasket.item.goodId, "g-1020");
});

test("review: an earlier selection step cannot be replayed after advancing", () => {
  const { basketId } = prescriptionBasketService.start();
  const firstStep = prescriptionBasketService.addQuery({
    basketId,
    query: "استامینوفن"
  });
  assert.equal(firstStep.type, "needs_selection");

  const formChoice = firstStep.choices[0];
  const strengthStep = prescriptionBasketService.addSelect({
    basketId,
    sessionId: firstStep.sessionId,
    choiceId: formChoice.id
  });
  assert.equal(strengthStep.type, "needs_selection");

  const replay = prescriptionBasketService.addSelect({
    basketId,
    sessionId: firstStep.sessionId,
    choiceId: formChoice.id
  });
  assert.equal(replay.type, "invalid_selection");
  assert.match(replay.text, /آخرین پیام/);

  const strengthChoice = strengthStep.choices[0];
  const added = prescriptionBasketService.addSelect({
    basketId,
    sessionId: strengthStep.sessionId,
    choiceId: strengthChoice.id
  });
  assert.equal(added.type, "added");
  assert.equal(prescriptionBasketService.view({ basketId }).items.length, 1);
});

test("review: remove without an index must not remove the first item", () => {
  const started = invokePrescription("/bot/prescription?action=start");
  const basketId = started.body.basketId;
  invokePrescription(
    `/bot/prescription?action=add&basketId=${basketId}&q=${encodeURIComponent("لوزارتان")}`
  );

  const missingIndex = invokePrescription(
    `/bot/prescription?action=remove&basketId=${basketId}`
  );
  assert.equal(missingIndex.statusCode, 400);
  assert.equal(
    prescriptionBasketService.view({ basketId }).items.length,
    1
  );
  assert.throws(
    () => prescriptionBasketService.remove({ basketId, index: null }),
    /Invalid item index/
  );
});

test("review: empty-basket removeLast and finish fail without closing the basket", () => {
  const { basketId } = prescriptionBasketService.start();

  assert.throws(
    () => prescriptionBasketService.removeLast({ basketId }),
    /سبد خالی است/
  );
  assert.throws(
    () => prescriptionBasketService.finish({ basketId }),
    /سبد خالی است/
  );
  assert.equal(prescriptionBasketService.view({ basketId }).items.length, 0);
});

test("review: insurance percent boundaries are sanitized before shares are shown", () => {
  for (const invalidPercent of [0, -1, 101, Number.NaN, "abc"]) {
    prescriptionSessionStore.resetForTest();
    selectionSessionStore.resetForTest();
    selectionHistoryStore.resetForTest();
    setPriceResolverForTest(null);
    setServiceFeeResolverForTest(null);
    setSubsidyResolverForTest(null);

    const { basketId } = prescriptionBasketService.start({
      insurancePercent: invalidPercent
    });
    prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
    const finished = prescriptionBasketService.finish({ basketId });
    assert.equal(finished.insurance, null);
    assert.doesNotMatch(finished.text, /سهم بیمه/);
  }

  const { basketId } = prescriptionBasketService.start({ insurancePercent: 100 });
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
  const fullCover = prescriptionBasketService.finish({ basketId });
  assert.equal(fullCover.insurance.patientTotal, 0);
  assert.equal(fullCover.insurance.orgTotal, fullCover.totals.grandTotal);

  const httpStarted = invokePrescription(
    "/bot/prescription?action=start&insurancePercent=101"
  );
  const httpBasketId = httpStarted.body.basketId;
  invokePrescription(
    `/bot/prescription?action=add&basketId=${httpBasketId}&q=${encodeURIComponent("لوزارتان")}`
  );
  const httpFinished = invokePrescription(
    `/bot/prescription?action=finish&basketId=${httpBasketId}`
  );
  assert.equal(httpFinished.body.insurance, null);
});

test("review: duplicate adds are separate one-unit items", () => {
  const { basketId } = prescriptionBasketService.start();
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.items.length, 2);
  assert.equal(finished.totals.itemsTotal, expectedPrice("g-1003") * 2);
  assert.equal(
    finished.totals.grandTotal,
    expectedPrice("g-1003") * 2 + PRESCRIPTION_FEE
  );
});

test("review: all-unpriced basket keeps the tariff separate and the share identity holds", () => {
  setPriceResolverForTest(() => null);
  const { basketId } = prescriptionBasketService.start({ insurancePercent: 70 });
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.totals.itemsTotal, 0);
  assert.equal(finished.totals.unpricedCount, 1);
  assert.equal(finished.totals.serviceFee, PRESCRIPTION_FEE);
  assert.equal(finished.totals.grandTotal, PRESCRIPTION_FEE);
  assert.equal(
    finished.insurance.orgTotal + finished.insurance.patientTotal,
    finished.totals.grandTotal
  );
  assert.match(finished.text, /قیمتش پیدا نشد/);
  assert.match(finished.text, /در جمع حساب نشده‌اند/);
});

test("review: basket subsidy is capped at the item price", () => {
  setSubsidyResolverForTest(() => 999999999);
  const { basketId } = prescriptionBasketService.start({ insurancePercent: 70 });
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.insurance.subsidy, finished.totals.itemsTotal);
  assert.equal(finished.insurance.orgDrugs, 0);
  assert.equal(
    finished.insurance.orgTotal + finished.insurance.patientTotal,
    finished.totals.grandTotal
  );
});

test("review: invalid remove indexes and unknown baskets fail without mutation", () => {
  const { basketId } = prescriptionBasketService.start();
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });

  for (const index of [-1, 1, 1.5, "abc", ""]) {
    assert.throws(
      () => prescriptionBasketService.remove({ basketId, index }),
      /Invalid item index/
    );
  }
  assert.equal(prescriptionBasketService.view({ basketId }).items.length, 1);
  assert.throws(
    () => prescriptionBasketService.view({ basketId: "rx-999999" }),
    /قدیمی شده/
  );

  const unknown = invokePrescription(
    "/bot/prescription?action=finish&basketId=rx-999999"
  );
  assert.equal(unknown.statusCode, 400);
  const badAction = invokePrescription("/bot/prescription?action=wat");
  assert.equal(badAction.statusCode, 400);
});

test("review: store sanitizes kind and insurance percent at creation", () => {
  for (const invalidPercent of [Number.NaN, -1, 101, "70"]) {
    const id = prescriptionSessionStore.create({
      kind: "weird",
      insurancePercent: invalidPercent
    });
    const basket = prescriptionSessionStore.get(id);
    assert.equal(basket.kind, "prescription");
    assert.equal(basket.insurancePercent, null);
  }

  const fullCoverId = prescriptionSessionStore.create({
    kind: "free",
    insurancePercent: 100
  });
  assert.equal(prescriptionSessionStore.get(fullCoverId).kind, "free");
  assert.equal(
    prescriptionSessionStore.get(fullCoverId).insurancePercent,
    100
  );
});

test("review: undefined from the fee seam delegates to the official free tariff", () => {
  setServiceFeeResolverForTest((kind) =>
    kind === "free" ? undefined : PRESCRIPTION_FEE
  );
  const { basketId } = prescriptionBasketService.start({ kind: "free" });
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });

  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.totals.serviceFee, FREE_FEE);
  assert.equal(finished.serviceFee.label, "تعرفه‌ی خدمات درمانی (خرید آزاد)");
});

test("review: basket store expiry and cap hold", async () => {
  const expiringId = prescriptionSessionStore.create({}, 5);
  assert.ok(prescriptionSessionStore.get(expiringId));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(prescriptionSessionStore.get(expiringId), null);

  prescriptionSessionStore.resetForTest();
  let firstId;
  let lastId;
  for (let index = 0; index < 2001; index += 1) {
    const id = prescriptionSessionStore.create({});
    if (index === 0) firstId = id;
    if (index === 2000) lastId = id;
  }
  assert.equal(prescriptionSessionStore.get(firstId), null);
  assert.ok(prescriptionSessionStore.get("rx-2"));
  assert.ok(prescriptionSessionStore.get(lastId));
});

test("usersim A2: finish with a selection still open re-shows the same selection step", () => {
  const { basketId } = prescriptionBasketService.start();
  prescriptionBasketService.addQuery({ basketId, query: "لوزارتان" });

  const step = prescriptionBasketService.addQuery({ basketId, query: "استامینوفن" });
  assert.equal(step.type, "needs_selection");

  const reminded = prescriptionBasketService.finish({ basketId });
  assert.equal(reminded.type, "needs_selection");
  assert.equal(reminded.sessionId, step.sessionId);
  assert.deepEqual(reminded.choices, step.choices);

  // The basket is still open and the pending item can still be completed.
  const completed = walkSelection(basketId, reminded, ["قرص", "۵۰۰"]);
  assert.equal(completed.type, "added");
  const finished = prescriptionBasketService.finish({ basketId });
  assert.equal(finished.type, "prescription_total");
  assert.equal(finished.items.length, 2);
});

test("usersim A2: a new add with a selection still open re-shows the pending step instead of dropping it", () => {
  const { basketId } = prescriptionBasketService.start();

  const firstStep = prescriptionBasketService.addQuery({ basketId, query: "متفور" });
  assert.equal(firstStep.type, "needs_selection");

  const secondAdd = prescriptionBasketService.addQuery({ basketId, query: "ایبو" });
  assert.equal(secondAdd.type, "needs_selection");
  assert.equal(secondAdd.sessionId, firstStep.sessionId);
  assert.deepEqual(secondAdd.choices, firstStep.choices);
  assert.equal(prescriptionBasketService.view({ basketId }).items.length, 0);

  // The pending selection still completes normally afterwards.
  const completed = walkSelection(basketId, secondAdd, ["ب‌دارو"]);
  assert.equal(completed.type, "added");
  assert.equal(completed.item.goodId, "g-1020");
});


test("usersim A3: free-purchase basket speaks of خرید, not نسخه", () => {
  const started = prescriptionBasketService.start({ kind: "free" });
  assert.doesNotMatch(started.text, /عکس نسخه/);

  const added = prescriptionBasketService.addQuery({
    basketId: started.basketId,
    query: "لوزارتان"
  });
  assert.equal(added.type, "added");
  assert.match(added.text, /به خرید اضافه شد/);
  assert.doesNotMatch(added.text, /به نسخه اضافه شد/);
});


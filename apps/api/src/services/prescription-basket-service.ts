import { goodsRepository } from "../repositories/goods-repository.ts";
import { medicineSelectionService } from "./medicine-selection-service.ts";
import { pricingService } from "./pricing-service.ts";
import {
  basketTotals,
  insuranceShares,
  prescriptionPresenter,
  rowSubsidy,
  SERVICE_FEE_LABELS
} from "./prescription-presenter.ts";
import { prescriptionSessionStore } from "./prescription-session-store.ts";

// «قیمت نسخه» — prescription basket module (prototype).
//
// A patient adds the items of a prescription one by one, reusing the
// existing single-medicine selection flow (suggestion buttons) per item.
// The flow always lands on one specific product (brand), and the basket
// prices THAT product — never a substance-level average. On top of the
// drug prices, the final card carries the services tariff
// (تعرفه‌ی خدمات درمانی) as its own line; the prescription tariff and
// the free-purchase tariff are two different numbers from two different
// sources and are never substituted for each other.
// Only official public prices are used — no pharmacy operational data.

const DEFAULT_DOCUMENT_DATE = "2026-06-24";

const BASKET_ACTIONS = [
  { key: "finish", label: "✅ تمام — جمع را ببین" },
  { key: "remove_last", label: "🗑 آخرین دارو را حذف کن" }
];

const FINAL_ACTIONS = [{ key: "new_basket", label: "🧾 نسخه‌ی تازه" }];

function defaultPriceResolver(goodId, documentDate) {
  try {
    const pricing = pricingService.calculate({
      goodId,
      documentDate: documentDate ?? DEFAULT_DOCUMENT_DATE,
      quantity: 1,
      warehouseId: "main",
      includeTechnicalFee: false
    });
    const value = pricing.finalConsumerPrice ?? pricing.consumerUnitPrice;
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

let priceResolver = defaultPriceResolver;

// Test seam, in the spirit of the stores' resetForTest: lets tests drive
// the "official price unavailable" branch without a priced catalog entry.
// The given resolver may return a number (price), null (unavailable), or
// undefined (delegate to the real pricing service).
export function setPriceResolverForTest(resolver) {
  priceResolver = resolver ?? defaultPriceResolver;
}

function validPrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function resolvePrice(goodId, documentDate) {
  const value = priceResolver(goodId, documentDate);
  return validPrice(
    value === undefined ? defaultPriceResolver(goodId, documentDate) : value
  );
}

// The services tariff, structured the way Qanun's own logic implements
// it (rule table extracted from the vendor bundle + its technicalFees
// collection — files/QANUN-TARIFF-LOGIC-EXTRACT-FA.md): one rule per
// document kind, a fixed amount per document. The amounts are the
// current official annual tariffs (ابلاغیه تعرفه خدمات دارویی ۱۴۰۵):
// prescription dispensing 727,000 Rial per prescription — the same
// value Qanun's own rule table carries — and OTC/free-purchase
// management 81,000 Rial per visit. The catalog «حق فنی» good's price
// (149,050 Rial) is a stale artifact and is NOT the current tariff;
// it is never used here.
// PROVISIONAL SOURCE: the master reference for all Iranian treatment
// tariffs is the Ministry's RVU portal (rvu.behdasht.gov.ir); a
// dedicated line is harvesting it (all sections, all years) into a
// local tariff database. When that database lands, this table is
// replaced by a read from it — the values stay as below until then
// (owner order, 2026-11-23).
const OFFICIAL_SERVICE_TARIFFS = {
  prescription: 727000,
  free: 81000
};

function defaultServiceFeeResolver(kind) {
  return OFFICIAL_SERVICE_TARIFFS[kind] ?? null;
}

let serviceFeeResolver = defaultServiceFeeResolver;

// Test seam mirroring setPriceResolverForTest: a number is the tariff,
// null means "not in the data", undefined delegates to the catalog lookup.
export function setServiceFeeResolverForTest(resolver) {
  serviceFeeResolver = resolver ?? defaultServiceFeeResolver;
}

function validServiceFee(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function resolveServiceFee(kind) {
  const value = serviceFeeResolver(kind);
  return validServiceFee(
    value === undefined ? defaultServiceFeeResolver(kind) : value
  );
}

// The currency subsidy (یارانه ارزی) is per item: in Qanun it sits in the
// insurer's commitment config for the good (alongside the percent). The
// bot's price catalog carries no subsidy field yet, so the default
// resolver returns null (no subsidy known) until the commitment data
// (insurer tables by generic code) is wired in. Test seam mirrors the
// price/fee seams: a number is the unit subsidy, null = unknown,
// undefined = delegate to the default.
function defaultSubsidyResolver() {
  return null;
}

let subsidyResolver = defaultSubsidyResolver;

export function setSubsidyResolverForTest(resolver) {
  subsidyResolver = resolver ?? defaultSubsidyResolver;
}

function validSubsidy(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function resolveSubsidyUnit(goodId) {
  const value = subsidyResolver(goodId);
  return validSubsidy(
    value === undefined ? defaultSubsidyResolver(goodId) : value
  );
}

function basketError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requireBasket(basketId) {
  if (!basketId) {
    throw basketError("Missing required field 'basketId'");
  }

  const basket = prescriptionSessionStore.get(basketId);

  if (!basket) {
    throw basketError("این سبد نسخه قدیمی شده. لطفاً نسخه را از اول شروع کنید.");
  }

  return basket;
}

function appendResolvedItem(basket, selection, documentDate) {
  const good = goodsRepository.getById(selection.goodId);
  const item = {
    goodId: selection.goodId,
    title: good?.persianTitle || good?.title || selection.item?.persianTitle || "دارو",
    unitPrice: resolvePrice(selection.goodId, documentDate),
    subsidyUnit: resolveSubsidyUnit(selection.goodId)
  };

  basket.items.push(item);
  return item;
}

function basketView(basket, { final = false } = {}) {
  const serviceFeeAmount = basket.items.length
    ? resolveServiceFee(basket.kind)
    : null;
  const totals = basketTotals(basket.items, serviceFeeAmount);
  const subsidyTotal = basket.items.reduce(
    (sum, item) => sum + rowSubsidy({ unitSubsidy: item.subsidyUnit, unitPrice: item.unitPrice }),
    0
  );
  const shares =
    basket.kind === "prescription" &&
    basket.insurancePercent != null &&
    basket.items.length
      ? insuranceShares({
          itemsTotal: totals.itemsTotal,
          serviceFee: totals.serviceFee,
          percent: basket.insurancePercent,
          subsidyTotal
        })
      : null;
  const presentation = prescriptionPresenter.basket(basket.items, {
    final,
    kind: basket.kind,
    serviceFeeAmount,
    shares
  });

  return {
    basketId: basket.id,
    kind: basket.kind,
    items: basket.items,
    totals,
    serviceFee: {
      label: SERVICE_FEE_LABELS[basket.kind],
      amount: totals.serviceFee
    },
    insurance: shares,
    text: presentation.text,
    copyReady: true,
    actions: final ? FINAL_ACTIONS : basket.items.length ? BASKET_ACTIONS : []
  };
}

function invalidSelectionResponse(basket) {
  return {
    type: "invalid_selection",
    basketId: basket.id,
    kind: basket.kind,
    items: basket.items,
    text: "این انتخاب قدیمی شده است. از دکمه‌های آخرین پیام استفاده کنید، یا نام دارو را دوباره بفرستید.",
    copyReady: true,
    actions: basket.items.length ? BASKET_ACTIONS : []
  };
}

function selectionStep(basketId, selection) {
  return {
    type: "needs_selection",
    basketId,
    query: selection.query,
    sessionId: selection.sessionId,
    prompt: selection.prompt,
    choices: selection.choices
  };
}

// UserSim round 2 (A2): while a selection question is still open, the
// pending item must never fall silently — finish() and a fresh add both
// re-show the very same step instead of moving on without it. The step
// is kept on the basket so the reminder is the identical message, with
// its buttons, not a paraphrase.
function pendingSelectionStep(basket) {
  return basket.selectionSessionId && basket.pendingSelection
    ? basket.pendingSelection
    : null;
}

function addedResponse(basket, item) {
  const view = basketView(basket);
  return {
    type: "added",
    item,
    ...view,
    text: `✅ به نسخه اضافه شد.\n${view.text}`
  };
}

function handleSelectionResult(basket, selection, documentDate) {
  if (
    selection.type === "needs_form_selection" ||
    selection.type === "needs_strength_selection" ||
    selection.type === "needs_identity_selection"
  ) {
    const step = selectionStep(basket.id, selection);
    basket.pendingSelection = step;
    return step;
  }

  if (selection.type === "resolved") {
    basket.pendingSelection = null;
    const item = appendResolvedItem(basket, selection, documentDate);
    return addedResponse(basket, item);
  }

  if (selection.type === "not_found") {
    basket.pendingSelection = null;
    const presentation = prescriptionPresenter.notFound(selection.query);
    return {
      type: "not_found",
      basketId: basket.id,
      kind: basket.kind,
      query: selection.query,
      items: basket.items,
      text: presentation.text,
      copyReady: true,
      actions: basket.items.length ? BASKET_ACTIONS : []
    };
  }

  if (selection.type === "refine_search") {
    basket.pendingSelection = null;
    return {
      type: "refine_search",
      basketId: basket.id,
      kind: basket.kind,
      items: basket.items,
      text: selection.text,
      copyReady: true,
      actions: basket.items.length ? BASKET_ACTIONS : []
    };
  }

  // expired_selection: the step's buttons are dead — drop the reminder.
  // invalid_selection: the session is still alive server-side, so the
  // pending step stays remindable.
  if (selection.type === "expired_selection") {
    basket.pendingSelection = null;
  }

  return {
    type: selection.type,
    basketId: basket.id,
    kind: basket.kind,
    items: basket.items,
    text: selection.text ?? "انتخاب نامعتبر است. لطفاً نام دارو را دوباره بفرستید.",
    copyReady: true,
    actions: basket.items.length ? BASKET_ACTIONS : []
  };
}

export const prescriptionBasketService = {
  start(input = {}) {
    const kind = input.kind === "free" ? "free" : "prescription";
    const basketId = prescriptionSessionStore.create({
      kind,
      insurancePercent:
        kind === "prescription" && input.insurancePercent != null
          ? Number(input.insurancePercent)
          : null
    });
    const basket = prescriptionSessionStore.get(basketId);
    return {
      type: "basket_started",
      ...basketView(basket)
    };
  },

  addQuery(input) {
    const basket = requireBasket(input.basketId);

    // A2: an item is mid-selection — remind with the same step first;
    // a new query never silently replaces the pending one.
    const pending = pendingSelectionStep(basket);
    if (pending) {
      return pending;
    }

    const query = (input.query ?? "").trim();

    if (!query) {
      throw basketError("Missing required field 'query'");
    }

    const selection = medicineSelectionService.start({ query });
    basket.selectionSessionId = selection.sessionId ?? null;
    return handleSelectionResult(basket, selection, input.documentDate);
  },

  addSelect(input) {
    const basket = requireBasket(input.basketId);

    if (!input.sessionId || !input.choiceId) {
      throw basketError("Missing required fields 'sessionId' and 'choiceId'");
    }

    if (basket.selectionSessionId !== input.sessionId) {
      return invalidSelectionResponse(basket);
    }

    const selection = medicineSelectionService.continue({
      sessionId: input.sessionId,
      choiceId: input.choiceId
    });

    if (selection.sessionId) {
      basket.selectionSessionId = selection.sessionId;
    } else if (
      selection.type === "resolved" ||
      selection.type === "refine_search" ||
      selection.type === "expired_selection"
    ) {
      basket.selectionSessionId = null;
    }

    return handleSelectionResult(basket, selection, input.documentDate);
  },

  remove(input) {
    const basket = requireBasket(input.basketId);
    const rawIndex = input.index;
    const index =
      typeof rawIndex === "number"
        ? rawIndex
        : typeof rawIndex === "string" && rawIndex.trim()
          ? Number(rawIndex)
          : Number.NaN;

    if (!Number.isInteger(index) || index < 0 || index >= basket.items.length) {
      throw basketError("Invalid item index");
    }

    const [removed] = basket.items.splice(index, 1);
    return {
      type: "removed",
      removed,
      ...basketView(basket)
    };
  },

  removeLast(input) {
    const basket = requireBasket(input.basketId);

    if (!basket.items.length) {
      throw basketError("سبد خالی است.");
    }

    const removed = basket.items.pop();
    return {
      type: "removed",
      removed,
      ...basketView(basket)
    };
  },

  view(input) {
    const basket = requireBasket(input.basketId);
    return {
      type: "basket_view",
      ...basketView(basket)
    };
  },

  finish(input) {
    const basket = requireBasket(input.basketId);

    // A2: never close the card while an item is mid-selection — the
    // final card would look complete but would not be the user's
    // prescription. Re-show the pending step instead.
    const pending = pendingSelectionStep(basket);
    if (pending) {
      return pending;
    }

    if (!basket.items.length) {
      throw basketError("سبد خالی است.");
    }

    const result = {
      type: "prescription_total",
      ...basketView(basket, { final: true })
    };

    prescriptionSessionStore.close(basket.id);
    return result;
  }
};

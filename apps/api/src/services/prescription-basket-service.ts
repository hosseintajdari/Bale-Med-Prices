import { goodsRepository } from "../repositories/goods-repository.ts";
import { medicineSelectionService } from "./medicine-selection-service.ts";
import { pricingService } from "./pricing-service.ts";
import { prescriptionPresenter } from "./prescription-presenter.ts";
import { prescriptionSessionStore } from "./prescription-session-store.ts";

// «قیمت نسخه» — prescription basket module (prototype).
//
// A patient adds the items of a prescription one by one, reusing the
// existing single-medicine selection flow (suggestion buttons) per item.
// Each resolved item is priced with the same patient pricing the bot
// already serves; the basket shows the itemised list and the total.
// Only official public prices are used — no pharmacy operational data.

const DEFAULT_DOCUMENT_DATE = "2026-06-24";

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

function resolvePrice(goodId, documentDate) {
  const value = priceResolver(goodId, documentDate);
  return value === undefined ? defaultPriceResolver(goodId, documentDate) : value;
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
    unitPrice: resolvePrice(selection.goodId, documentDate)
  };

  basket.items.push(item);
  return item;
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

function addedResponse(basket, item) {
  const presentation = prescriptionPresenter.basket(basket.items);
  return {
    type: "added",
    basketId: basket.id,
    item,
    items: basket.items,
    text: `✅ اضافه شد.\n${presentation.text}`,
    copyReady: true
  };
}

function handleSelectionResult(basket, selection, documentDate) {
  if (selection.type === "resolved") {
    const item = appendResolvedItem(basket, selection, documentDate);
    return addedResponse(basket, item);
  }

  if (selection.type === "not_found") {
    const presentation = prescriptionPresenter.notFound(selection.query);
    return {
      type: "not_found",
      basketId: basket.id,
      query: selection.query,
      items: basket.items,
      text: presentation.text,
      copyReady: true
    };
  }

  if (
    selection.type === "needs_form_selection" ||
    selection.type === "needs_strength_selection" ||
    selection.type === "needs_identity_selection"
  ) {
    return selectionStep(basket.id, selection);
  }

  if (selection.type === "refine_search") {
    return {
      type: "refine_search",
      basketId: basket.id,
      items: basket.items,
      text: selection.text,
      copyReady: true
    };
  }

  // expired_selection / invalid_selection from the selection flow.
  return {
    type: selection.type,
    basketId: basket.id,
    items: basket.items,
    text: selection.text ?? "انتخاب نامعتبر است. لطفاً نام دارو را دوباره بفرستید.",
    copyReady: true
  };
}

export const prescriptionBasketService = {
  start() {
    const basketId = prescriptionSessionStore.create();
    const presentation = prescriptionPresenter.basket([]);
    return {
      type: "basket_started",
      basketId,
      items: [],
      text: presentation.text,
      copyReady: true
    };
  },

  addQuery(input) {
    const basket = requireBasket(input.basketId);
    const query = (input.query ?? "").trim();

    if (!query) {
      throw basketError("Missing required field 'query'");
    }

    const selection = medicineSelectionService.start({ query });
    return handleSelectionResult(basket, selection, input.documentDate);
  },

  addSelect(input) {
    const basket = requireBasket(input.basketId);

    if (!input.sessionId || !input.choiceId) {
      throw basketError("Missing required fields 'sessionId' and 'choiceId'");
    }

    const selection = medicineSelectionService.continue({
      sessionId: input.sessionId,
      choiceId: input.choiceId
    });
    return handleSelectionResult(basket, selection, input.documentDate);
  },

  remove(input) {
    const basket = requireBasket(input.basketId);
    const index = Number(input.index);

    if (!Number.isInteger(index) || index < 0 || index >= basket.items.length) {
      throw basketError("Invalid item index");
    }

    const [removed] = basket.items.splice(index, 1);
    const presentation = prescriptionPresenter.basket(basket.items);
    return {
      type: "removed",
      basketId: basket.id,
      removed,
      items: basket.items,
      text: presentation.text,
      copyReady: true
    };
  },

  view(input) {
    const basket = requireBasket(input.basketId);
    const presentation = prescriptionPresenter.basket(basket.items);
    return {
      type: "basket_view",
      basketId: basket.id,
      items: basket.items,
      text: presentation.text,
      copyReady: true
    };
  },

  finish(input) {
    const basket = requireBasket(input.basketId);
    const presentation = prescriptionPresenter.basket(basket.items, { final: true });
    const result = {
      type: "prescription_total",
      basketId: basket.id,
      items: basket.items,
      text: presentation.text,
      copyReady: true
    };

    prescriptionSessionStore.close(basket.id);
    return result;
  }
};

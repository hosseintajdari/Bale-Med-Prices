import { medicineSelectionService } from "./medicine-selection-service.ts";
import { botResponsePresenter } from "./bot-response-presenter.ts";
import { pricingService } from "./pricing-service.ts";

function calculateResolved(selection, input) {
  const pricing = pricingService.calculate({
    goodId: selection.goodId,
    documentDate: input.documentDate ?? "2026-06-24",
    quantity: Number(input.quantity ?? 1),
    warehouseId: input.warehouseId ?? "main",
    includeTechnicalFee: Boolean(input.includeTechnicalFee)
  });
  const presentation = botResponsePresenter.pricing(pricing);

  return {
    type: "resolved",
    query: selection.query,
    goodId: selection.goodId,
    text: presentation.text,
    parseMode: presentation.parseMode,
    copyReady: presentation.copyReady,
    sourceHints: pricing.sourceHints,
    warnings: pricing.warnings,
    moreInfo: {
      ttacDetail: null
    }
  };
}

function toBotResponse(selection, input) {
  if (selection.type === "resolved") {
    return calculateResolved(selection, input);
  }

  if (selection.type === "not_found") {
    return {
      type: "not_found",
      query: selection.query,
      text: `No medicine was found for: ${selection.query}`,
      copyReady: true
    };
  }

  if (selection.type === "expired_selection" || selection.type === "invalid_selection") {
    return {
      type: selection.type,
      text: selection.text,
      copyReady: true
    };
  }

  if (selection.type === "refine_search") {
    return {
      type: "refine_search",
      query: selection.query,
      text: selection.text,
      copyReady: true
    };
  }

  return botResponsePresenter.selection(selection);
}

export const botLookupService = {
  lookup(input) {
    const query = (input.query ?? "").trim();

    if (!query) {
      const error = new Error("Missing required field 'query'");
      error.statusCode = 400;
      throw error;
    }

    return toBotResponse(medicineSelectionService.start({ query }), input);
  },

  select(input) {
    if (!input.sessionId) {
      const error = new Error("Missing required field 'sessionId'");
      error.statusCode = 400;
      throw error;
    }

    if (!input.choiceId) {
      const error = new Error("Missing required field 'choiceId'");
      error.statusCode = 400;
      throw error;
    }

    return toBotResponse(medicineSelectionService.continue(input), input);
  }
};

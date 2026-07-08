import { medicineSelectionService } from "./medicine-selection-service.ts";
import { botResponsePresenter } from "./bot-response-presenter.ts";
import { pricingService } from "./pricing-service.ts";
import { selectionHistoryStore } from "./selection-history-store.ts";
import { webResponsePresenter } from "./web-response-presenter.ts";
import { goodsRepository } from "../repositories/goods-repository.ts";
import { buildTtacDetailUrl } from "./ttac-detail.ts";

function buildTtacDetailPlaceholder(selection) {
  const good = goodsRepository.getById(selection.goodId);
  const ttacSource = good?.sources?.find((source) => source.key === "ttac");
  const ttacCode = good?.ttacCode;

  if (!ttacSource || !ttacCode) {
    return null;
  }

  const detailUrl = buildTtacDetailUrl(ttacCode);

  return {
    sourceKey: ttacSource.key,
    sourceLabel: ttacSource.label,
    status: "not_loaded",
    ttacCode,
    detailUrl,
    availableActions: [
      {
        key: "view_ttac_detail",
        label: "مشاهده اطلاعات دارو در TTAC",
        status: detailUrl ? "available" : "not_configured"
      }
    ]
  };
}

function calculateResolved(selection, input) {
  const pricing = pricingService.calculate({
    goodId: selection.goodId,
    documentDate: input.documentDate ?? "2026-06-24",
    quantity: Number(input.quantity ?? 1),
    warehouseId: input.warehouseId ?? "main",
    includeTechnicalFee: Boolean(input.includeTechnicalFee)
  });
  const presentation = botResponsePresenter.pricing(pricing);
  selectionHistoryStore.recordSuccessfulSelection(selection.query, selection.goodId);

  return {
    type: "resolved",
    query: selection.query,
    goodId: selection.goodId,
    text: presentation.text,
    parseMode: presentation.parseMode,
    copyReady: presentation.copyReady,
    pricing: webResponsePresenter.buildPatientPricing(pricing),
    sourceHints: pricing.sourceHints,
    warnings: pricing.warnings,
    moreInfo: {
      ttacDetail: buildTtacDetailPlaceholder(selection)
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

function finalizeResponse(response, format) {
  if (format !== "web") {
    return response;
  }

  return webResponsePresenter.adapt(response);
}

export const botLookupService = {
  lookup(input) {
    const query = (input.query ?? "").trim();
    const format = input.format ?? "default";

    if (!query) {
      const error = new Error("Missing required field 'query'");
      error.statusCode = 400;
      throw error;
    }

    return finalizeResponse(
      toBotResponse(medicineSelectionService.start({ query }), input),
      format
    );
  },

  select(input) {
    const format = input.format ?? "default";

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

    return finalizeResponse(
      toBotResponse(medicineSelectionService.continue(input), input),
      format
    );
  }
};

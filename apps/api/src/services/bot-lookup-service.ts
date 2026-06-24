import { medicineSelectionService } from "./medicine-selection-service.ts";
import { pricingService } from "./pricing-service.ts";

function buildChoiceLine(choice) {
  return `- ${choice.label}${choice.description ? ` | ${choice.description}` : ""}`;
}

function buildSelectionText(query, selection) {
  const lines = [
    `Search: ${query}`,
    `I found ${selection.items?.length ?? selection.choices.length} matching medicines.`,
    selection.prompt ?? `Reply with one id from the list below:`,
    ...selection.choices.map(buildChoiceLine)
  ];

  if (selection.items?.length > 5) {
    lines.push("More matches exist. Narrow the search query.");
  }

  return lines.join("\n");
}

function buildSelectionChoice(choice, sessionId) {
  return {
    id: choice.id,
    label: choice.label,
    description: choice.description,
    value: choice.value ?? {},
    sessionId
  };
}

function buildTelegramButton(choice, sessionId) {
  return {
    text: choice.label,
    callback_data: `ms:${sessionId}:${choice.id}`
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

  return {
    type: "resolved",
    query: selection.query,
    goodId: selection.goodId,
    text: pricing.telegram.text,
    parseMode: pricing.telegram.parseMode,
    copyReady: true,
    sourceHints: pricing.sourceHints,
    warnings: pricing.warnings,
    moreInfo: {
      ttacDetail: null
    }
  };
}

function buildSelectionResponse(selection) {
  const choices = selection.choices ?? [];

  return {
    type: selection.type,
    query: selection.query,
    total: selection.total ?? selection.items?.length ?? choices.length,
    sessionId: selection.sessionId,
    text: buildSelectionText(selection.query, selection),
    copyReady: true,
    items: (selection.items ?? []).slice(0, 5).map((item) => ({
      id: item.id,
      title: item.title,
      persianTitle: item.persianTitle,
      unitLabel: item.unitLabel,
      dosageForm: item.dosageForm,
      routeQualifier: item.routeQualifier,
      strengthLabel: item.strengthLabel,
      patientFormLabel: item.patientFormLabel,
      packageDescription: item.packageDescription
    })),
    selection: {
      kind: "single_choice",
      prompt: selection.prompt,
      sessionId: selection.sessionId,
      choices: choices.map((choice) => buildSelectionChoice(choice, selection.sessionId))
    },
    telegram: {
      replyMarkup: {
        inline_keyboard: choices.map((choice) => [buildTelegramButton(choice, selection.sessionId)])
      }
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

  return buildSelectionResponse(selection);
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

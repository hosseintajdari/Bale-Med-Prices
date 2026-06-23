import { goodsService } from "./goods-service.ts";
import { pricingService } from "./pricing-service.ts";

function buildChoiceLine(item) {
  return `- ${item.id} | ${item.title} | ${item.persianTitle} | ${item.unitLabel} | ${item.consumerUnitPrice}`;
}

function buildSelectionText(query, items) {
  const lines = [
    `Search: ${query}`,
    `I found ${items.length} matching medicines.`,
    `Reply with one id from the list below:`,
    ...items.slice(0, 5).map(buildChoiceLine)
  ];

  if (items.length > 5) {
    lines.push("More matches exist. Narrow the search query.");
  }

  return lines.join("\n");
}

function buildSelectionChoice(item) {
  return {
    id: item.id,
    label: `${item.title} | ${item.persianTitle}`,
    description: `${item.unitLabel} | ${item.consumerUnitPrice}`,
    value: {
      goodId: item.id
    }
  };
}

function buildTelegramButton(item) {
  return {
    text: `${item.id} | ${item.title}`,
    callback_data: `select_good:${item.id}`
  };
}

export const botLookupService = {
  lookup(input) {
    const query = (input.query ?? "").trim();

    if (!query) {
      const error = new Error("Missing required field 'query'");
      error.statusCode = 400;
      throw error;
    }

    const searchResult = goodsService.search(`/goods/search?q=${encodeURIComponent(query)}`);

    if (searchResult.total === 0) {
      return {
        type: "not_found",
        query,
        text: `No medicine was found for: ${query}`,
        copyReady: true
      };
    }

    if (searchResult.total === 1) {
      const item = searchResult.items[0];
      const pricing = pricingService.calculate({
        goodId: item.id,
        documentDate: input.documentDate ?? "2026-06-24",
        quantity: Number(input.quantity ?? 1),
        warehouseId: input.warehouseId ?? "main",
        includeTechnicalFee: Boolean(input.includeTechnicalFee),
        format: "telegram"
      });

      return {
        type: "resolved",
        query,
        goodId: item.id,
        text: pricing.text,
        parseMode: pricing.parseMode,
        copyReady: true,
        sourceHints: pricing.sourceHints,
        warnings: pricing.warnings
      };
    }

    const selectableItems = searchResult.items.slice(0, 5);

    return {
      type: "needs_selection",
      query,
      total: searchResult.total,
      text: buildSelectionText(query, searchResult.items),
      copyReady: true,
      items: selectableItems.map((item) => ({
        id: item.id,
        title: item.title,
        persianTitle: item.persianTitle,
        consumerUnitPrice: item.consumerUnitPrice,
        unitLabel: item.unitLabel
      })),
      selection: {
        kind: "single_choice",
        prompt: "Choose one medicine match",
        choices: selectableItems.map(buildSelectionChoice)
      },
      telegram: {
        replyMarkup: {
          inline_keyboard: selectableItems.map((item) => [buildTelegramButton(item)])
        }
      }
    };
  }
};

import { goodsRepository } from "../repositories/goods-repository.ts";
import { settingsRepository } from "../repositories/settings-repository.ts";
import { taxRepository } from "../repositories/tax-repository.ts";
import { stockRepository } from "../repositories/stock-repository.ts";
import { calculateFinalPrice } from "../../../../packages/domain/src/rules/calculate-final-price.ts";

function formatCurrency(value) {
  if (value == null) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function buildSourceHints(good) {
  return good.sources
    .slice()
    .sort((left, right) => left.priority - right.priority)
    .map((source) => ({
      key: source.key,
      label: source.label,
      role: source.role
    }));
}

function buildTelegramText(result) {
  const lines = [
    `💊 ${result.title}`,
    result.persianTitle,
    `Unit price: ${formatCurrency(result.consumerUnitPrice)} per ${result.unitLabel}`,
    `Final price: ${formatCurrency(result.finalConsumerPrice)}`,
    `Quantity: ${result.quantity}`,
    `Pack: ${result.packLabel}`,
    `Sources: ${result.sourceHints.map((source) => source.label).join(", ")}`
  ];

  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.join(" | ")}`);
  }

  return lines.join("\n");
}

function toPatientPricingResponse(result, format = "default") {
  const response = {
    goodId: result.goodId,
    title: result.title,
    persianTitle: result.persianTitle,
    englishTitle: result.englishTitle,
    unitLabel: result.unitLabel,
    packLabel: result.packLabel,
    quantity: result.quantity,
    consumerUnitPrice: result.unitBasePrice,
    consumerTotalPrice: result.basePrice,
    finalConsumerPrice: result.finalPrice,
    packEstimatedPrice: result.quantity > 1 ? result.finalPrice : null,
    unitPrice: result.unitBasePrice,
    totalPrice: result.finalPrice,
    taxAmount: result.taxAmount,
    tollAmount: result.tollAmount,
    technicalFee: result.technicalFee,
    appliedTaxDate: result.appliedTaxDate,
    appliedTechnicalFeeDate: result.appliedTechnicalFeeDate,
    sources: result.sources,
    sourceHints: buildSourceHints(result),
    warnings: result.warnings,

    // Legacy compatibility for the current web surface.
    unitBasePrice: result.unitBasePrice,
    basePrice: result.basePrice,
    totalTax: result.totalTax,
    finalPrice: result.finalPrice,
    avgCost: result.avgCost,
    profitAmount: result.profitAmount,
    profitPercent: result.profitPercent
  };

  response.telegram = {
    text: buildTelegramText(response),
    parseMode: "plain_text",
    copyReady: true
  };

  if (format === "telegram") {
    return {
      goodId: response.goodId,
      text: response.telegram.text,
      parseMode: response.telegram.parseMode,
      copyReady: true,
      sourceHints: response.sourceHints,
      warnings: response.warnings
    };
  }

  return response;
}

export const pricingService = {
  calculate(input) {
    if (!input.goodId) {
      const error = new Error("Missing required field 'goodId'");
      error.statusCode = 400;
      throw error;
    }

    if (!input.documentDate) {
      const error = new Error("Missing required field 'documentDate'");
      error.statusCode = 400;
      throw error;
    }

    const quantity = Number(input.quantity ?? 1);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      const error = new Error("Quantity must be a positive number");
      error.statusCode = 400;
      throw error;
    }

    const good = goodsRepository.getById(input.goodId);
    if (!good) {
      const error = new Error(`Good '${input.goodId}' not found`);
      error.statusCode = 404;
      throw error;
    }

    const settings = settingsRepository.getSettings();
    const taxData = taxRepository.findByGood(good);
    const stock = stockRepository.getAverageCost(input.goodId, input.warehouseId ?? "main");

    const result = calculateFinalPrice({
      good,
      quantity,
      documentDate: input.documentDate,
      includeTechnicalFee: Boolean(input.includeTechnicalFee),
      taxMultiplier: settings.taxMultiplier,
      roundingRule: settings.roundingRule,
      taxData,
      technicalFeeRules: settings.technicalFees,
      avgCost: stock?.avgCost ?? null
    });

    return toPatientPricingResponse(result, input.format ?? "default");
  }
};

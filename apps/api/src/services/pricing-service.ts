import { goodsRepository } from "../repositories/goods-repository.ts";
import { settingsRepository } from "../repositories/settings-repository.ts";
import { taxRepository } from "../repositories/tax-repository.ts";
import { stockRepository } from "../repositories/stock-repository.ts";
import { calculateFinalPrice } from "../../../../packages/domain/src/rules/calculate-final-price.ts";

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

function roundFor(value, roundingRule) {
  if (roundingRule === "ceil") {
    return Math.ceil(value);
  }

  if (roundingRule === "floor") {
    return Math.floor(value);
  }

  return Math.round(value);
}

function toPatientPricingResponse(result, roundingRule) {
  // Fixes #26: consumerUnitPrice used to be the raw pre-tax sell price while
  // tax/toll/fee only appeared in finalConsumerPrice — patients saw a lower
  // price than the pharmacy charges. It is now the tax-inclusive unit price
  // (the primary price answer per CONTEXT.md); the pre-tax figure stays
  // available as unitPrice/unitBasePrice for internal use.
  const consumerUnitPrice = roundFor(result.finalPrice / result.quantity, roundingRule);

  return {
    goodId: result.goodId,
    title: result.title,
    persianTitle: result.persianTitle,
    englishTitle: result.englishTitle,
    unitLabel: result.unitLabel,
    packLabel: result.packLabel,
    quantity: result.quantity,
    consumerUnitPrice,
    consumerTotalPrice: result.basePrice,
    finalConsumerPrice: result.finalPrice,
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
    // Fixes #44: renamed — this was avgCost but is actually the total cost.
    totalCost: result.totalCost,
    profitAmount: result.profitAmount,
    profitPercent: result.profitPercent
  };
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

    // Fixes #40: extreme quantities (e.g. 1e21) produced Infinity prices that
    // JSON.stringify silently serialized as null while returning HTTP 200.
    if (quantity > 10000) {
      const error = new Error("Quantity must not exceed 10000");
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
      pricePolicy: settings.pricePolicy,
      taxData,
      technicalFeeRules: settings.technicalFees,
      avgCost: stock?.avgCost ?? null
    });

    return toPatientPricingResponse(result, settings.roundingRule);
  }
};

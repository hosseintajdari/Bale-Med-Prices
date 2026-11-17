import { calculateTax } from "./calculate-tax.ts";
import { calculateProfit } from "./calculate-profit.ts";
import { compareDatesDesc, isDateOnOrAfter } from "../date-utils.ts";

function roundValue(value, roundingRule) {
  if (roundingRule === "ceil") {
    return Math.ceil(value);
  }

  if (roundingRule === "floor") {
    return Math.floor(value);
  }

  return Math.round(value);
}

function calculateTechnicalFee(input) {
  if (!input.includeTechnicalFee) {
    return {
      amount: 0,
      appliedRule: null
    };
  }

  const appliedRule =
    [...input.technicalFeeRules]
      .sort((left, right) => compareDatesDesc(left.effectiveDate, right.effectiveDate))
      .find((rule) => {
        if (!isDateOnOrAfter(input.documentDate, rule.effectiveDate)) {
          return false;
        }

        if (rule.conditions?.excludeNonPharma && input.good.nonPharma) {
          return false;
        }

        if (rule.conditions?.minimumQuantity && input.quantity < rule.conditions.minimumQuantity) {
          return false;
        }

        return true;
      }) ?? null;

  if (!appliedRule) {
    return {
      amount: 0,
      appliedRule: null
    };
  }

  return {
    amount: roundValue(appliedRule.amount * input.quantity, input.roundingRule),
    appliedRule
  };
}

export function calculateFinalPrice(input) {
  const warnings = [];

  // Fixes #27: Settings.pricePolicy is defined but was never honored —
  // the code hardcoded sellPrice-first. The policy now flows in via
  // PricingInput and decides which listed price is the primary one.
  const pricePolicy = input.pricePolicy ?? "sellPriceFirst";
  const preferredField = pricePolicy === "tempPriceFirst" ? "tempPrice" : "sellPrice";
  const fallbackField = pricePolicy === "tempPriceFirst" ? "sellPrice" : "tempPrice";

  const unitBasePrice = input.good[preferredField] || input.good[fallbackField] || 0;
  const basePrice = roundValue(unitBasePrice * input.quantity, input.roundingRule);

  if (!input.good[preferredField] && input.good[fallbackField]) {
    warnings.push(`Used ${fallbackField} because ${preferredField} was not available.`);
  }

  if (!input.taxData) {
    warnings.push("No tax table found for the selected good.");
  }

  const { taxAmount, tollAmount, totalTax, appliedRate } = calculateTax({
    quantity: input.quantity,
    documentDate: input.documentDate,
    taxData: input.taxData,
    taxMultiplier: input.taxMultiplier,
    roundingRule: input.roundingRule
  });

  if (input.taxData && !appliedRate) {
    warnings.push("No tax rate matched the selected document date.");
  }

  const { amount: technicalFee, appliedRule } = calculateTechnicalFee(input);

  if (input.includeTechnicalFee && !appliedRule) {
    warnings.push("Technical fee was requested but no applicable rule matched.");
  }

  const finalPrice = roundValue(
    basePrice + taxAmount + tollAmount + technicalFee,
    input.roundingRule
  );
  const totalCost =
    input.avgCost == null ? null : roundValue(input.avgCost * input.quantity, input.roundingRule);

  if (totalCost == null) {
    warnings.push("Average cost is not available for this good and warehouse.");
  }

  const profit = calculateProfit({
    finalPrice,
    avgCost: totalCost
  });

  return {
    goodId: input.good.id,
    title: input.good.title,
    persianTitle: input.good.persianTitle,
    englishTitle: input.good.englishTitle,
    unitLabel: input.good.unitLabel,
    packLabel: input.good.packLabel,
    sources: input.good.sources,
    quantity: input.quantity,
    unitBasePrice,
    basePrice,
    taxAmount,
    tollAmount,
    totalTax,
    technicalFee,
    finalPrice,
    // Fixes #44: this field was named avgCost but it is the TOTAL cost
    // (round(avgCost × quantity)) — misleading consumers into double-multiplying.
    totalCost,
    profitAmount: profit.profitAmount,
    profitPercent: profit.profitPercent,
    appliedTaxDate: appliedRate?.date ?? null,
    appliedTechnicalFeeDate: appliedRule?.effectiveDate ?? null,
    warnings
  };
}

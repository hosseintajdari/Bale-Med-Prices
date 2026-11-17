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

export function calculateTax(input) {
  // Fixes #28: an unconstrained taxMultiplier (>1 or <0) silently corrupts
  // prices (negative tollAmount). Fail loudly on misconfiguration.
  const multiplier = input.taxMultiplier;
  if (typeof multiplier !== "number" || !Number.isFinite(multiplier) || multiplier < 0 || multiplier > 1) {
    throw new Error(`taxMultiplier must be a finite number between 0 and 1 (got ${String(multiplier)})`);
  }

  if (!input.taxData || input.taxData.averageTaxes.length === 0) {
    return {
      taxAmount: 0,
      tollAmount: 0,
      totalTax: 0,
      appliedRate: null
    };
  }

  const appliedRate =
    [...input.taxData.averageTaxes]
      .sort((left, right) => compareDatesDesc(left.date, right.date))
      .find((row) => isDateOnOrAfter(input.documentDate, row.date)) ?? null;

  if (!appliedRate) {
    return {
      taxAmount: 0,
      tollAmount: 0,
      totalTax: 0,
      appliedRate: null
    };
  }

  const totalTax = roundValue(input.quantity * appliedRate.averageTax, input.roundingRule);
  const taxAmount = roundValue(totalTax * multiplier, input.roundingRule);
  const tollAmount = totalTax - taxAmount;

  return {
    taxAmount,
    tollAmount,
    totalTax,
    appliedRate
  };
}

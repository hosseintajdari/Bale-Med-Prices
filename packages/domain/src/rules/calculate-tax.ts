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
      .sort((left, right) => right.date.localeCompare(left.date))
      .find((row) => input.documentDate >= row.date) ?? null;

  if (!appliedRate) {
    return {
      taxAmount: 0,
      tollAmount: 0,
      totalTax: 0,
      appliedRate: null
    };
  }

  const totalTax = roundValue(input.quantity * appliedRate.averageTax, input.roundingRule);
  const taxAmount = roundValue(totalTax * input.taxMultiplier, input.roundingRule);
  const tollAmount = totalTax - taxAmount;

  return {
    taxAmount,
    tollAmount,
    totalTax,
    appliedRate
  };
}

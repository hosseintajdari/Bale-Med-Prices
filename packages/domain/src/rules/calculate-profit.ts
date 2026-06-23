export function calculateProfit(input) {
  if (input.avgCost == null) {
    return {
      profitAmount: null,
      profitPercent: null
    };
  }

  const profitAmount = input.finalPrice - input.avgCost;
  const profitPercent =
    input.avgCost > 0 ? Math.round((profitAmount / input.avgCost) * 100) : null;

  return {
    profitAmount,
    profitPercent
  };
}

# Pricing Rules

## Rule Flow

1. Find the best medicine match from Persian, English, and alias search inputs
2. Read unit consumer price from `sellPrice` or `tempPrice`
3. Resolve applicable tax row by good and date when tax is part of the price logic
4. Split total tax from total toll using `taxMultiplier`
5. Add technical fee if that rule belongs to the final consumer price
6. Return a clear unit price answer for patients
7. If quantity is provided, multiply from unit price to show optional total price
8. Attach source hints and warnings when pricing confidence is limited

## Notes

- Search must work in both Persian and English
- Patient-facing output should default to unit price
- Unit meaning should be explicit, for example tablet, capsule, bottle, or pack
- `TTAC` is the main medicine information reference for patients
- Internal richer price logic can still come from `Qanoon`
- `Payam Darousaz` can be used as a comparison source in later phases
- Internal cost and profit are not first-class outputs for patient channels

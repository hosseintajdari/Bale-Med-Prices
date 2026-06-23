# Data Model

## goods

- `id`
- `genericCode`
- `title`
- `brand`
- `sellPrice`
- `tempPrice`
- `taxCodes`
- `nonPharma`
- `countInPackage`

## tax_codes

- `code`
- `title`
- `averageTaxes`
  - `date`
  - `averageTax`

## technical_fees

- `type`
- `amount`
- `effectiveDate`
- `conditions`

## settings

- `taxMultiplier`
- `roundingRule`
- `pricePolicy`

## warehouse_transactions

- `goodId`
- `type`
- `documentDate`
- `price`
- `count`
- `expDate`
- `warehouseId`

## goods_last_stock

- `goodId`
- `warehouseId`
- `expDate`
- `count`
- `avgCost`


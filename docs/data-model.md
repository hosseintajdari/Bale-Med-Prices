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

## aggregator_models (Live Web Fallback)

### PriceHit
- `productName`: Product name as reported by the source
- `priceRial`: Extracted price in Iranian Rials (converted from Tomans if needed)
- `url`: Direct source link
- `sourceName`: Adapter source key (e.g. `torob`, `delgarm`)
- `crawledAt`: Timestamp of the price observation (mandatory ISO string)

### PatientSearchItem (Channel Representation)
- `id`: Internal good id (`g-XXXX`) or web-prefixed id (`web:<source>:<encoded_url>`)
- `title`, `persianTitle`, `englishTitle`: Names and search aliases
- `consumerUnitPrice`: Final patient-facing unit price in Rials
- `webSource`: Boolean flag (`true` when served from live web aggregator)
- `webSourceName`: Name of the external aggregator provider
- `webSourceUrl`: Direct link to external pricing source
- `crawledAt`: Observation timestamp for live web prices

## doctor_grade_formatting (ADR-0006)

Canonical doctor-grade price block layout (`packages/domain/src/format-price.ts`):
```text
نام دارو
قیمت: ۴۵۰٬۰۰۰ ریال (۴۵٬۰۰۰ تومان)
منبع: پیام داروساز (امروز / دیروز / N روز پیش)
```
- Primary currency: Rials (`ریال`)
- Secondary in parentheses: Tomans (`تومان`)
- Persian digits with thousands separator (`٬`)
- Includes freshness / age of the price
- Subjoined `📋 کپی` inline callback button delivering one-tap Markdown code span: `۴۵۰۰۰۰`

# Legacy Qanoon Webservices & Domain Specification Report

**Document Version:** 1.0.0  
**Author:** survey_spec_miner_2 (Legacy Qanoon Spec Miner)  
**Target Repository:** `/home/admin/PanelPH`  
**Reference Sources:**
- `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- `/home/admin/PanelPH/docs/adr/ADR-001-private-chatgpt-mcp-workspace.md`
- `/home/admin/PanelPH/docs/adr/ADR-002-qanoon-authorized-source-access.md`
- `/home/admin/PanelPH/docs/REFERENCE-DATA.md`
- `/home/admin/PanelPH/docs/UI-DESIGN.md`
- `/home/admin/projects/Bale-Med-Prices/docs/qanoon-webservices-notes.md` (`مستندات.pdf` extraction)
- `/home/admin/projects/Bale-Med-Prices/docs/pricing-rules.md`
- `/home/admin/projects/Bale-Med-Prices/docs/data-model.md`
- `/home/admin/projects/Bale-Med-Prices/docs/search-quality.md`
- `/home/admin/projects/Bale-Med-Prices/docs/adr/0001-use-qanoon-price-with-ttac-identity.md`
- Reference codebases: `/home/admin/projects/Bale-Med-Prices/packages/domain/src/`, `apps/api/src/`, `/home/admin/projects/bale-panel/`

---

## 1. Executive Summary & Specification Sources

The pharmacy operational layer (`PanelPH`) bridges human pharmacy workflows (captured quickly as unstructured free-text needs) with legacy pharmacy management software (**قانون / Qanoon Pharma**) and modern AI/MCP interfaces.

According to authoritative records (`ADR-002`, `qanoon-webservices-notes.md`, and `data-model.md`), Qanoon provides an HTTP REST API interface with JSON data exchange, designed for integration with web applications, e-commerce storefronts, and automated pharmacy kiosks. Because pharmacy inventory and prices fluctuate continuously due to OTC counter sales and prescription dispensation, the Qanoon protocol mandates:
1. **Repeated real-time stock checks** before finalizing drafts or sales batches.
2. **Strict idempotency via client-generated `uniqueId`** to prevent duplicate order rows, inventory double-allocation, or duplicate warehouse movements across network retries.
3. **Deterministic multi-tiered pricing calculation** factoring approved consumer retail prices (`sellPrice`), temporary fallback prices (`tempPrice`), dated tax/toll schedules, and technical dispensation fees.
4. **Decoupled catalog resolution** linking free-text drug needs to official Iranian Drug List identities (`genericCode`, `brandCode`, `dosageForm`, `strength`, and `TTAC/IRC`).

---

## 2. Legacy Qanoon REST Webservices Specification

### 2.1 Transport, Protocol & Headers
- **Protocol:** HTTP/1.1 or HTTPS
- **Payload Format:** `application/json; charset=utf-8`
- **Authentication & Authorization:**
  - Token or API Key in headers: `Authorization: Bearer <QANOON_API_KEY>` or `X-Qanoon-ApiKey: <API_KEY>`
  - Pharmacy / Terminal Identity: `X-Pharmacy-Id: <PHARMACY_ID>` (identifying the licensed pharmacy entity)
  - Client / Channel Identity: `X-Client-Id: <CLIENT_ID>` (e.g., `panelph-desk`, `kiosk-01`)
  - Request Tracing: `X-Request-Id: <UUID>`
  - Idempotency Header: `X-Unique-Id: <UNIQUE_TRANSACTION_ID>` (or passed directly inside payload)
- **Safety Boundary (ADR-002):**
  - No credentials or live endpoints hardcoded in repository or client configurations.
  - Every external call records timestamp, source key, duration, and status code.
  - In development and automated test modes, calls are intercepted by local mock fixtures.

### 2.2 Endpoint Definitions

#### Endpoint 1: Stock Availability Check
- **Route:** `POST /api/v1/stock/check` (Batch) and `GET /api/v1/stock/{goodId}` (Single)
- **Purpose:** Query real-time inventory levels for one or more medicines across pharmacy warehouses.
- **Batch Request Schema (`POST /api/v1/stock/check`):**
```json
{
  "warehouseId": "main",
  "items": [
    {
      "goodId": "g-1001",
      "genericCode": "00001",
      "quantity": 2
    },
    {
      "goodId": "g-1003",
      "genericCode": "14083",
      "quantity": 5
    }
  ]
}
```
- **Response Schema (200 OK):**
```json
{
  "warehouseId": "main",
  "checkedAt": "2026-10-14T09:30:00.000Z",
  "allAvailable": true,
  "items": [
    {
      "goodId": "g-1001",
      "genericCode": "00001",
      "requestedQuantity": 2,
      "availableCount": 140,
      "isAvailable": true,
      "stockStatus": "in_stock",
      "earliestExpDate": "2027-02-01",
      "avgCost": 132000,
      "unitLabel": "capsule"
    },
    {
      "goodId": "g-1003",
      "genericCode": "14083",
      "requestedQuantity": 5,
      "availableCount": 85,
      "isAvailable": true,
      "stockStatus": "in_stock",
      "earliestExpDate": "2026-12-15",
      "avgCost": 71000,
      "unitLabel": "tablet"
    }
  ]
}
```
- **Error Conditions & Codes:**
  - `400 Bad Request`: Missing `warehouseId` or empty items list.
  - `404 Not Found`: Unknown `warehouseId` or uncataloged `goodId`.
  - `200 OK with Partial Availability`: If `availableCount < requestedQuantity`, `isAvailable: false`, `stockStatus: "low_stock"` or `"out_of_stock"`.

#### Endpoint 2: Price Calculation & Tax Breakdown
- **Route:** `POST /api/v1/pricing/calculate`
- **Purpose:** Compute official consumer price, VAT/toll split, and technical fees.
- **Request Schema:**
```json
{
  "goodId": "g-1001",
  "quantity": 2,
  "documentDate": "2026-10-14",
  "includeTechnicalFee": true,
  "warehouseId": "main"
}
```
- **Response Schema (200 OK):**
```json
{
  "goodId": "g-1001",
  "title": "Amoxicillin 500mg Capsule",
  "persianTitle": "آموکسی سیلین ۵۰۰ میلی گرم",
  "quantity": 2,
  "unitBasePrice": 185000,
  "basePrice": 370000,
  "taxAmount": 13650,
  "tollAmount": 4550,
  "totalTax": 18200,
  "technicalFee": 30000,
  "finalPrice": 418200,
  "appliedTaxDate": "2026-01-01",
  "appliedTechnicalFeeDate": "2026-01-01",
  "avgCost": 264000,
  "profitAmount": 154200,
  "profitPercent": 58,
  "warnings": []
}
```

#### Endpoint 3: Goods / Catalog Search & Lookup
- **Route:** `GET /api/v1/goods/search?q={query}`
- **Purpose:** Search pharmacy catalog by Persian title, English title, generic code, barcode, or brand.
- **Response Schema (200 OK):**
```json
{
  "total": 1,
  "items": [
    {
      "id": "g-1001",
      "internalCode": "INT-1001",
      "barcode": "6261001100011",
      "genericCode": "00001",
      "brandCode": "00001",
      "title": "Amoxicillin 500mg Capsule",
      "persianTitle": "آموکسی سیلین ۵۰۰ میلی گرم",
      "brand": "Daya Darman",
      "dosageForm": "capsule",
      "strengthLabel": "500 mg",
      "patientFormLabel": "کپسول",
      "packageDescription": "بسته ۱۰۰ کپسولی",
      "countInPackage": 100,
      "unitLabel": "capsule",
      "packLabel": "box of 100 capsules",
      "sellPrice": 185000,
      "tempPrice": 179000,
      "nonPharma": false,
      "activeStatus": "active",
      "ttacCode": "TTAC-AMOX-500"
    }
  ]
}
```

#### Endpoint 4: Order Batch Reservation & Staging (with `uniqueId`)
- **Route:** `POST /api/v1/orders/batch`
- **Purpose:** Stage and reserve an order batch with strict idempotency protection.
- **Request Schema:**
```json
{
  "uniqueId": "ord-draft-42-b3f89a-1728900000",
  "draftId": "current-order-draft",
  "warehouseId": "main",
  "documentDate": "2026-10-14",
  "items": [
    {
      "goodId": "g-1001",
      "genericCode": "00001",
      "quantity": 2,
      "expectedUnitPrice": 185000
    }
  ],
  "notes": "Morning pharmacy restock batch"
}
```
- **Response Schema (201 Created / 200 OK Cached):**
```json
{
  "uniqueId": "ord-draft-42-b3f89a-1728900000",
  "orderId": "QAN-ORD-20261014-0089",
  "status": "reserved",
  "createdAt": "2026-10-14T09:30:15.000Z",
  "isIdempotentReplay": false,
  "totalItems": 1,
  "totalPrice": 418200,
  "items": [
    {
      "goodId": "g-1001",
      "genericCode": "00001",
      "quantity": 2,
      "unitPrice": 185000,
      "lineTotal": 418200,
      "allocatedWarehouse": "main"
    }
  ]
}
```

---

## 3. `uniqueId` Retry Semantics & Idempotency Protocol

Pharmacy retail environments suffer from dropped connections, POS timeouts, and repeated user button taps. Qanoon mandates a client-managed `uniqueId` protocol for state-mutating requests:

1. **Identifier Format & Determinism:**
   - Must be unique per operation lifecycle: e.g. UUIDv4 or formatted string `ord-{draftId}-{itemHash}-{timestamp}`.
   - PanelPH generates the `uniqueId` when creating or exporting an order batch.
2. **Backend Idempotency Cache:**
   - Qanoon caches `uniqueId` keys along with request payload hash and response status for a minimum 24-hour TTL.
3. **Idempotent Replay (Same `uniqueId`, Identical Payload):**
   - If an operation with the same `uniqueId` is received and already succeeded: Qanoon immediately returns the stored result with `isIdempotentReplay: true` (HTTP 200/201).
   - No duplicate warehouse reservations, no duplicate sales records, and no secondary stock decrement.
4. **Concurrent In-Flight Request:**
   - If a request arrives while the previous operation for that `uniqueId` is still processing: returns `409 Conflict` (or `425 Too Early`) with header `Retry-After: 2`.
5. **Payload Mismatch Conflict (Same `uniqueId`, Divergent Payload):**
   - If a request arrives with an existing `uniqueId` but modified items, quantities, or warehouse: returns `409 Conflict` with error code `UNIQUE_ID_PAYLOAD_MISMATCH`.
6. **Reversal / Compensating Protocol:**
   - Per PanelPH Event Sourcing rules (R4): Order cancellations or reverts never delete prior events. A compensating reversal request (`POST /api/v1/orders/{orderId}/cancel` or draft `event_reverted`) referencing `originalUniqueId` is issued.

---

## 4. Stock Availability Check Mechanics & Schemas

1. **Two-Stage Stock Verification Lifecycle:**
   - **Stage 1 (Resolution Time):** As soon as an item is matched from free-text to catalog, an asynchronous stock check is performed to display availability badges (`in_stock`, `low_stock`, `out_of_stock`) in the pharmacist review desk.
   - **Stage 2 (Pre-Export Barrier):** Immediately before finalizing or batching the draft, a fresh live stock check validates all items simultaneously to catch concurrent dispensations.
2. **Multi-Warehouse Allocation:**
   - Primary warehouse is `main` (dispensary shelf).
   - Secondary warehouses (e.g. `branch-2`, `storage`) can be queried if `main` has insufficient stock.
3. **Batch Expiration & FIFO/FEFO:**
   - Qanoon maintains `goods_last_stock` with `expDate`.
   - The stock check returns `earliestExpDate` so pharmacists can confirm batch viability before dispensing.
4. **Discrepancy Highlighting (PRD / UI-DESIGN):**
   - If `availableCount < requestedQuantity`, the draft item is flagged with status `needs_completion` or discrepancy badge `"موجودی ناکافی: موجود در انبار X عدد، درخواستی Y عدد"`.

---

## 5. Pricing Rules, Tax/Toll, and Validation Engine

The deterministic pricing engine extracted from Qanoon follows a 7-step sequence:

```
[Base Unit Price: sellPrice || tempPrice]
                │
                ▼
[Multiplied by Quantity: basePrice = round(unitPrice * qty)]
                │
                ▼
[Tax & Toll Resolution: lookup by good.taxCodes & documentDate]
        ├── totalTax = round(qty * appliedRate.averageTax)
        ├── taxAmount = round(totalTax * taxMultiplier) [e.g. 0.75]
        └── tollAmount = totalTax - taxAmount           [e.g. 0.25]
                │
                ▼
[Technical / Dispense Fee: lookup by effectiveDate & conditions]
        └── technicalFee = round(appliedRule.amount * qty) [if pharma & qty >= min]
                │
                ▼
[Final Consumer Price: finalPrice = basePrice + taxAmount + tollAmount + technicalFee]
                │
                ▼
[Audit & Cost Ledger: avgCost from stock, profitAmount, profitPercent]
                │
                ▼
[TTAC Divergence Guard: if |TTAC_price - Qanoon_price| > 10,000 Rial -> emit warning]
```

### Key Pricing Rules & Constraints:
1. **Price Priority:** `sellPrice` is primary. If 0 or absent, `tempPrice` is used and a warning is logged.
2. **Tax Multiplier:** Splits municipal tolls (25%) from government tax (75%) via `settings.taxMultiplier = 0.75`.
3. **Rounding:** Evaluated per `settings.roundingRule` (`"round"`, `"ceil"`, or `"floor"`).
4. **Non-Pharma Exemption:** `good.nonPharma == true` excludes medical technical dispense fees.
5. **TTAC Discrepancy Guard (ADR-0001):**
   - If TTAC price differs from Qanoon unit price by more than 10,000 Rials per unit, a warning is attached (`"اختلاف قیمت مصوب تیتک و قانون بیش از ۱۰٬۰۰۰ ریال است"`).
   - A higher TTAC price NEVER replaces the approved Qanoon price automatically.
6. **Insurance Deductions (REFERENCE-DATA.md):**
   - Standard data includes `sahmSazmanAmount` and `sahmSazmanPercent`. In the prototype phase, insurance deductions require explicit human confirmation.

---

## 6. Medicine Catalog Resolution Fields & Mapping Rules

### 6.1 Field Schema & Types

| Field Name | Type | Constraint | Description | Source |
|---|---|---|---|---|
| `genericCode` | `string` | Mandatory, text | Generic code from National Drug List. **Must retain leading zeroes** (e.g. `"00001"`, `"04210"`). | REFERENCE-DATA.md / Qanoon |
| `brandCode` | `string` | Optional, text | Brand/manufacturer code. **Must retain leading zeroes**. | REFERENCE-DATA.md / Qanoon |
| `title` | `string` | Mandatory | Primary product name (English or bilingual). | Qanoon catalog / TTAC |
| `persianTitle` | `string` | Mandatory | Canonical Persian name (e.g. `"آموکسی سیلین ۵۰۰ میلی گرم"`). | Qanoon / Bale-Med-Prices |
| `englishTitle` | `string` | Optional | English non-proprietary or commercial title. | Qanoon / Bale-Med-Prices |
| `dosageForm` | `string` | Mandatory | Normalized dosage form (`tablet`, `capsule`, `syrup`, `injection`, `cream`, `ointment`, `suppository`). | Qanoon / Bale-Med-Prices |
| `patientFormLabel` | `string` | Mandatory | Patient/pharmacist-facing Persian form label (`قرص`, `کپسول`, `شربت`, `آمپول`, `کرم`, `پماد`, `شیاف`). | Qanoon / UI-DESIGN.md |
| `routeQualifier` | `string` | Optional | Administration site qualifier (`ophthalmic`, `otic`, `nasal`, `oral`, `rectal`, `topical`). | search-quality.md |
| `strength` / `strengthLabel` | `string` | Mandatory | Dosage strength (e.g. `"500 mg"`, `"۱۰ میلی‌گرم / ۵ میلی‌لیتر"`, `"۵٪"`). | REFERENCE-DATA.md / catalog |
| `ttacCode` / `ircCode` | `string` | Optional | TTAC Iran Registration Code (`IRC-XXXXX` or `TTAC-XXXXX`). | ADR-0001 / TTAC |
| `barcode` / `gtin` | `string` | Optional | GS1 GTIN barcode (13–14 digits, e.g. `6261001100011`). | Qanoon goods |
| `packageDescription` / `packLabel` | `string` | Optional | Commercial packaging descriptor (`بسته ۱۰۰ کپسولی`, `box of 100 capsules`). | Qanoon goods |
| `countInPackage` | `integer` | Positive | Number of consumption units per box/pack. | Qanoon goods |
| `nonPharma` | `boolean` | Default `false` | Distinguishes medicine from cosmetics, supplements, and supplies. | Qanoon goods |
| `activeStatus` | `string` | Enum | `"active" | "inactive" | "unknown"`. Inactive medicines are de-prioritized in resolution. | search-quality.md |

### 6.2 Normalization & Fuzzy Resolution Pipeline
Free-text pharmacist entry (`"استامینوفن ۵۰۰"` or `"کرم بزرگسال"`) is resolved via:
1. **Digit Normalization:** Convert all Persian (`۰-۹`) and Arabic (`٠-٩`) numerals to ASCII (`0-9`).
2. **Orthography Normalization:** Convert Arabic `ي`/`ى` -> `ی`, Arabic `ك` -> `ک`, strip ZWNJ / half-spaces (`\u200c`), strip diacritics / tashkeel / kashida.
3. **Unit Standardizing:** Expand/normalize unit abbreviations (`میلی گرم`, `مگ`, `م.گ`, `milligrams` -> `mg`).
4. **Tokenization:** Split along letter-digit boundaries (`acetaminophen500` -> `acetaminophen 500`).
5. **Ranked Matching:** Check title, aliases, form, strength, and qualifier.
6. **Ambiguity Handling:**
   - Single match with identical form/strength -> Suggested as exact candidate.
   - Multiple candidate forms/strengths -> Retained with status `needs_completion` and ambiguity descriptor (`"استامینوفن: شکل و برند"`).
   - Zero match -> Free-text need is preserved safely without error or blocking.

---

## 7. Mock Fixture Requirements for Isolated Testing

To fulfill Acceptance Criteria without connecting to external networks or live pharmacy installations, the following mock fixture datasets are required:

1. **`fixtures/qanoon-catalog.json`**:
   - Comprehensive set of 15–20 representative pharmaceutical and non-pharma goods.
   - Covering all dosage forms (tablet, capsule, syrup, cream, injection, suppository, drops).
   - Solid variety of generic and brand codes (specifically testing string preservation with leading zeroes like `"00001"`).
   - Both pharma items (`nonPharma: false`) and cosmetic/supplement items (`nonPharma: true`).
2. **`fixtures/qanoon-stock.json`**:
   - Stock snapshots for warehouses `main` and `branch-2`.
   - Test cases:
     - Plentiful stock (`availableCount > 100`).
     - Low stock (`availableCount = 2`).
     - Zero stock (`availableCount = 0`).
     - Expired stock records (where `expDate < today`).
3. **`fixtures/qanoon-pricing.json`**:
   - Tax tables (`TAX_MED_STANDARD`, `TAX_MED_REDUCED`, `TAX_COSMETIC`, `TAX_SUPPLEMENT`) with historical date steps (`2025-01-01`, `2026-01-01`).
   - Technical fee schedules with `excludeNonPharma` and `minimumQuantity` rules.
   - Items with only `tempPrice` (testing fallback warning).
   - Items with TTAC price differences > 10,000 Rials (testing warning generation).
4. **`fixtures/qanoon-orders.json`**:
   - Idempotency test cases:
     - Preset `uniqueId` keys for testing replay of successful batch submission.
     - Conflicting payload test fixture for testing HTTP 409 conflict.
     - Order cancellation / compensating reversal records.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Adapter / Web | Stock Check Service (`/stock/check`) | Batch or single stock verification across pharmacy warehouses | `warehouseId`, `items: [{goodId, quantity}]` | `allAvailable: boolean`, `items: [{isAvailable, availableCount, avgCost, earliestExpDate}]` | Returns `400` on empty list, `404` on invalid warehouse, `200` with `isAvailable: false` on shortage | `qanoon-webservices-notes.md`, `data-model.md` |
| 2 | Adapter / Web | Idempotent Order Batching (`/orders/batch`) | Submits order batch with client-generated `uniqueId` token | `uniqueId`, `warehouseId`, `items`, `documentDate` | `orderId`, `status: "reserved"`, `isIdempotentReplay: boolean`, `totalPrice` | Returns `409` on concurrent in-flight or payload conflict for existing `uniqueId` | `qanoon-webservices-notes.md`, `ORIGINAL_REQUEST.md` |
| 3 | Adapter / Web | Multi-warehouse routing | Queries distinct pharmacy locations (shelf dispensary vs back warehouse) | `warehouseId` (e.g. `"main"`, `"branch-2"`) | Specific warehouse inventory and cost snapshot | Falls back to default warehouse if unspecified | `data-model.md`, `mock-data.ts` |
| 4 | Pricing | Deterministic Pricing Engine | Calculates final consumer price from base price, tax, toll, and technical fees | `goodId`, `quantity`, `documentDate`, `includeTechnicalFee`, `warehouseId` | `unitBasePrice`, `basePrice`, `taxAmount`, `tollAmount`, `technicalFee`, `finalPrice`, `avgCost`, `profitAmount`, `warnings` | Returns `400` on missing goodId or documentDate; falls back to `tempPrice` with warning | `pricing-rules.md`, `calculate-final-price.ts` |
| 5 | Pricing | Tax & Municipal Toll Split | Breaks down average tax into government VAT (75%) and municipal toll (25%) | `quantity`, `documentDate`, `taxData`, `taxMultiplier` (0.75), `roundingRule` | `taxAmount`, `tollAmount`, `totalTax`, `appliedRate` | Returns 0 tax with warning if tax table or matching date row is missing | `calculate-tax.ts`, `data-model.md` |
| 6 | Pricing | Technical Dispense Fee Rule | Adds dispensary fee for prescription drugs meeting date and quantity conditions | `quantity`, `documentDate`, `technicalFeeRules`, `includeTechnicalFee` | `technicalFee: number`, `appliedRule` | Excludes fee for non-pharma goods or if quantity < minimum; emits warning if not found | `calculate-final-price.ts`, `data-model.md` |
| 7 | Pricing | Profit & Average Cost Ledger | Computes operational profit and profit margin against warehouse weighted average cost | `finalPrice`, `avgCost` | `profitAmount: number \| null`, `profitPercent: number \| null` | Returns null if average cost is unavailable for warehouse | `calculate-profit.ts`, `data-model.md` |
| 8 | Pricing | TTAC Discrepancy Guard | Attaches warning if derived TTAC price differs from Qanoon price by > 10,000 Rials | `good.sources`, `qanoonPrice`, `ttacPrice` | Price warning message; Qanoon price is preserved | Warning attached without modifying base price | `ADR-0001`, `pricing-rules.md` |
| 9 | Catalog | Leading Zero Code Preservation | Generic and brand codes are strictly stored as strings to prevent losing leading zeroes | `genericCode: "00001"`, `brandCode: "00001"` | Preserved string representations | Numeric conversion strips leading zero, causing catalog mismatch | `REFERENCE-DATA.md`, `catalog.sample.json` |
| 10 | Catalog | Persian & Arabic Normalization | Normalizes digits, Yeh/Kaf, diacritics, and units (`میلی گرم` -> `mg`) | Raw query string | Clean normalized token array | Handles noisy punctuation and letter-digit boundaries safely | `search-normalization.ts`, `search-quality.md` |
| 11 | Catalog | Multi-Field Catalog Resolution | Matches query against titles, aliases, forms, strength, and brand | `query`, `catalog` | Best matching goods sorted by deterministic relevance score | Returns empty list if no token matches; does not throw | `goods-repository.ts`, `search-quality.md` |
| 12 | Catalog | Route & Qualifier Disambiguation | Distinguishes administration site (eye, ear, nose, topical) | `routeQualifier` (`"ophthalmic"`, `"otic"`, `"topical"`) | Disambiguated patient labels (`قطره چشمی`, `قطره گوشی`) | Prompts user if form is clear but route qualifier is ambiguous | `pricing-rules.md`, `search-quality.md` |
| 13 | Domain / UX | Free-Text Need Capture | Accepts unstructured drug needs immediately without requiring catalog match | `name`, `quantity`, `unit`, `note` | Draft item created with status `needs_completion` | Validates non-empty name and positive quantity; never blocks on catalog failure | `PRD.md`, `draft-store.js` |
| 14 | Domain / UX | Human Confirmation Barrier | Suggested catalog match only resolves a draft need upon pharmacist confirmation | `needId`, `reference: {title, genericCode, brandCode, dosageForm, strength}` | Item status updated to `ready_for_review` | Rejects missing reference title with error | `ADR-001`, `ADR-002`, `PRD.md` |
| 15 | Domain / UX | Event-Sourced Reversibility | Appends compensating events for undo/revert instead of mutating history | `eventId` to revert | Restores previous item state; appends `event_reverted` event | Returns error if `eventId` not found; history remains monotonic | `ORIGINAL_REQUEST.md`, `draft-store.js` |
| 16 | Domain / UX | Draft Status Derivation | Dynamically calculates draft health (`open`, `needs_completion`, `ready_for_review`) | Items list | Overall draft status and summary counts (`itemCount`, `ambiguityCount`) | An empty draft defaults to `open` | `draft-store.js`, `UI-DESIGN.md` |
| 17 | Mock / Fixture | Qanoon Mock Adapter Provider | Emulates Qanoon REST API endpoints in-memory for testing without network | Mock fixture files | Realistic JSON responses with timing and headers | Emulates HTTP 400, 404, 409 status codes for failure scenarios | `ORIGINAL_REQUEST.md`, `DEVELOPMENT.md` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Stock Check | Requested quantity exceeds available warehouse count (`req: 10`, `avail: 2`) | Stock check returns `isAvailable: false`, `availableCount: 2`, `stockStatus: "low_stock"`. PanelPH highlights discrepancy without crashing. |
| 2 | Stock Check | Good exists in catalog but has 0 records in `goods_last_stock` | Returns `availableCount: 0`, `isAvailable: false`, `avgCost: null`, `stockStatus: "out_of_stock"`. |
| 3 | Stock Check | Multiple stock batches exist with different expiration dates | Adapter sorts batches by `expDate` ascending (FEFO) and returns `earliestExpDate` for dispensation safety. |
| 4 | UniqueId Retry | Duplicate batch submission with identical `uniqueId` and identical payload | Server recognizes cached key, returns HTTP 200/201 with stored order ID and `isIdempotentReplay: true`; inventory is not decremented twice. |
| 5 | UniqueId Retry | Replay with identical `uniqueId` but modified items/quantities | Server rejects request with `409 Conflict` and error code `UNIQUE_ID_PAYLOAD_MISMATCH`. |
| 6 | Pricing | `sellPrice` is 0 or null, but valid `tempPrice` exists | System uses `tempPrice` for base calculation and adds warning: `"Used tempPrice because sellPrice was not available."` |
| 7 | Pricing | Item has `nonPharma: true` (cosmetic/cream) and technical fee is requested | Technical fee evaluator checks `excludeNonPharma` condition and outputs `technicalFee: 0`. |
| 8 | Pricing | Historical document date (`documentDate: "2024-01-01"`) precedes tax table rows | `appliedRate` is null; `taxAmount: 0`, and warning attached: `"No tax rate matched the selected document date."` |
| 9 | Pricing | Derived TTAC unit price is 15,000 Rials higher than Qanoon unit price | Price calculation succeeds using approved Qanoon price; patient/pharmacist warning is emitted noting the >10,000 Rial discrepancy. |
| 10 | Catalog Code | `genericCode: "00001"` parsed via naive JSON number parser | Numeric parsing converts to `1`, stripping leading zeroes and causing failed joins against reference data. Must remain string type. |
| 11 | Normalization | Noisy Persian input with mixed numerals and unspaced boundary: `"استامينوفن۵۰۰ميلي گرم"` | Normalized to `"استامینوفن 500 mg"`; correctly matches `Amoxicillin 500mg` / `Acetaminophen 500mg`. |
| 12 | Normalization | Input with Arabic Kaf and Yeh: `"كپسول آموكسي"` | Converted to Persian Kaf (`ک`) and Yeh (`ی`) -> `"کپسول آموکسی"` -> matches catalog. |
| 13 | Revert Event | Reverting a `need_added` event | Compensating event `event_reverted` removes the newly added item from the active draft while preserving both events in audit log. |
| 14 | Revert Event | Reverting a `need_resolved` event | Compensating event `event_reverted` restores `resolvedReference: null` and sets status back to `needs_completion`. |
| 15 | Free-Text Entry | Need entry with empty or whitespace-only name (`name: "   "`) | Rejected immediately with localized validation error: `"نام نیاز لازم است."` |
| 16 | Free-Text Entry | Need entry with zero or negative quantity (`quantity: -1` or `0`) | Rejected immediately with localized validation error: `"تعداد باید بزرگ‌تر از صفر باشد."` |
| 17 | Order Desk UI | Draft containing 5 items where 4 are resolved and 1 is unresolved | Overall draft status is `needs_completion`; summary indicates `itemCount: 5, ambiguityCount: 1`. |

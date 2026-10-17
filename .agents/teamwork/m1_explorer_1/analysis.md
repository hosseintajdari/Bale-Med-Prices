# Analysis: Legacy Qanoon Ingestion & API Adapter Boundary (Milestone 1)

**Target Component:** `src/adapters/qanoon-adapter.js`  
**Mock Fixture:** `fixtures/qanoon-mock-data.json`  
**Author:** `m1_explorer_1` (Qanoon Adapter Explorer)  
**Date:** 2026-10-14  

---

## 1. Executive Summary & Boundary Architecture

PanelPH bridges rapid, unstructured pharmacy counter entries with legacy pharmacy ERP systems (**قانون / Qanoon Pharma**) and AI MCP clients. Legacy Qanoon systems handle inventory accounting, approved retail prices, and order batch bookings.

Per **ADR-002** and **PROJECT.md**, direct coupling between PanelPH domain logic (`src/server.js`, `src/draft-store.js`, `src/catalog-resolver.js`) and Qanoon wire protocols is strictly forbidden:
1. **Decoupling Boundary:** All communication with Qanoon is encapsulated inside `src/adapters/qanoon-adapter.js`. The adapter translates Qanoon HTTP JSON payloads into clean, normalized PanelPH domain objects.
2. **100% Offline Mock Mode:** The adapter must operate seamlessly in offline/testing mode using local fixtures (`fixtures/qanoon-mock-data.json`) without external network calls, socket connections, or credentials.
3. **Strict Idempotency:** The adapter enforces a 24-hour cache for `uniqueId` tokens to prevent duplicate order generation or inventory double-allocation across network retries.
4. **Deterministic Calculation:** The adapter encapsulates the 7-step pricing sequence, 75/25 VAT/toll split, technical dispense fees, and >10,000 Rial TTAC divergence checks.
5. **String Identity Preservation:** Generic codes (e.g. `"00001"`) and brand codes must remain strings with leading zeros preserved across all calls.

---

## 2. Adapter Interface Boundary Design (`src/adapters/qanoon-adapter.js`)

### 2.1 Module Exports & Factory

The module must export:
- `export class QanoonAdapter`: The primary adapter class.
- `export function createQanoonAdapter(options)`: Factory function returning an instance of `QanoonAdapter`.
- Custom error hierarchy classes: `QanoonAdapterError`, `QanoonAuthenticationError`, `QanoonNotFoundError`, `QanoonConflictError`, `QanoonNetworkTimeoutError`, `QanoonServerError`, `QanoonValidationError`.

### 2.2 Constructor Options & Default Fallbacks

```javascript
export class QanoonAdapter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? process.env.QANOON_API_BASE_URL ?? "https://api.qanoon.local/v1";
    this.apiKey = options.apiKey ?? process.env.QANOON_API_KEY ?? null;
    this.pharmacyId = options.pharmacyId ?? process.env.QANOON_PHARMACY_ID ?? "ph-main-01";
    this.clientId = options.clientId ?? process.env.QANOON_CLIENT_ID ?? "panelph-desk";
    this.timeoutMs = Number(options.timeoutMs ?? process.env.QANOON_TIMEOUT_MS ?? 5000);
    
    // Auto-detect offline mock mode:
    // If explicitly set, use it. Otherwise, if no apiKey or baseUrl is provided,
    // or if NODE_ENV === "test", default to mockMode = true.
    this.mockMode = options.mockMode ?? (
      process.env.QANOON_MOCK_MODE === "true" ||
      process.env.NODE_ENV === "test" ||
      (!options.apiKey && !process.env.QANOON_API_KEY)
    );

    this.fixturePath = options.fixturePath ?? null;
    this.inMemoryFixtures = options.fixtures ?? null;
    this.idempotencyTtlMs = options.idempotencyTtlMs ?? (24 * 60 * 60 * 1000); // 24 hours

    // In-memory 24-hour idempotency cache:
    // Map<uniqueId, { response: object, payloadHash: string, createdAt: number, expiresAt: number }>
    this.idempotencyCache = new Map();

    // Lazy-loaded or pre-loaded fixtures
    this._loadedFixtures = null;
  }
}
```

### 2.3 Required Public Interface Contracts

The interface strictly satisfies `PROJECT.md` section "Interface Contracts":

#### Method 1: `checkStock({ genericCode, brandCode, goodId, warehouseId = "main", requestedCount = 1 })`
- **Purpose:** Two-stage stock verification:
  - Stage 1: Preliminary advisory check when resolving a draft need.
  - Stage 2: Final pre-batch barrier check immediately before exporting an order.
- **Parameters:**
  - `genericCode` (`string`, optional if `goodId` supplied): National drug code, e.g. `"00001"`.
  - `brandCode` (`string`, optional): Brand qualifier code.
  - `goodId` (`string`, optional): Direct catalog good identifier, e.g. `"g-1001"`.
  - `warehouseId` (`string`, default `"main"`): Target warehouse ID (`"main"`, `"branch-2"`).
  - `requestedCount` (`number`, default `1`): Number of units requested.
- **Return Contract:**
  ```typescript
  {
    inStock: boolean;
    availableCount: number;
    warehouseId: string;
    advisoryWarning?: string;
    earliestExpDate?: string;
    avgCost?: number | null;
  }
  ```
- **Operational Rules:**
  - `inStock` is `true` if and only if `availableCount >= requestedCount` and `availableCount > 0`.
  - If `availableCount === 0`, `inStock` is `false`, and `advisoryWarning` is `"کالا در انبار موجود نیست."`.
  - If `availableCount < requestedCount`, `inStock` is `false`, and `advisoryWarning` is `"موجودی ناکافی: موجود در انبار ${availableCount} عدد، درخواستی ${requestedCount} عدد"`.
  - If batches are expired (`earliestExpDate < today`), `inStock` is `false` and warning flags expired lot.

#### Method 2: `calculatePrice({ goodId, quantity = 1, documentDate, includeTechnicalFee = true, roundingRule = "round", warehouseId = "main" })`
- **Purpose:** Compute official consumer price with 75/25 VAT/toll split, technical fee, and >10,000 Rial TTAC divergence protection.
- **Parameters:**
  - `goodId` (`string`, required): Good identifier, e.g. `"g-1001"`.
  - `quantity` (`number`, default `1`): Number of items.
  - `documentDate` (`string`, default today `YYYY-MM-DD`): Pricing effective date.
  - `includeTechnicalFee` (`boolean`, default `true`): Whether dispense fee applies.
  - `roundingRule` (`"round" | "ceil" | "floor"`, default `"round"`).
  - `warehouseId` (`string`, default `"main"`): For inventory average cost lookup.
- **Return Contract:**
  ```typescript
  {
    goodId: string;
    unitBasePrice: number;
    basePrice: number;
    vatAmount: number;
    tollAmount: number;
    technicalFee: number;
    finalPrice: number;
    warnings: string[];
    avgCost?: number | null;
    profitAmount?: number | null;
    profitPercent?: number | null;
  }
  ```
- **Operational Rules (7-Step Engine):**
  1. Base unit price priority: `good.sellPrice || good.tempPrice || 0`. If `sellPrice` is absent and `tempPrice` is used, emit warning: `"Used tempPrice because sellPrice was not available."`
  2. `basePrice = roundValue(unitBasePrice * quantity, roundingRule)`.
  3. Total tax resolution: Query tax table for `documentDate`. `totalTax = roundValue(quantity * averageTax, roundingRule)`.
  4. VAT/Toll split (75/25): `vatAmount = roundValue(totalTax * 0.75, roundingRule)`; `tollAmount = totalTax - vatAmount`.
  5. Technical fee resolution: If `includeTechnicalFee` is true and `!good.nonPharma` and `quantity >= rule.conditions.minimumQuantity`, `technicalFee = roundValue(rule.amount * quantity, roundingRule)`. Otherwise `0`.
  6. Final price: `finalPrice = basePrice + vatAmount + tollAmount + technicalFee`.
  7. TTAC Divergence Guard: If `good.ttacPrice` or source TTAC exists and `Math.abs(good.ttacPrice - unitBasePrice) > 10000`, add warning: `"اختلاف قیمت مصوب تیتک و قانون بیش از ۱۰٬۰۰۰ ریال است"`. (TTAC price does NOT overwrite approved Qanoon price).

#### Method 3: `createBatchOrder({ draftId, uniqueId, items, warehouseId = "main", notes = "" })`
- **Purpose:** Stage and commit order batch with 24-hour idempotent retry protection.
- **Parameters:**
  - `draftId` (`string`, required): Local draft identifier.
  - `uniqueId` (`string`, required): Client-generated stable idempotency token.
  - `items` (`Array<{ goodId: string, genericCode: string, quantity: number, price?: number }>`): Order items.
  - `warehouseId` (`string`, default `"main"`).
  - `notes` (`string`, optional).
- **Return Contract:**
  ```typescript
  {
    success: boolean;
    batchId: string;
    uniqueId: string;
    timestamp: string;
    status: "SUBMITTED" | "CACHED";
    totalItems: number;
    totalPrice?: number;
    items?: Array<object>;
  }
  ```
- **Operational Rules:**
  - Throws `QanoonValidationError` if `uniqueId` or `items` is missing or empty.
  - Idempotency Cache Lookup:
    - If `uniqueId` was submitted within 24 hours:
      - Compare payload hash/fingerprint.
      - If fingerprint matches: return cached response with `status: "CACHED"`, `success: true`.
      - If fingerprint differs: throw `QanoonConflictError("UNIQUE_ID_PAYLOAD_MISMATCH: uniqueId reused with different order items")`.
    - If `uniqueId` is new:
      - In mock mode: generate `batchId: "QAN-ORD-" + Date.now()`, cache response, return `status: "SUBMITTED"`.
      - In live mode: issue `POST /orders/batch` with header `X-Unique-Id: uniqueId`.

#### Method 4: `searchGoods({ query, limit = 20 })`
- **Purpose:** Catalog lookup across generic codes, titles, barcodes, and brands.
- **Parameters:**
  - `query` (`string`, required): Search string (English or Persian).
  - `limit` (`number`, default `20`).
- **Return Contract:**
  ```typescript
  Array<{
    goodId: string;
    genericCode: string;
    brandCode: string;
    title: string;
    persianTitle: string;
    dosageForm: string;
    strength: string;
    sellPrice: number;
    tempPrice?: number;
    nonPharma: boolean;
  }>
  ```
- **Operational Rules:**
  - Strict string preservation: `genericCode` and `brandCode` must NEVER be parsed as numbers. Leading zeroes (e.g. `"00001"`) must be intact.
  - Case-insensitive, Persian/Arabic normalized token search over `title`, `persianTitle`, `genericCode`, `brandCode`, `barcode`, and `aliases`.

---

## 3. Mock Mode & Offline Isolation Strategy

To satisfy Acceptance Criteria ("100% passing tests without live external network dependencies"):

1. **Automatic Zero-Config Mocking:**
   - When running tests (`node --test`), `NODE_ENV === "test"` or the absence of `QANOON_API_KEY` automatically activates `mockMode: true`.
   - In `mockMode: true`, no external HTTP requests or network sockets are opened.
2. **Fixture Loading:**
   - Synchronous or cached asynchronous load of `fixtures/qanoon-mock-data.json`.
   - Support for custom in-memory fixtures injected directly via `new QanoonAdapter({ fixtures: customData })` to facilitate isolated unit testing of edge cases without disk I/O.
3. **Reproducible Calculations:**
   - Stock counts, pricing tables, tax multipliers (0.75), technical fee rules, and order bookings run deterministically against in-memory state.

---

## 4. Error Classification & Network Resiliency Hierarchy

```
Error
 └── QanoonAdapterError (base class: statusCode, code, endpoint, details)
      ├── QanoonValidationError (HTTP 400: missing fields, invalid types)
      ├── QanoonAuthenticationError (HTTP 401/403: invalid API key or pharmacy ID)
      ├── QanoonNotFoundError (HTTP 404: unknown goodId or warehouse)
      ├── QanoonConflictError (HTTP 409: uniqueId reuse conflict, payload mismatch)
      ├── QanoonNetworkTimeoutError (HTTP 504 / AbortError: request exceeded timeoutMs)
      └── QanoonServerError (HTTP 500/502/503: Qanoon backend outage)
```

### Timeout Handling:
- In live mode, every `fetch` request is wrapped with `AbortSignal.timeout(this.timeoutMs)`.
- If the signal aborts, the catch block intercepts `TimeoutError` or `AbortError` and re-throws a typed `QanoonNetworkTimeoutError` with the endpoint and timeout duration.
- In mock mode, an optional `simulateTimeout: true` or `simulateError` flag can be tested.

---

## 5. Mock Fixture Specification (`fixtures/qanoon-mock-data.json`)

The mock fixture file must be structured as follows:

```json
{
  "$schema": "panelph-qanoon-mock-v1",
  "version": "1.0.0",
  "description": "Comprehensive mock fixtures for Qanoon Adapter offline execution and testing",
  "goods": [
    {
      "id": "g-1001",
      "genericCode": "00001",
      "brandCode": "00001",
      "barcode": "6261001100011",
      "title": "Acetaminophen 500mg Tablet",
      "persianTitle": "استامینوفن ۵۰۰ میلی‌گرم",
      "dosageForm": "قرص",
      "strengthLabel": "۵۰۰ میلی‌گرم",
      "unitLabel": "قرص",
      "packLabel": "جعبه ۱۰۰ عددی",
      "sellPrice": 120000,
      "tempPrice": 115000,
      "taxCodes": ["TAX_MED_STANDARD"],
      "nonPharma": false,
      "ttacCode": "TTAC-ACET-500",
      "ttacPrice": 120000,
      "aliases": ["استامینوفن", "acetaminophen", "paracetamol"]
    },
    {
      "id": "g-1002",
      "genericCode": "00002",
      "brandCode": "00002",
      "barcode": "6261001100028",
      "title": "Amoxicillin 500mg Capsule",
      "persianTitle": "آموکسی سیلین ۵۰۰ میلی گرم",
      "dosageForm": "کپسول",
      "strengthLabel": "۵۰۰ میلی‌گرم",
      "unitLabel": "کپسول",
      "packLabel": "بسته ۱۰۰ کپسولی",
      "sellPrice": 185000,
      "tempPrice": 179000,
      "taxCodes": ["TAX_MED_STANDARD"],
      "nonPharma": false,
      "ttacCode": "TTAC-AMOX-500",
      "ttacPrice": 200000,
      "aliases": ["آموکسی", "amoxicillin"]
    },
    {
      "id": "g-1003",
      "genericCode": "14083",
      "brandCode": "14083",
      "barcode": "6261001100035",
      "title": "Educational Sample Vial",
      "persianTitle": "نمونه آموزشی ویال",
      "dosageForm": "ویال",
      "strengthLabel": "۱۰ میلی‌گرم / ۵ میلی‌لیتر",
      "unitLabel": "ویال",
      "packLabel": "جعبه ۱۰ عددی",
      "sellPrice": 95000,
      "tempPrice": 90000,
      "taxCodes": ["TAX_MED_STANDARD"],
      "nonPharma": false,
      "ttacCode": "TTAC-VIAL-14083",
      "ttacPrice": 95000,
      "aliases": ["ویال", "sample vial"]
    },
    {
      "id": "g-1004",
      "genericCode": "00420",
      "brandCode": "00010",
      "barcode": "6261001100042",
      "title": "Ciprofloxacin 500mg Tablet",
      "persianTitle": "سیپروفلوکساسین ۵۰۰ میلی‌گرم",
      "dosageForm": "قرص",
      "strengthLabel": "۵۰۰ میلی‌گرم",
      "unitLabel": "قرص",
      "packLabel": "جعبه ۳۰ عددی",
      "sellPrice": 240000,
      "tempPrice": 230000,
      "taxCodes": ["TAX_MED_STANDARD"],
      "nonPharma": false,
      "ttacCode": "TTAC-CIPRO-500",
      "ttacPrice": 240000,
      "aliases": ["سیپرو", "cipro"]
    },
    {
      "id": "g-1005",
      "genericCode": "00512",
      "brandCode": "00015",
      "barcode": "6261001100059",
      "title": "Diphenhydramine Compound Syrup",
      "persianTitle": "دیفن هیدرامین کامپاند شربت",
      "dosageForm": "شربت",
      "strengthLabel": "۶۰ میلی‌لیتر",
      "unitLabel": "بطری",
      "packLabel": "بطری ۶۰ میلی‌لیتر",
      "sellPrice": 160000,
      "tempPrice": 150000,
      "taxCodes": ["TAX_MED_STANDARD"],
      "nonPharma": false,
      "ttacCode": "TTAC-DIPH-60",
      "ttacPrice": 160000,
      "aliases": ["دیفن", "diphenhydramine"]
    },
    {
      "id": "g-1006",
      "genericCode": "00999",
      "brandCode": "00099",
      "barcode": "6261001100066",
      "title": "Moisturizing Cream Derma",
      "persianTitle": "کرم مرطوب کننده دست و صورت",
      "dosageForm": "کرم",
      "strengthLabel": "۵۰ میلی‌لیتر",
      "unitLabel": "تیوپ",
      "packLabel": "تیوپ ۵۰ میلی‌لیتر",
      "sellPrice": 350000,
      "tempPrice": 350000,
      "taxCodes": ["TAX_COSMETIC"],
      "nonPharma": true,
      "ttacCode": null,
      "ttacPrice": null,
      "aliases": ["مرطوب کننده", "moisturizer"]
    },
    {
      "id": "g-1007",
      "genericCode": "00777",
      "brandCode": "00077",
      "barcode": "6261001100073",
      "title": "Temporary Priced Item Only",
      "persianTitle": "داروی آزمایشی با قیمت موقت",
      "dosageForm": "قرص",
      "strengthLabel": "۱۰ میلی‌گرم",
      "unitLabel": "قرص",
      "packLabel": "جعبه ۲۰ عددی",
      "sellPrice": 0,
      "tempPrice": 145000,
      "taxCodes": ["TAX_MED_STANDARD"],
      "nonPharma": false,
      "ttacCode": null,
      "ttacPrice": null,
      "aliases": ["قیمت موقت"]
    }
  ],
  "stock": [
    {
      "warehouseId": "main",
      "goodId": "g-1001",
      "genericCode": "00001",
      "brandCode": "00001",
      "availableCount": 140,
      "earliestExpDate": "2027-02-01",
      "avgCost": 85000
    },
    {
      "warehouseId": "main",
      "goodId": "g-1002",
      "genericCode": "00002",
      "brandCode": "00002",
      "availableCount": 2,
      "earliestExpDate": "2026-12-15",
      "avgCost": 132000
    },
    {
      "warehouseId": "main",
      "goodId": "g-1003",
      "genericCode": "14083",
      "brandCode": "14083",
      "availableCount": 0,
      "earliestExpDate": "2026-08-01",
      "avgCost": 71000
    },
    {
      "warehouseId": "main",
      "goodId": "g-1004",
      "genericCode": "00420",
      "brandCode": "00010",
      "availableCount": 45,
      "earliestExpDate": "2024-01-01",
      "avgCost": 160000
    },
    {
      "warehouseId": "main",
      "goodId": "g-1005",
      "genericCode": "00512",
      "brandCode": "00015",
      "availableCount": 80,
      "earliestExpDate": "2027-05-10",
      "avgCost": 110000
    },
    {
      "warehouseId": "main",
      "goodId": "g-1006",
      "genericCode": "00999",
      "brandCode": "00099",
      "availableCount": 25,
      "earliestExpDate": "2028-01-01",
      "avgCost": 220000
    },
    {
      "warehouseId": "main",
      "goodId": "g-1007",
      "genericCode": "00777",
      "brandCode": "00077",
      "availableCount": 50,
      "earliestExpDate": "2027-09-01",
      "avgCost": 100000
    },
    {
      "warehouseId": "branch-2",
      "goodId": "g-1003",
      "genericCode": "14083",
      "brandCode": "14083",
      "availableCount": 20,
      "earliestExpDate": "2027-01-15",
      "avgCost": 72000
    }
  ],
  "taxRates": {
    "TAX_MED_STANDARD": {
      "code": "TAX_MED_STANDARD",
      "title": "Standard Medicine VAT",
      "averageTaxes": [
        { "date": "2025-01-01", "averageTax": 14000 },
        { "date": "2026-01-01", "averageTax": 18200 }
      ]
    },
    "TAX_COSMETIC": {
      "code": "TAX_COSMETIC",
      "title": "Cosmetics & Supplies Tax",
      "averageTaxes": [
        { "date": "2025-01-01", "averageTax": 20000 },
        { "date": "2026-01-01", "averageTax": 28000 }
      ]
    }
  },
  "technicalFees": [
    {
      "type": "dispense_fee",
      "amount": 30000,
      "effectiveDate": "2026-01-01",
      "conditions": {
        "excludeNonPharma": true,
        "minimumQuantity": 1
      }
    }
  ],
  "orders": [
    {
      "uniqueId": "test-preseeded-unique-id",
      "orderId": "QAN-ORD-PRESEEDED-01",
      "status": "reserved",
      "createdAt": "2026-10-14T08:00:00.000Z",
      "totalItems": 1,
      "totalPrice": 418200,
      "items": [
        { "goodId": "g-1002", "genericCode": "00002", "quantity": 2, "price": 185000 }
      ]
    }
  ]
}
```

---

## 6. Concrete Implementation Blueprint (`src/adapters/qanoon-adapter.js`)

Below is the recommended structural design for `src/adapters/qanoon-adapter.js`:

```javascript
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURE_PATH = join(__dirname, "..", "..", "fixtures", "qanoon-mock-data.json");

// --- Custom Error Hierarchy ---
export class QanoonAdapterError extends Error {
  constructor(message, { code = "ADAPTER_ERROR", statusCode = 500, endpoint = null, details = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.details = details;
  }
}

export class QanoonValidationError extends QanoonAdapterError {
  constructor(message, details = null) {
    super(message, { code: "VALIDATION_ERROR", statusCode: 400, details });
  }
}

export class QanoonAuthenticationError extends QanoonAdapterError {
  constructor(message = "Unauthorized access to Qanoon API", details = null) {
    super(message, { code: "UNAUTHORIZED", statusCode: 401, details });
  }
}

export class QanoonNotFoundError extends QanoonAdapterError {
  constructor(message = "Requested item or warehouse not found in Qanoon", details = null) {
    super(message, { code: "NOT_FOUND", statusCode: 404, details });
  }
}

export class QanoonConflictError extends QanoonAdapterError {
  constructor(message = "Conflict in Qanoon operation or uniqueId payload mismatch", details = null) {
    super(message, { code: "CONFLICT", statusCode: 409, details });
  }
}

export class QanoonNetworkTimeoutError extends QanoonAdapterError {
  constructor(message = "Request to Qanoon API timed out", details = null) {
    super(message, { code: "TIMEOUT", statusCode: 504, details });
  }
}

export class QanoonServerError extends QanoonAdapterError {
  constructor(message = "Qanoon upstream server error", statusCode = 500, details = null) {
    super(message, { code: "SERVER_ERROR", statusCode, details });
  }
}

// --- Helper Functions ---
function roundValue(value, rule = "round") {
  if (rule === "ceil") return Math.ceil(value);
  if (rule === "floor") return Math.floor(value);
  return Math.round(value);
}

function computePayloadHash(payload) {
  return JSON.stringify(payload);
}

// --- Primary Adapter Class ---
export class QanoonAdapter {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? process.env.QANOON_API_BASE_URL ?? "https://api.qanoon.local/v1";
    this.apiKey = options.apiKey ?? process.env.QANOON_API_KEY ?? null;
    this.pharmacyId = options.pharmacyId ?? process.env.QANOON_PHARMACY_ID ?? "ph-main-01";
    this.clientId = options.clientId ?? process.env.QANOON_CLIENT_ID ?? "panelph-desk";
    this.timeoutMs = Number(options.timeoutMs ?? process.env.QANOON_TIMEOUT_MS ?? 5000);
    this.mockMode = options.mockMode ?? (
      process.env.QANOON_MOCK_MODE === "true" ||
      process.env.NODE_ENV === "test" ||
      (!options.apiKey && !process.env.QANOON_API_KEY)
    );
    this.fixturePath = options.fixturePath ?? DEFAULT_FIXTURE_PATH;
    this.inMemoryFixtures = options.fixtures ?? null;
    this.idempotencyTtlMs = options.idempotencyTtlMs ?? (24 * 60 * 60 * 1000);
    this.idempotencyCache = new Map();
    this._loadedFixtures = null;
  }

  isMockMode() {
    return this.mockMode;
  }

  async getFixtures() {
    if (this.inMemoryFixtures) return this.inMemoryFixtures;
    if (this._loadedFixtures) return this._loadedFixtures;
    const content = await readFile(this.fixturePath, "utf8");
    this._loadedFixtures = JSON.parse(content);
    return this._loadedFixtures;
  }

  async checkStock({ genericCode, brandCode, goodId, warehouseId = "main", requestedCount = 1 }) {
    if (this.mockMode) {
      const fixtures = await this.getFixtures();
      const stockEntries = fixtures.stock.filter((s) => s.warehouseId === warehouseId);
      
      let matchedStock = null;
      if (goodId) {
        matchedStock = stockEntries.find((s) => s.goodId === goodId);
      } else if (genericCode) {
        const cleanGeneric = String(genericCode);
        const cleanBrand = brandCode ? String(brandCode) : null;
        matchedStock = stockEntries.find((s) => 
          String(s.genericCode) === cleanGeneric && 
          (!cleanBrand || String(s.brandCode) === cleanBrand)
        );
      }

      if (!matchedStock) {
        return {
          inStock: false,
          availableCount: 0,
          warehouseId,
          advisoryWarning: "کالا در انبار یافت نشد.",
          earliestExpDate: null,
          avgCost: null,
        };
      }

      const availableCount = matchedStock.availableCount ?? 0;
      const isAvailable = availableCount >= requestedCount && availableCount > 0;
      let advisoryWarning;
      if (availableCount === 0) {
        advisoryWarning = "کالا در انبار موجود نیست.";
      } else if (availableCount < requestedCount) {
        advisoryWarning = `موجودی ناکافی: موجود در انبار ${availableCount} عدد، درخواستی ${requestedCount} عدد`;
      }

      return {
        inStock: isAvailable,
        availableCount,
        warehouseId,
        advisoryWarning,
        earliestExpDate: matchedStock.earliestExpDate ?? null,
        avgCost: matchedStock.avgCost ?? null,
      };
    }

    // Live mode implementation with AbortSignal.timeout
    return this._fetch("/stock/check", {
      method: "POST",
      body: JSON.stringify({ warehouseId, items: [{ goodId, genericCode, brandCode, quantity: requestedCount }] }),
    });
  }

  async calculatePrice({ goodId, quantity = 1, documentDate, includeTechnicalFee = true, roundingRule = "round", warehouseId = "main" }) {
    if (!goodId) throw new QanoonValidationError("goodId is required for calculatePrice");
    const docDate = documentDate ?? new Date().toISOString().slice(0, 10);

    if (this.mockMode) {
      const fixtures = await this.getFixtures();
      const good = fixtures.goods.find((g) => g.id === goodId);
      if (!good) throw new QanoonNotFoundError(`Good ${goodId} not found in catalog`);

      const warnings = [];
      const unitBasePrice = good.sellPrice || good.tempPrice || 0;
      if (!good.sellPrice && good.tempPrice) {
        warnings.push("Used tempPrice because sellPrice was not available.");
      }

      const basePrice = roundValue(unitBasePrice * quantity, roundingRule);

      // Tax calculation
      let totalTax = 0;
      const taxCode = good.taxCodes?.[0];
      const taxTable = taxCode ? fixtures.taxRates[taxCode] : null;
      if (taxTable && taxTable.averageTaxes.length > 0) {
        const appliedRate = [...taxTable.averageTaxes]
          .sort((a, b) => b.date.localeCompare(a.date))
          .find((row) => docDate >= row.date);
        if (appliedRate) {
          totalTax = roundValue(quantity * appliedRate.averageTax, roundingRule);
        } else {
          warnings.push("No tax rate matched the selected document date.");
        }
      }

      const vatAmount = roundValue(totalTax * 0.75, roundingRule);
      const tollAmount = totalTax - vatAmount;

      // Technical fee calculation
      let technicalFee = 0;
      if (includeTechnicalFee && !good.nonPharma) {
        const feeRule = fixtures.technicalFees
          ?.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
          .find((r) => docDate >= r.effectiveDate && (!r.conditions?.minimumQuantity || quantity >= r.conditions.minimumQuantity));
        if (feeRule) {
          technicalFee = roundValue(feeRule.amount * quantity, roundingRule);
        }
      }

      const finalPrice = roundValue(basePrice + vatAmount + tollAmount + technicalFee, roundingRule);

      // TTAC divergence check (> 10,000 Rial)
      if (good.ttacPrice && Math.abs(good.ttacPrice - unitBasePrice) > 10000) {
        warnings.push("اختلاف قیمت مصوب تیتک و قانون بیش از ۱۰٬۰۰۰ ریال است");
      }

      const stockMatch = fixtures.stock.find((s) => s.goodId === goodId && s.warehouseId === warehouseId);
      const avgCost = stockMatch?.avgCost ? stockMatch.avgCost * quantity : null;
      const profitAmount = avgCost != null ? finalPrice - avgCost : null;
      const profitPercent = (avgCost != null && avgCost > 0) ? Math.round((profitAmount / avgCost) * 100) : null;

      return {
        goodId,
        unitBasePrice,
        basePrice,
        vatAmount,
        tollAmount,
        technicalFee,
        finalPrice,
        warnings,
        avgCost,
        profitAmount,
        profitPercent,
      };
    }

    return this._fetch("/pricing/calculate", {
      method: "POST",
      body: JSON.stringify({ goodId, quantity, documentDate: docDate, includeTechnicalFee, roundingRule, warehouseId }),
    });
  }

  async createBatchOrder({ draftId, uniqueId, items, warehouseId = "main", notes = "" }) {
    if (!uniqueId) throw new QanoonValidationError("uniqueId is required for idempotent batch creation");
    if (!Array.isArray(items) || items.length === 0) throw new QanoonValidationError("items array must not be empty");

    const payloadFingerprint = computePayloadHash({ draftId, items, warehouseId });

    // Check 24-hour idempotency cache
    const cached = this.idempotencyCache.get(uniqueId);
    const now = Date.now();
    if (cached) {
      if (now < cached.expiresAt) {
        if (cached.payloadFingerprint !== payloadFingerprint) {
          throw new QanoonConflictError(`UNIQUE_ID_PAYLOAD_MISMATCH: uniqueId ${uniqueId} reused with conflicting payload`);
        }
        return {
          ...cached.response,
          status: "CACHED",
        };
      } else {
        this.idempotencyCache.delete(uniqueId);
      }
    }

    if (this.mockMode) {
      const batchId = `QAN-ORD-${Date.now()}`;
      const response = {
        success: true,
        batchId,
        uniqueId,
        timestamp: new Date().toISOString(),
        status: "SUBMITTED",
        totalItems: items.length,
        items,
      };

      this.idempotencyCache.set(uniqueId, {
        response,
        payloadFingerprint,
        createdAt: now,
        expiresAt: now + this.idempotencyTtlMs,
      });

      return response;
    }

    return this._fetch("/orders/batch", {
      method: "POST",
      headers: { "X-Unique-Id": uniqueId },
      body: JSON.stringify({ draftId, uniqueId, items, warehouseId, notes }),
    });
  }

  async searchGoods({ query, limit = 20 }) {
    if (!query || typeof query !== "string") return [];
    const normalized = query.trim().toLowerCase();

    if (this.mockMode) {
      const fixtures = await this.getFixtures();
      const results = fixtures.goods.filter((g) => {
        return (
          g.title?.toLowerCase().includes(normalized) ||
          g.persianTitle?.includes(normalized) ||
          String(g.genericCode).includes(normalized) ||
          String(g.brandCode).includes(normalized) ||
          (g.barcode && g.barcode.includes(normalized)) ||
          g.aliases?.some((a) => a.toLowerCase().includes(normalized))
        );
      }).slice(0, limit);

      return results.map((g) => ({
        goodId: g.id,
        genericCode: String(g.genericCode), // Strict string preservation
        brandCode: String(g.brandCode),     // Strict string preservation
        title: g.title,
        persianTitle: g.persianTitle,
        dosageForm: g.dosageForm,
        strength: g.strengthLabel,
        sellPrice: g.sellPrice,
        tempPrice: g.tempPrice,
        nonPharma: g.nonPharma ?? false,
      }));
    }

    return this._fetch(`/goods/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  async _fetch(endpoint, options = {}) {
    const url = `${this.baseUrl.replace(/\/$/, "")}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "X-Pharmacy-Id": this.pharmacyId,
      "X-Client-Id": this.clientId,
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      ...options.headers,
    };

    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new QanoonNetworkTimeoutError(`Request to ${endpoint} timed out after ${this.timeoutMs}ms`);
      }
      throw new QanoonServerError(`Failed to connect to Qanoon: ${err.message}`, 500, err);
    }

    if (!response.ok) {
      let body = null;
      try { body = await response.json(); } catch {}
      const msg = body?.message || `Qanoon API returned status ${response.status}`;
      if (response.status === 400) throw new QanoonValidationError(msg, body);
      if (response.status === 401 || response.status === 403) throw new QanoonAuthenticationError(msg, body);
      if (response.status === 404) throw new QanoonNotFoundError(msg, body);
      if (response.status === 409) throw new QanoonConflictError(msg, body);
      throw new QanoonServerError(msg, response.status, body);
    }

    return response.json();
  }

  clearIdempotencyCache() {
    this.idempotencyCache.clear();
  }
}

export function createQanoonAdapter(options = {}) {
  return new QanoonAdapter(options);
}
```

---

## 7. Concrete Verification Test Blueprint (`test/qanoon-adapter.test.js`)

The test suite must verify all M1 adapter behaviors in isolated mock mode:

1. **Auto-Mock Mode:** Verify `adapter.isMockMode() === true` without setting API keys or network configs.
2. **Stock Verification (Preliminary & Shortage):**
   - Querying plentiful stock returns `inStock: true`, `availableCount > 0`, no warning.
   - Querying insufficient stock (`availableCount: 2, requestedCount: 10`) returns `inStock: false` with advisory warning.
   - Querying zero stock returns `inStock: false` with `"کالا در انبار موجود نیست."`.
3. **Leading-Zero String Preservation:**
   - Verify `genericCode === "00001"` and `brandCode === "00001"` are exact strings with preserved leading zeroes.
4. **Deterministic 7-Step Pricing:**
   - Verify `basePrice = round(unitBasePrice * quantity)`.
   - Verify VAT / Municipal Toll 75/25 split (`vatAmount` is 75%, `tollAmount` is 25%).
   - Verify nonPharma items do NOT get charged technical dispense fees.
   - Verify TTAC divergence warning when `|ttacPrice - qanoonPrice| > 10,000`.
   - Verify fallback to `tempPrice` when `sellPrice === 0` with warning.
5. **Idempotency & 24-Hour Cache:**
   - First submission returns `status: "SUBMITTED"`.
   - Second submission with identical `uniqueId` returns `status: "CACHED"`.
   - Submission with identical `uniqueId` but modified payload throws `QanoonConflictError`.
6. **Error Classification & Timeouts:**
   - Verify `QanoonValidationError` on missing `uniqueId`.
   - Verify `QanoonNotFoundError` on non-existent `goodId`.
   - Verify custom error classes have proper inheritance from `QanoonAdapterError` and `Error`.

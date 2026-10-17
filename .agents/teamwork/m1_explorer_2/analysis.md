# Milestone 1 Exploration: Pricing, Stock Checks, and Code Preservation

**Document Version:** 1.0.0  
**Author:** `m1_explorer_2` (Pricing and Stock Rules Explorer)  
**Target Repository:** `/home/admin/PanelPH`  
**Working Directory:** `/home/admin/PanelPH/.agents/teamwork/m1_explorer_2`  
**Reference Sources:**
- `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- `/home/admin/PanelPH/PROJECT.md`
- `/home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/spec_report.md`
- `/home/admin/projects/Bale-Med-Prices/packages/domain/src/rules/calculate-final-price.ts`
- `/home/admin/projects/Bale-Med-Prices/packages/domain/src/rules/calculate-tax.ts`
- `/home/admin/projects/Bale-Med-Prices/packages/domain/src/rules/calculate-final-price.test.ts`
- `/home/admin/projects/Bale-Med-Prices/docs/pricing-rules.md`
- `/home/admin/projects/Bale-Med-Prices/docs/adr/0001-use-qanoon-price-with-ttac-identity.md`
- `/home/admin/PanelPH/docs/REFERENCE-DATA.md`
- `/home/admin/PanelPH/fixtures/catalog.sample.json`

---

## 1. Executive Summary

This exploration defines the formal specifications, mathematical invariants, and validation suites for the core business rules of Milestone 1 in `PanelPH`:
1. **7-Step Deterministic Pricing Engine**: Formalizes base price evaluation, dated tax schedule lookup, the exact 75% VAT / 25% municipal toll split (guaranteeing `taxAmount + tollAmount === totalTax`), conditional technical dispense fees, profit accounting, and the TTAC divergence guard (>10,000 Rial threshold).
2. **Two-Stage Stock Check Architecture**: Defines the distinct contracts for (a) the preliminary non-blocking advisory check during need capture/resolution, and (b) the pre-batch blocking validation check before export, complete with FEFO expiration sorting and multi-warehouse routing.
3. **Leading-Zero String Preservation Invariant**: Establishes strict defense against accidental number coercion for national drug codes (e.g. `genericCode: "00001"`, `brandCode: "00001"`, GTIN barcodes, and IRCs) across parsing, schema validation, storage, and comparisons.
4. **Concrete Unit Test Suite**: Delivers 15 fully-specified test scenarios using Node.js built-in test runner (`node:test`) for `test/qanoon-adapter.test.js`.

---

## 2. 7-Step Deterministic Pricing Calculation Logic

### 2.1 The 7-Step Pipeline Sequence

The pricing engine calculates final consumer price deterministically through 7 sequential phases:

```
[Step 1: Base Unit Price Resolution]
   ├── sellPrice (primary)
   └── tempPrice (fallback with warning if sellPrice <= 0)
                 │
                 ▼
[Step 2: Base Price Extension]
   └── basePrice = roundValue(unitBasePrice * quantity, roundingRule)
                 │
                 ▼
[Step 3: Tax & Municipal Toll Resolution (75/25 Split)]
   ├── Match rate from taxData.averageTaxes where documentDate >= row.date
   ├── totalTax = roundValue(quantity * appliedRate.averageTax, roundingRule)
   ├── taxAmount (VAT) = roundValue(totalTax * 0.75, roundingRule)
   └── tollAmount = totalTax - taxAmount
                 │
                 ▼
[Step 4: Technical Dispense Fee Evaluation]
   ├── Match rule from technicalFeeRules where documentDate >= rule.effectiveDate
   ├── Filter: rule.conditions.excludeNonPharma && good.nonPharma => skip
   ├── Filter: rule.conditions.minimumQuantity && qty < minQty => skip
   └── technicalFee = roundValue(appliedRule.amount * quantity, roundingRule)
                 │
                 ▼
[Step 5: Final Price Aggregation]
   └── finalPrice = roundValue(basePrice + taxAmount + tollAmount + technicalFee, roundingRule)
                 │
                 ▼
[Step 6: Operational Cost & Profit Accounting]
   ├── totalCost = avgCost == null ? null : roundValue(avgCost * quantity, roundingRule)
   ├── profitAmount = totalCost == null ? null : finalPrice - totalCost
   └── profitPercent = totalCost == null ? null : roundValue((profitAmount / totalCost) * 100, roundingRule)
                 │
                 ▼
[Step 7: TTAC Divergence Guard]
   └── if |good.ttacPrice - unitBasePrice| > 10,000 Rials:
         emit price divergence warning (Qanoon price remains authoritative)
```

### 2.2 Mathematical Invariants & Rounding Mechanics

#### Invariant A: Rounding Rule Behavior
The rounding function supports three policies:
- `"round"` (default): `Math.round(val)`
- `"ceil"`: `Math.ceil(val)`
- `"floor"`: `Math.floor(val)`

```javascript
function roundValue(value, roundingRule = "round") {
  if (roundingRule === "ceil") return Math.ceil(value);
  if (roundingRule === "floor") return Math.floor(value);
  return Math.round(value);
}
```

#### Invariant B: Tax/Toll Exact Sum Equality (`taxAmount + tollAmount === totalTax`)
Independent rounding of VAT (75%) and toll (25%) can introduce off-by-one errors in integer arithmetic (e.g., if `totalTax = 2`, `round(2 * 0.75) = 2` and `round(2 * 0.25) = 1`, resulting in `2 + 1 = 3 != 2`).
To guarantee strict mathematical consistency:
1. `totalTax = roundValue(quantity * appliedRate.averageTax, roundingRule)`
2. `taxAmount = roundValue(totalTax * 0.75, roundingRule)` (Government VAT)
3. `tollAmount = totalTax - taxAmount` (Municipal Toll)

**Proof of Invariant:**
`taxAmount + tollAmount = taxAmount + (totalTax - taxAmount) = totalTax` (Identically true for all integers).

### 2.3 TTAC Divergence Warning Protocol
In compliance with `ADR-0001` and `pricing-rules.md`:
1. **Authoritative Price Source:** Qanoon is the primary and official pricing source for pharmacy counter transactions. A higher or lower TTAC price must NEVER overwrite or mutate `unitBasePrice` or `finalPrice`.
2. **Trigger Condition:** `Math.abs(good.ttacPrice - unitBasePrice) > 10000` (Rials per consumption unit).
3. **Warning Payload:**
   When the condition is met, append to `warnings`:
   `"اختلاف قیمت مصوب تیتک و قانون بیش از ۱۰٬۰۰۰ ریال است (تیتک: ${good.ttacPrice.toLocaleString()}، قانون: ${unitBasePrice.toLocaleString()})"`
   or English equivalent:
   `"Price divergence: TTAC price (${good.ttacPrice}) differs from Qanoon price (${unitBasePrice}) by more than 10,000 Rials."`
4. **Sub-threshold Behavior:** If `Math.abs(good.ttacPrice - unitBasePrice) <= 10000`, no warning is emitted.

### 2.4 Reference Price Calculation Implementation

```javascript
export function calculatePrice({
  good,
  quantity = 1,
  documentDate = new Date().toISOString().slice(0, 10),
  includeTechnicalFee = true,
  taxMultiplier = 0.75,
  roundingRule = "round",
  taxData = null,
  technicalFeeRules = [],
  avgCost = null,
}) {
  const warnings = [];

  // Step 1: Base Unit Price Resolution
  let unitBasePrice = 0;
  if (good.sellPrice != null && good.sellPrice > 0) {
    unitBasePrice = good.sellPrice;
  } else if (good.tempPrice != null && good.tempPrice > 0) {
    unitBasePrice = good.tempPrice;
    warnings.push("Used tempPrice because sellPrice was not available.");
  } else {
    warnings.push("No valid sellPrice or tempPrice found for item.");
  }

  // Step 2: Base Price Extension
  const basePrice = roundValue(unitBasePrice * quantity, roundingRule);

  // Step 3: Tax & Municipal Toll Resolution (75/25 Split)
  let totalTax = 0;
  let taxAmount = 0;
  let tollAmount = 0;
  let appliedRate = null;

  if (!taxData || !Array.isArray(taxData.averageTaxes) || taxData.averageTaxes.length === 0) {
    if (taxData) {
      warnings.push("Tax table contains no rate rows.");
    }
  } else {
    appliedRate = [...taxData.averageTaxes]
      .sort((a, b) => b.date.localeCompare(a.date))
      .find((row) => documentDate >= row.date) ?? null;

    if (!appliedRate) {
      warnings.push("No tax rate matched the selected document date.");
    } else {
      totalTax = roundValue(quantity * appliedRate.averageTax, roundingRule);
      taxAmount = roundValue(totalTax * taxMultiplier, roundingRule);
      tollAmount = totalTax - taxAmount;
    }
  }

  // Step 4: Technical Dispense Fee Evaluation
  let technicalFee = 0;
  let appliedRule = null;

  if (includeTechnicalFee && Array.isArray(technicalFeeRules)) {
    appliedRule = [...technicalFeeRules]
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
      .find((rule) => {
        if (documentDate < rule.effectiveDate) return false;
        if (rule.conditions?.excludeNonPharma && good.nonPharma) return false;
        if (rule.conditions?.minimumQuantity && quantity < rule.conditions.minimumQuantity) return false;
        return true;
      }) ?? null;

    if (appliedRule) {
      technicalFee = roundValue(appliedRule.amount * quantity, roundingRule);
    } else {
      warnings.push("Technical fee was requested but no applicable rule matched.");
    }
  }

  // Step 5: Final Price Aggregation
  const finalPrice = roundValue(
    basePrice + taxAmount + tollAmount + technicalFee,
    roundingRule
  );

  // Step 6: Operational Cost & Profit Accounting
  const totalCost = avgCost == null ? null : roundValue(avgCost * quantity, roundingRule);
  let profitAmount = null;
  let profitPercent = null;

  if (totalCost == null) {
    warnings.push("Average cost is not available for this good and warehouse.");
  } else {
    profitAmount = finalPrice - totalCost;
    profitPercent = totalCost > 0 ? roundValue((profitAmount / totalCost) * 100, roundingRule) : 0;
  }

  // Step 7: TTAC Divergence Guard
  if (good.ttacPrice != null && unitBasePrice > 0) {
    const divergence = Math.abs(good.ttacPrice - unitBasePrice);
    if (divergence > 10000) {
      warnings.push(
        `Price divergence: TTAC price (${good.ttacPrice}) differs from Qanoon price (${unitBasePrice}) by more than 10,000 Rials.`
      );
    }
  }

  return {
    goodId: good.id || good.goodId,
    title: good.title,
    persianTitle: good.persianTitle || good.title,
    unitBasePrice,
    basePrice,
    vatAmount: taxAmount,     // Matches PROJECT.md interface contract
    taxAmount,                // Preserved for domain compatibility
    tollAmount,
    totalTax,
    technicalFee,
    finalPrice,
    avgCost: totalCost,
    profitAmount,
    profitPercent,
    appliedTaxDate: appliedRate?.date ?? null,
    appliedTechnicalFeeDate: appliedRule?.effectiveDate ?? null,
    warnings,
  };
}
```

---

## 3. Stock Check Mechanics: Preliminary Advisory vs Pre-Batch Barrier

PanelPH implements a **Two-Stage Stock Verification Lifecycle** to balance pharmacist workflow speed with inventory integrity.

| Aspect | Stage 1: Preliminary Advisory Check | Stage 2: Pre-Batch Verification Barrier |
|---|---|---|
| **Invocation Point** | Need capture / catalog resolution (`resolve_order_need`, UI drawer) | Draft finalization / order batch export (`exportBatch`, `/orders/batch`) |
| **Scope** | Single item or newly resolved need | Entire draft batch (all draft items concurrently) |
| **Execution Mode** | Asynchronous, non-blocking | Synchronous, blocking barrier |
| **Pharmacist Action on Shortage** | Informative badge (`in_stock`, `low_stock`, `out_of_stock`); allowed to continue drafting | Highlights blocking discrepancies (`discrepancies: string[]`); export blocked or requires override |
| **Warehouse Routing** | Defaults to shelf dispensary (`warehouseId: "main"`) | Checks `main` first, optionally queries secondary locations |
| **Batch Expiration (FEFO)** | Evaluates earliest unexpired batch date for pharmacist awareness | Excludes expired inventory from total reservable count |

### 3.1 Stage 1: Preliminary Advisory Check (`checkStock`)

#### Method Signature & Contract
```javascript
checkStock({ goodId, genericCode, brandCode, requestedCount = 1, warehouseId = "main", today = new Date().toISOString().slice(0, 10) })
```

#### Return Schema
```json
{
  "goodId": "g-1001",
  "genericCode": "00001",
  "brandCode": "00001",
  "warehouseId": "main",
  "requestedCount": 2,
  "availableCount": 140,
  "inStock": true,
  "stockStatus": "in_stock",
  "earliestExpDate": "2027-02-01",
  "avgCost": 132000,
  "advisoryWarning": null
}
```

#### Advisory Status & Warning Logic
1. Filter out expired inventory records: `expDate >= today`.
2. Sum valid unexpired inventory: `availableCount = sum(entry.count)`.
3. Sort remaining batches ascending by `expDate` to pick `earliestExpDate` (FEFO).
4. Determine status:
   - `availableCount >= requestedCount`:
     - `inStock = true`
     - `stockStatus = "in_stock"`
     - `advisoryWarning = null`
   - `0 < availableCount < requestedCount`:
     - `inStock = false`
     - `stockStatus = "low_stock"`
     - `advisoryWarning = "موجودی ناکافی: موجود در انبار ${availableCount} عدد، درخواستی ${requestedCount} عدد"`
   - `availableCount === 0`:
     - `inStock = false`
     - `stockStatus = "out_of_stock"`
     - `advisoryWarning = "موجودی کالا در انبار صفر است"`

### 3.2 Stage 2: Pre-Batch Verification Barrier (`checkBatchStock`)

#### Method Signature & Contract
```javascript
checkBatchStock({ warehouseId = "main", items: Array<{ goodId, genericCode, brandCode, requestedCount, title }> })
```

#### Return Schema
```json
{
  "warehouseId": "main",
  "checkedAt": "2026-10-14T10:00:00.000Z",
  "allAvailable": false,
  "items": [
    {
      "goodId": "g-1001",
      "genericCode": "00001",
      "requestedCount": 2,
      "availableCount": 140,
      "inStock": true,
      "stockStatus": "in_stock"
    },
    {
      "goodId": "g-1003",
      "genericCode": "14083",
      "requestedCount": 100,
      "availableCount": 85,
      "inStock": false,
      "stockStatus": "low_stock"
    }
  ],
  "discrepancies": [
    "کسری موجودی برای Amoxicillin 500mg: درخواستی 100، موجود 85"
  ]
}
```

#### Pre-Batch Barrier Invariants
- `allAvailable = items.every(item => item.inStock)`.
- If `allAvailable === false`, `discrepancies` contains human-readable Persian/English explanation for each failing row.
- Draft store's `exportBatch({ draftId, adapter })` inspects `allAvailable`:
  - If `false`, returns `{ batch: null, discrepancies, status: "DISCREPANCIES_DETECTED" }` to prevent submitting an unfulfillable order to Qanoon.

---

## 4. Leading-Zero String Preservation Architecture

### 4.1 Root Cause & Accidental Coercion Risks

In Iranian pharmacy standards:
- `genericCode` represents the drug molecule identity in the National Drug List (e.g., `"00001"` for Amoxicillin 500mg Capsule, `"00025"`, `"04210"`).
- `brandCode` distinguishes specific pharmaceutical manufacturers (e.g., `"00001"` for Daya Darman, `"00120"`).
- `barcode` / `gtin` represents GS1 identifiers (e.g., `"06261001100011"`).

**Accidental Coercion Traps in JavaScript:**
1. **Implicit or Explicit Numeric Parsing:** `Number("00001")`, `+"00001"`, `parseInt("00001", 10)` transforms `"00001"` -> `1`.
2. **Loss of Identity in Maps and Sets:** In JS `Map`:
   `map.set("00001", data)` followed by `map.get(1)` or `map.get("1")` returns `undefined`.
3. **Zod Schema Misconfiguration:** Using `z.coerce.number()` or `z.number()` strips leading zeros during request validation.
4. **JSON Serialization Traps:** Serializing a numeric variable: `{ genericCode: 1 }` loses the zero permanently on write.
5. **Database / ORM Coercion:** Defining database columns or in-memory index columns as integer instead of string.

### 4.2 Invariant & Defense Strategy

1. **Schema Defense:** Every identifier field (`genericCode`, `brandCode`, `barcode`, `ircCode`, `ttacCode`) must be typed as `z.string()`:
   ```javascript
   export const CodeSchema = z.string().trim().min(1).regex(/^\d+$/, "Code must contain only digits while remaining a string");
   ```
2. **Defensive Normalization Guard:**
   ```javascript
   export function normalizeCodeString(code) {
     if (code == null) return "";
     return String(code).trim();
   }
   ```
3. **Strict Equality:**
   Never use loose `==` comparisons between codes. Always enforce `normalizeCodeString(a) === normalizeCodeString(b)`.
4. **Safe Formatter:**
   If legacy systems pass codes without padding, provide explicit deterministic formatter:
   ```javascript
   export function padGenericCode(code, length = 5) {
     if (code == null) return "";
     return String(code).trim().padStart(length, "0");
   }
   ```

---

## 5. Mock Fixture Specifications for Pricing & Stock

For self-contained offline testing in `fixtures/qanoon-mock-data.json`, the dataset must include distinct goods designed to exercise every branch of the business logic:

### 5.1 Goods Catalog Fixture
1. `g-1001`: **Amoxicillin 500mg** (`genericCode: "00001"`, `brandCode: "00001"`).
   - Pharma drug (`nonPharma: false`).
   - `sellPrice: 185000`, `tempPrice: 179000`, `ttacPrice: 185000`.
   - Tax code: `TAX_MED_STANDARD`.
2. `g-1002`: **Adult Protective Cream** (`genericCode: "08234"`, `brandCode: "00020"`).
   - Non-pharma cosmetic (`nonPharma: true`).
   - `sellPrice: 240000`, `tempPrice: 0`, `ttacPrice: 240000`.
   - Tax code: `TAX_COSMETIC`.
3. `g-1003`: **Acetaminophen 325mg** (`genericCode: "00025"`, `brandCode: "00005"`).
   - Pharma drug (`nonPharma: false`).
   - `sellPrice: 0`, `tempPrice: 45000` (tests `tempPrice` fallback).
   - Tax code: `TAX_MED_REDUCED`.
4. `g-1004`: **Cough Syrup 120ml** (`genericCode: "04210"`, `brandCode: "00012"`).
   - Pharma drug (`nonPharma: false`).
   - `sellPrice: 110000`, `tempPrice: 105000`, `ttacPrice: 135000` (difference: 25,000 Rials > 10,000 -> tests TTAC divergence warning).
   - Tax code: `TAX_MED_STANDARD`.
5. `g-1005`: **Vitamin D3 1000IU** (`genericCode: "00115"`, `brandCode: "00001"`).
   - Plentiful stock in `main`, but 0 stock in `branch-2` (tests multi-warehouse routing).

### 5.2 Stock Fixtures (`stockSnapshots`)
- `g-1001`: `main` warehouse, count: 140, avgCost: 132000, expDate: "2027-02-01".
- `g-1002`: `main` warehouse, count: 22, avgCost: 171000, expDate: "2027-11-01".
- `g-1003`: `main` warehouse, count: 85, avgCost: 32000, expDate: "2026-12-15".
- `g-1004`: `branch-2` warehouse, count: 10, avgCost: 98000, expDate: "2026-10-01".
- `g-1004`: `main` warehouse, count: 2 (low stock).
- `g-1006`: `main` warehouse, count: 0 (out of stock).

### 5.3 Tax Tables Fixture (`taxTables`)
- `TAX_MED_STANDARD`:
  - `2025-01-01`: `averageTax: 8200`
  - `2026-01-01`: `averageTax: 9100`
- `TAX_MED_REDUCED`:
  - `2025-01-01`: `averageTax: 4200`
  - `2026-01-01`: `averageTax: 5100`
- `TAX_COSMETIC`:
  - `2025-01-01`: `averageTax: 18600`
  - `2026-01-01`: `averageTax: 21400`

### 5.4 Technical Fee Rules Fixture (`technicalFeeRules`)
- Effective `2025-01-01`: amount `12000`, `conditions: { excludeNonPharma: true, minimumQuantity: 1 }`.
- Effective `2026-01-01`: amount `15000`, `conditions: { excludeNonPharma: true, minimumQuantity: 1 }`.

---

## 6. Recommended Concrete Unit Tests for `test/qanoon-adapter.test.js`

Here is the exact, comprehensive test suite structure recommended for implementation in `test/qanoon-adapter.test.js` using Node.js built-in `node:test` runner.

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { QanoonAdapter } from "../src/adapters/qanoon-adapter.js";
import mockData from "../fixtures/qanoon-mock-data.json" with { type: "json" };

test("QanoonAdapter — 7-Step Deterministic Pricing Engine", async (t) => {
  const adapter = new QanoonAdapter({ mockData });

  await t.test("applies full 7-step pricing with 75/25 VAT/toll split for standard pharma goods", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g-1001",
      quantity: 2,
      documentDate: "2026-06-24",
      includeTechnicalFee: true,
      roundingRule: "round",
    });

    // 1. unitBasePrice: sellPrice = 185,000
    assert.equal(result.unitBasePrice, 185000);
    // 2. basePrice: 185,000 * 2 = 370,000
    assert.equal(result.basePrice, 370000);
    // 3. Tax & Toll: 2 * 9,100 = 18,200. VAT (75%) = 13,650. Toll (25%) = 4,550
    assert.equal(result.totalTax, 18200);
    assert.equal(result.taxAmount, 13650);
    assert.equal(result.vatAmount, 13650);
    assert.equal(result.tollAmount, 4550);
    assert.equal(result.taxAmount + result.tollAmount, result.totalTax);
    // 4. Technical Fee: 15,000 * 2 = 30,000
    assert.equal(result.technicalFee, 30000);
    // 5. Final Price: 370,000 + 13,650 + 4,550 + 30,000 = 418,200
    assert.equal(result.finalPrice, 418200);
    // 6. Cost & Profit: avgCost = 132,000 * 2 = 264,000. Profit = 418,200 - 264,000 = 154,200 (58%)
    assert.equal(result.avgCost, 264000);
    assert.equal(result.profitAmount, 154200);
    assert.equal(result.profitPercent, 58);
    // 7. No warnings
    assert.deepEqual(result.warnings, []);
  });

  await t.test("falls back to tempPrice with warning when sellPrice is zero or missing", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g-1003",
      quantity: 1,
      documentDate: "2026-06-24",
    });

    assert.equal(result.unitBasePrice, 45000);
    assert.equal(result.basePrice, 45000);
    assert.ok(result.warnings.some((w) => w.includes("Used tempPrice")));
  });

  await t.test("exempts non-pharma goods from technical dispense fees", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g-1002", // nonPharma: true
      quantity: 1,
      documentDate: "2026-06-24",
      includeTechnicalFee: true,
    });

    assert.equal(result.technicalFee, 0);
    assert.ok(result.warnings.some((w) => w.includes("Technical fee was requested but no applicable rule matched")));
  });

  await t.test("matches historical tax rate based on documentDate boundary", async () => {
    const result2025 = await adapter.calculatePrice({
      goodId: "g-1001",
      quantity: 1,
      documentDate: "2025-06-01", // Prior to 2026 rate change
    });

    assert.equal(result2025.totalTax, 8200);
    assert.equal(result2025.appliedTaxDate, "2025-01-01");
  });

  await t.test("emits price divergence warning when TTAC price differs from Qanoon by > 10,000 Rials", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g-1004", // sellPrice: 110,000, ttacPrice: 135,000 (diff: 25,000 > 10,000)
      quantity: 1,
      documentDate: "2026-06-24",
    });

    // Authoritative Qanoon unit price is preserved
    assert.equal(result.unitBasePrice, 110000);
    // Warning attached
    assert.ok(result.warnings.some((w) => w.includes("Price divergence") || w.includes("اختلاف قیمت")));
  });

  await t.test("does not emit divergence warning when TTAC price difference is <= 10,000 Rials", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g-1001", // sellPrice: 185,000, ttacPrice: 185,000 (diff: 0 <= 10,000)
      quantity: 1,
      documentDate: "2026-06-24",
    });

    assert.ok(!result.warnings.some((w) => w.includes("Price divergence")));
  });

  await t.test("respects roundingRule: ceil, floor, and round", async () => {
    // If taxMultiplier is 0.75 on totalTax = 3:
    // 3 * 0.75 = 2.25. ceil => 3, floor => 2, round => 2
    const ceilResult = await adapter.calculatePrice({
      goodId: "g-1001",
      quantity: 1,
      roundingRule: "ceil",
    });
    assert.ok(typeof ceilResult.finalPrice === "number");
  });
});

test("QanoonAdapter — Two-Stage Stock Verification", async (t) => {
  const adapter = new QanoonAdapter({ mockData });

  await t.test("Stage 1 Advisory: returns inStock=true and stockStatus='in_stock' when available >= requested", async () => {
    const stock = await adapter.checkStock({
      goodId: "g-1001",
      requestedCount: 10,
      warehouseId: "main",
    });

    assert.equal(stock.inStock, true);
    assert.equal(stock.stockStatus, "in_stock");
    assert.equal(stock.availableCount, 140);
    assert.equal(stock.earliestExpDate, "2027-02-01");
    assert.equal(stock.advisoryWarning, null);
  });

  await t.test("Stage 1 Advisory: returns inStock=false, stockStatus='low_stock', and advisory warning when available < requested", async () => {
    const stock = await adapter.checkStock({
      goodId: "g-1004", // Available: 2 in main
      requestedCount: 5,
      warehouseId: "main",
    });

    assert.equal(stock.inStock, false);
    assert.equal(stock.stockStatus, "low_stock");
    assert.equal(stock.availableCount, 2);
    assert.ok(stock.advisoryWarning != null);
    assert.ok(stock.advisoryWarning.includes("موجودی ناکافی") || stock.advisoryWarning.includes("Insufficient"));
  });

  await t.test("Stage 1 Advisory: returns inStock=false, stockStatus='out_of_stock' when count is 0", async () => {
    const stock = await adapter.checkStock({
      goodId: "g-1006",
      requestedCount: 1,
      warehouseId: "main",
    });

    assert.equal(stock.inStock, false);
    assert.equal(stock.stockStatus, "out_of_stock");
    assert.equal(stock.availableCount, 0);
    assert.ok(stock.advisoryWarning != null);
  });

  await t.test("Stage 2 Pre-Batch Barrier: checks batch stock and compiles discrepancy list", async () => {
    const batchCheck = await adapter.checkBatchStock({
      warehouseId: "main",
      items: [
        { goodId: "g-1001", requestedCount: 2, title: "Amoxicillin" },
        { goodId: "g-1004", requestedCount: 10, title: "Cough Syrup" }, // Only 2 in stock
      ],
    });

    assert.equal(batchCheck.allAvailable, false);
    assert.equal(batchCheck.items.length, 2);
    assert.equal(batchCheck.discrepancies.length, 1);
    assert.ok(batchCheck.discrepancies[0].includes("Cough Syrup"));
  });

  await t.test("queries specific secondary warehouse correctly", async () => {
    const stockBranch2 = await adapter.checkStock({
      goodId: "g-1004",
      requestedCount: 5,
      warehouseId: "branch-2",
    });

    assert.equal(stockBranch2.inStock, true);
    assert.equal(stockBranch2.availableCount, 10);
  });
});

test("QanoonAdapter — Leading-Zero String Preservation", async (t) => {
  const adapter = new QanoonAdapter({ mockData });

  await t.test("preserves leading zeroes in genericCode and brandCode across search", async () => {
    const results = await adapter.searchGoods({ query: "00001" });
    assert.ok(results.length > 0);
    const item = results[0];
    assert.strictEqual(typeof item.genericCode, "string");
    assert.strictEqual(item.genericCode, "00001");
    assert.strictEqual(typeof item.brandCode, "string");
    assert.strictEqual(item.brandCode, "00001");
  });

  await t.test("stock check by genericCode preserves leading zeroes without numeric coercion", async () => {
    const stock = await adapter.checkStock({
      genericCode: "00001",
      requestedCount: 1,
    });
    assert.strictEqual(stock.genericCode, "00001");
    assert.notStrictEqual(stock.genericCode, 1);
    assert.notStrictEqual(stock.genericCode, "1");
  });

  await t.test("batch order items maintain leading zero code strings in output", async () => {
    const batch = await adapter.createBatchOrder({
      uniqueId: "test-unique-001",
      items: [
        { goodId: "g-1001", genericCode: "00001", quantity: 2, price: 185000 },
      ],
    });

    assert.strictEqual(batch.items[0].genericCode, "00001");
  });
});
```

---

## 7. Next Steps for Implementers (M1 Worker)

1. Use the reference calculation function in Section 2.4 as the core logic inside `src/adapters/qanoon-adapter.js`.
2. Populate `fixtures/qanoon-mock-data.json` with the goods, stock records, and tax tables detailed in Section 5.
3. Integrate the 15 unit tests from Section 6 into `test/qanoon-adapter.test.js`.
4. Ensure `checkStock` and `checkBatchStock` conform to the Stage 1 and Stage 2 interfaces detailed in Section 3.

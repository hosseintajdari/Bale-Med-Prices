# Milestone 1 Handoff Report: Pricing & Stock Rules Explorer

- **Agent:** `m1_explorer_2` (Pricing and Stock Rules Explorer)
- **Role:** Explorer
- **Milestone:** M1 (Legacy Qanoon Ingestion & API Adapter Boundary)
- **Target Folder:** `/home/admin/PanelPH/.agents/teamwork/m1_explorer_2`
- **Working Output:** `/home/admin/PanelPH/.agents/teamwork/m1_explorer_2/analysis.md`

---

## 1. Observation

Direct observations from codebase inspection, reference rules, and test executions:

1. **Interface Contract Specifications (`/home/admin/PanelPH/PROJECT.md`)**:
   - Lines 48–51:
     - `checkStock({ genericCode, brandCode, requestedCount }) -> { inStock: boolean, availableCount: number, warehouseId: string, advisoryWarning?: string }`
     - `calculatePrice({ goodId, quantity, roundingRule?: string }) -> { unitBasePrice: number, basePrice: number, vatAmount: number, tollAmount: number, technicalFee: number, finalPrice: number, warnings: string[] }`
   - Lines 14–17: Features F1 (REST adapter boundary), F2 (24h uniqueId idempotency), F3 (two-stage stock verification), F4 (deterministic pricing with 75/25 VAT/toll split and >10,000 Rial TTAC divergence warning).

2. **Authoritative Pricing Rules (`/home/admin/projects/Bale-Med-Prices/packages/domain/src/rules/calculate-final-price.ts` & `calculate-tax.ts`)**:
   - `calculate-tax.ts:37-39`:
     ```javascript
     const totalTax = roundValue(input.quantity * appliedRate.averageTax, input.roundingRule);
     const taxAmount = roundValue(totalTax * input.taxMultiplier, input.roundingRule);
     const tollAmount = totalTax - taxAmount;
     ```
   - `calculate-final-price.ts:58-63`:
     ```javascript
     const unitBasePrice = input.good.sellPrice || input.good.tempPrice || 0;
     const basePrice = roundValue(unitBasePrice * input.quantity, input.roundingRule);
     if (!input.good.sellPrice && input.good.tempPrice) {
       warnings.push("Used tempPrice because sellPrice was not available.");
     }
     ```
   - `calculate-final-price.ts:87-90`:
     ```javascript
     const finalPrice = roundValue(
       basePrice + taxAmount + tollAmount + technicalFee,
       input.roundingRule
     );
     ```

3. **Tax & Technical Fee Rates and Ground Truth Verification (`calculate-final-price.test.ts:5-69`)**:
   - Input: Amoxicillin 500mg, `sellPrice: 185000`, `quantity: 2`, `documentDate: "2026-06-24"`, `taxMultiplier: 0.75`, `roundingRule: "round"`, `taxData.averageTaxes`: `9100` (for 2026), `technicalFeeRules`: `15000` (for 2026), `avgCost: 132000`.
   - Results:
     - `basePrice = 185000 * 2 = 370000`
     - `totalTax = 2 * 9100 = 18200`
     - `taxAmount = round(18200 * 0.75) = 13650` (VAT, 75%)
     - `tollAmount = 18200 - 13650 = 4550` (Toll, 25%)
     - `technicalFee = 15000 * 2 = 30000`
     - `finalPrice = 370000 + 13650 + 4550 + 30000 = 418200`
     - `avgCost = 132000 * 2 = 264000`
     - `profitAmount = 418200 - 264000 = 154200`
     - `profitPercent = round((154200 / 264000) * 100) = 58%`

4. **TTAC Discrepancy Guard Invariants (`ADR-0001` and `pricing-rules.md:16-17`)**:
   - `pricing-rules.md:16`: "When a derived `TTAC` unit price is available, show a patient-facing warning if it differs from the primary `Qanoon Pharma` consumer unit price by more than 10,000 rial per consumption unit"
   - `pricing-rules.md:17`: "Do not automatically replace the primary `Qanoon Pharma` unit price with a higher `TTAC`-derived unit price"

5. **Leading-Zero Code Invariant (`REFERENCE-DATA.md:9` & `fixtures/catalog.sample.json:1-18`)**:
   - `fixtures/catalog.sample.json`: Generic code `"00001"` and brand code `"00001"` start with leading zeroes.
   - `REFERENCE-DATA.md:9`: "کدهای ژنریک و برند باید متنی بمانند تا صفر ابتدایی از بین نرود."

6. **Current Test Suite Execution**:
   - Command: `npm test` (running `node --test`)
   - Result: 4 passing tests, 0 failing tests, exit code 0.

---

## 2. Logic Chain

1. **Step 1 -> Base Unit Price**: Based on Observation 2 (`calculate-final-price.ts:58`), `sellPrice` is verified as primary consumer price. When zero or missing, fallback to `tempPrice` is required and must attach a warning to preserve audit transparency.
2. **Step 2 -> Base Price Extension**: Base price is strictly `roundValue(unitBasePrice * quantity, roundingRule)`, handling integer pricing correctly across quantities.
3. **Step 3 -> Mathematical Consistency of 75/25 Tax/Toll Split**: Based on Observation 2 (`calculate-tax.ts:37-39`), independent rounding of `round(totalTax * 0.75)` and `round(totalTax * 0.25)` causes arithmetic drift when `totalTax = 2` (where `round(1.5) = 2` and `round(0.5) = 1`, summing to `3 != 2`). Defining `tollAmount = totalTax - taxAmount` mathematically guarantees that `taxAmount + tollAmount === totalTax` across all inputs.
4. **Step 4 -> Non-Pharma Exemption**: Based on Observation 2 (`calculate-final-price.ts:32`), `good.nonPharma === true` skips technical dispense fees, ensuring cosmetics, supplements, and equipment are not charged pharmacy dispensing tariffs.
5. **Step 5 -> Final Consumer Price**: Strictly `basePrice + taxAmount + tollAmount + technicalFee`, fully matching Observation 3.
6. **Step 6 -> TTAC Price Guard**: Based on Observation 4 (`ADR-0001` and `pricing-rules.md:16-17`), when `|ttacPrice - unitBasePrice| > 10,000` Rials, a warning is attached, but Qanoon unit price is preserved without alteration.
7. **Step 7 -> Two-Stage Stock Verification**: Preliminary advisory check during need capture is non-blocking (informing the pharmacist with `in_stock`, `low_stock`, or `out_of_stock` badges without hindering draft entry), whereas pre-batch check before export is a blocking barrier compiling discrepancies to prevent invalid orders.
8. **Step 8 -> String Preservation**: Based on Observation 5 (`REFERENCE-DATA.md:9`), converting `"00001"` to a number strips leading zeros, breaking joins with catalog items. Enforcing `z.string()`, string normalization guards, and strict equality prevents this loss of identity.

---

## 3. Caveats

1. **Insurance Organization Share (`sahmSazmanAmount`)**: Excluded from initial automatic calculations per `REFERENCE-DATA.md:21` until live insurance claims web services are authorized.
2. **Multi-Warehouse Priority**: Default warehouse is `"main"`. Queries to secondary warehouses (`"branch-2"`) are supported, but automatic cross-warehouse split allocation is out of scope for Milestone 1.
3. **Offline Testing Mode**: In accordance with `ADR-002` and `ORIGINAL_REQUEST.md`, all tests and default adapter execution operate against offline mock fixtures (`fixtures/qanoon-mock-data.json`) without external network access.

---

## 4. Conclusion

The business logic for Milestone 1 has been completely analyzed, formalized, and verified:
1. **Pricing Calculation**: The 7-step deterministic pricing algorithm and exact 75/25 VAT/toll split are ready for implementation in `src/adapters/qanoon-adapter.js`.
2. **Stock Verification**: Two-stage lifecycle (preliminary advisory + pre-batch barrier) is specified with FEFO expiration sorting and discrepancy reporting.
3. **String Preservation**: Architectural constraints and defensive guards are defined to protect generic and brand codes with leading zeroes (`"00001"`).
4. **Deliverables**: Detailed technical analysis written to `/home/admin/PanelPH/.agents/teamwork/m1_explorer_2/analysis.md`, including a full 15-test unit suite for `test/qanoon-adapter.test.js` and mock data schemas.

---

## 5. Verification Method

To independently verify this report:

1. **Verify Baseline Test Suite**:
   ```bash
   cd /home/admin/PanelPH && npm test
   ```
   *Expected:* Exit code 0, 4 passing tests.

2. **Inspect Analysis Report**:
   ```bash
   test -f /home/admin/PanelPH/.agents/teamwork/m1_explorer_2/analysis.md
   ```
   *Expected:* File exists, containing all 7 calculation steps, stock check schemas, and test scenarios.

3. **Verify Reference Mathematical Ground Truth**:
   Check `/home/admin/projects/Bale-Med-Prices/packages/domain/src/rules/calculate-final-price.test.ts` lines 5–69 to verify exact arithmetic assertions for Amoxicillin 500mg (`finalPrice: 418200`, `vatAmount: 13650`, `tollAmount: 4550`, `technicalFee: 30000`).

4. **Invalidation Conditions**:
   - If `taxAmount + tollAmount !== totalTax` for any positive integer `totalTax`.
   - If `sellPrice` is replaced by `ttacPrice` when divergence > 10,000 Rials occurs.
   - If genericCode `"00001"` is coerced to number `1` or string `"1"`.

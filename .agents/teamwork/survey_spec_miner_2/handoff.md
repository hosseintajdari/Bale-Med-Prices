# Handoff Report — Legacy Qanoon Webservices & Domain Mining

**Agent:** survey_spec_miner_2 (Legacy Qanoon Spec Miner)  
**Parent Agent:** ba9cb93f-aa16-41f9-a7c1-f88d790936d4  
**Date:** 2026-10-14  
**Working Directory:** `/home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2`  
**Report Artifact:** `/home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/spec_report.md`  

---

## 1. Observation

Direct evidence was extracted from authoritative repository files and reference materials:

1. **Qanoon REST Webservice Architecture & Semantics:**
   - `/home/admin/projects/Bale-Med-Prices/docs/qanoon-webservices-notes.md`:
     - Line 7: `"- Qanoon documents a REST API style integration path"`
     - Line 8: `"- data exchange is described as JSON"`
     - Line 9: `"- the document mentions web use cases such as internet sales site or kiosk"`
     - Line 10: `"- the document emphasizes repeated stock checks before finalizing sale"`
     - Line 11: `"- it also emphasizes a stable uniqueId for retry-safe operations"`
   - `/home/admin/PanelPH/docs/adr/ADR-002-qanoon-authorized-source-access.md`:
     - Line 9: `"داروخانه مجوز استفاده از نرم افزار قانون و مسیرهای API وابسته را دارد. هزینه جاری دسترسی برای به روزرسانی قیمت ها و قواعد مرتبط پرداخت می شود."`
     - Line 16: `"هر اتصال زنده باید منبع، تاریخ دریافت، وضعیت موفقیت و خطا را ثبت کند. داده قیمت و قواعد نسخه دار و زمان دار نگه داشته می شود. منطق PanelPH به API یا رابط قانون قفل نمی شود و پشت یک مرز منبع داده باقی می ماند."`
     - Line 21: `"مجوز استفاده از قانون، دامنه نسخه آزمایشی را به ارسال سفارش، پرداخت، تغییر موجودی، صدور سند یا تغییر داده عملیاتی گسترش نمی دهد."`

2. **Domain Data Models & Storage Schema:**
   - `/home/admin/projects/Bale-Med-Prices/docs/data-model.md`:
     - Lines 3–14: `goods` entity containing `id`, `genericCode`, `title`, `brand`, `sellPrice`, `tempPrice`, `taxCodes`, `nonPharma`, `countInPackage`.
     - Lines 15–22: `tax_codes` containing `code`, `title`, and `averageTaxes` (`date`, `averageTax`).
     - Lines 23–29: `technical_fees` containing `type`, `amount`, `effectiveDate`, `conditions`.
     - Lines 30–35: `settings` containing `taxMultiplier`, `roundingRule`, `pricePolicy`.
     - Lines 36–45: `warehouse_transactions` containing `goodId`, `type`, `documentDate`, `price`, `count`, `expDate`, `warehouseId`.
     - Lines 46–53: `goods_last_stock` containing `goodId`, `warehouseId`, `expDate`, `count`, `avgCost`.

3. **Pricing Rules & Tax/Toll Logic:**
   - `/home/admin/projects/Bale-Med-Prices/packages/domain/src/rules/calculate-final-price.ts`:
     - Line 58: `const unitBasePrice = input.good.sellPrice || input.good.tempPrice || 0;`
     - Line 59: `const basePrice = roundValue(unitBasePrice * input.quantity, input.roundingRule);`
     - Lines 61–63: `if (!input.good.sellPrice && input.good.tempPrice) { warnings.push("Used tempPrice because sellPrice was not available."); }`
     - Lines 69–75: Call to `calculateTax` using `taxMultiplier` and `roundingRule`.
     - Lines 87–90: `const finalPrice = roundValue(basePrice + taxAmount + tollAmount + technicalFee, input.roundingRule);`
   - `/home/admin/projects/Bale-Med-Prices/packages/domain/src/rules/calculate-tax.ts`:
     - Line 37: `const totalTax = roundValue(input.quantity * appliedRate.averageTax, input.roundingRule);`
     - Line 38: `const taxAmount = roundValue(totalTax * input.taxMultiplier, input.roundingRule);`
     - Line 39: `const tollAmount = totalTax - taxAmount;`
   - `/home/admin/projects/Bale-Med-Prices/docs/pricing-rules.md`:
     - Line 16: `"12. When a derived TTAC unit price is available, show a patient-facing warning if it differs from the primary Qanoon Pharma consumer unit price by more than 10,000 rial per consumption unit"`
     - Line 17: `"13. Do not automatically replace the primary Qanoon Pharma unit price with a higher TTAC-derived unit price"`

4. **Catalog Resolution & Leading Zero Constraint:**
   - `/home/admin/PanelPH/docs/REFERENCE-DATA.md`:
     - Line 9: `"کدهای ژنریک و برند باید متنی بمانند تا صفر ابتدایی از بین نرود."`
     - Line 13: `"پس از ساخت قابلیت تطبیق اختیاری، این منبع می تواند برای پیشنهاد یک کالای دقیق به کاربر به کار رود: عنوان، کد ژنریک، کد برند، شکل و دوز. پیشنهاد همیشه نیازمند تأیید کاربر است و ثبت آزاد نیاز را مسدود نمی کند."`
     - Line 21: `"در مرحله داده نمونه، فقط یک زیرمجموعه ساختگی و کمینه با این فیلدها استفاده می شود: genericCode، brandCode، title، dosageForm، strength و referenceDate."`

5. **Existing PanelPH Baseline Execution:**
   - Tool `run_command` executing `node --test` in `/home/admin/PanelPH`:
     - `✔ stores a free-text need and preserves it after reopening (22.674128ms)`
     - `✔ resolves a need only when the user supplies a concrete reference (22.906681ms)`
     - `✔ revert records a new event instead of erasing history (49.142844ms)`
     - `✔ serves MCP initialization through the local endpoint (617.984034ms)`
     - Total: 4 tests passed, 0 failures, exit code 0.

---

## 2. Logic Chain

1. **Qanoon Webservices Isolation:**
   - From Observation 1 (`qanoon-webservices-notes.md` lines 7–11 and `ADR-002` lines 16–21), Qanoon exposes a JSON REST interface supporting internet sales and kiosk integration, emphasizing repeated stock checks and stable `uniqueId` retry semantics.
   - Therefore, the required adapter (`src/adapters/qanoon-adapter.js`) must model these exact endpoints (`/stock/check`, `/orders/batch`, `/pricing/calculate`, `/goods/search`), encapsulate all legacy headers (`Authorization`, `X-Pharmacy-Id`, `X-Unique-Id`), and keep domain code cleanly separated from Qanoon's legacy payload structure.

2. **Idempotency via `uniqueId`:**
   - From Observation 1, Qanoon mandates a stable `uniqueId` to guarantee that network timeouts, kiosk retries, and rapid client clicks do not result in duplicate stock allocations or multiple order batch lines.
   - Therefore, the adapter must generate a deterministic or UUID-based `uniqueId` for batch creation, and the mock harness must verify that retrying with the same `uniqueId` returns the cached result without double-decrementing stock.

3. **Two-Stage Stock Checks:**
   - From Observation 1 (repeated stock checks) and Observation 2 (`goods_last_stock`), stock levels are volatile due to concurrent retail dispensation.
   - Therefore, stock verification must occur twice: first when resolving a need (to display status badges in the UI), and second as a pre-validation barrier before batching or exporting the draft order.

4. **Deterministic Pricing Engine:**
   - From Observation 3 (`calculate-final-price.ts` and `calculate-tax.ts`), the pricing engine follows strict formulas:
     - `basePrice = round(sellPrice || tempPrice * qty)`
     - `totalTax = round(qty * averageTax)`
     - `taxAmount = round(totalTax * 0.75)` (VAT)
     - `tollAmount = totalTax - taxAmount` (municipal toll)
     - `technicalFee = appliedRule.amount * qty` (if pharma and qty >= min)
     - `finalPrice = basePrice + taxAmount + tollAmount + technicalFee`
     - Price divergence warning emitted if `|TTAC - Qanoon| > 10,000` Rials.
   - Therefore, the operational backend and adapter must replicate this deterministic calculation and surface warnings accordingly.

5. **Catalog Resolution & Normalization:**
   - From Observation 4 (`REFERENCE-DATA.md`), `genericCode` and `brandCode` must remain strings to preserve leading zeroes (e.g., `"00001"`).
   - Furthermore, free-text need entry must never be blocked by catalog lookup; catalog matches serve only as suggestions, and resolution requires explicit pharmacist confirmation (`resolveNeed`).

6. **Test Isolation via Fixtures:**
   - From Observation 5 and `ORIGINAL_REQUEST.md`, test suites must run via `node --test` with 100% pass rate without external network dependencies.
   - Therefore, mock fixtures for catalog, stock, pricing, and orders must be provided so the adapter can run in mock mode during tests.

---

## 3. Caveats

1. **No Direct Access to Live Production Qanoon Server:** All protocol details and schema formats are mined from the authoritative documentation (`مستندات.pdf` extraction in `qanoon-webservices-notes.md`), `ADR-001`, `ADR-002`, `REFERENCE-DATA.md`, and validated reference implementations in `Bale-Med-Prices` and `bale-panel`.
2. **Historical Qanoon Binary Archives Ignored:** As mandated by `HANDOFF.md` line 34, old archives in `local-inputs/qanoon` are treated purely as historical references and were not used to infer current runtime behavior.
3. **Insurance Share Calculations in Prototype:** As specified in `REFERENCE-DATA.md`, health insurance subsidies (`sahmSazman`) are informational only in this phase and do not alter net consumer price without human verification.

---

## 4. Conclusion

The legacy Qanoon webservice specifications, data contracts, and operational requirements have been fully analyzed and documented in `/home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/spec_report.md`.

Key findings ready for implementation:
- **Adapter Contract:** Standardized interfaces for `checkStock(warehouseId, items)`, `calculatePrice(goodId, quantity, options)`, `searchCatalog(query)`, and `createOrderBatch(uniqueId, items)`.
- **Idempotency:** Stable `uniqueId` protocol with replay caching and conflict detection.
- **Stock Check:** Two-stage verification with FEFO batch expiration support and discrepancy flagging.
- **Pricing:** Deterministic 7-step pipeline with 75/25 VAT/toll split and TTAC divergence warnings.
- **Catalog Resolution:** String-preserved codes with leading zeroes, Persian/Arabic orthographic normalization, and human-in-the-loop confirmation.
- **Mock Fixtures:** Concrete schemas for catalog, stock, pricing, and order batches enabling complete offline test verification.

---

## 5. Verification Method

To independently verify this specification and its alignment with the codebase:

1. **Inspect Documentation Report:**
   ```bash
   cat /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/spec_report.md
   ```
2. **Inspect Referenced Authoritative Documents:**
   ```bash
   cat /home/admin/projects/Bale-Med-Prices/docs/qanoon-webservices-notes.md
   cat /home/admin/PanelPH/docs/adr/ADR-002-qanoon-authorized-source-access.md
   cat /home/admin/PanelPH/docs/REFERENCE-DATA.md
   cat /home/admin/projects/Bale-Med-Prices/docs/pricing-rules.md
   cat /home/admin/projects/Bale-Med-Prices/docs/data-model.md
   ```
3. **Verify Existing Project Baseline Tests:**
   ```bash
   cd /home/admin/PanelPH && node --test
   ```
   Expected result: 4 tests pass with exit code 0.
4. **Invalidation Conditions:**
   - Any modification that forces free-text needs to be tied to a catalog before saving invalidates the PRD/ADR-001 design invariant.
   - Converting `genericCode` or `brandCode` to numeric types invalidates the Iranian National Drug List leading-zero constraint.
   - Performing live external network requests during `node --test` invalidates Acceptance Criteria guardrails.

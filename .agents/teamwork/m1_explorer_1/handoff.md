# Handoff Report: Milestone 1 — Qanoon Adapter & Mock Fixtures (Explorer 1)

**Agent ID:** `m1_explorer_1`  
**Role:** Qanoon Adapter Explorer (Architecture, Mock Mode, Resiliency & Fixtures)  
**Target Files:**  
- `src/adapters/qanoon-adapter.js`  
- `fixtures/qanoon-mock-data.json`  
- `test/qanoon-adapter.test.js`  
**Analysis Report:** `/home/admin/PanelPH/.agents/teamwork/m1_explorer_1/analysis.md`  
**Date:** 2026-10-14  

---

## 1. Observation

1. **Current Test Baseline:**
   Executing `npm test` in `/home/admin/PanelPH` runs `node --test` with exit code `0`:
   ```
   > panelph@0.1.0 test
   > node --test

   ✔ stores a free-text need and preserves it after reopening (33.000123ms)
   ✔ resolves a need only when the user supplies a concrete reference (28.353764ms)
   ✔ revert records a new event instead of erasing history (18.067842ms)
   PanelPH MCP App listening at http://localhost:0/mcp
   ✔ serves MCP initialization through the local endpoint (653.619065ms)
   ℹ tests 4
   ℹ suites 0
   ℹ pass 4
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 1006.342024
   ```

2. **Existing Codebase Layout (`/home/admin/PanelPH`):**
   - `src/` contains only `draft-store.js` (181 lines) and `server.js` (195 lines).
   - Directory `src/adapters/` does not yet exist.
   - Directory `fixtures/` contains only `catalog.sample.json` (19 lines), with codes `"00001"` and `"14083"`.
   - `test/` contains only `draft-store.test.js` (37 lines) and `server.test.js` (53 lines).

3. **Authoritative Interface Contract in `PROJECT.md` (lines 47–57):**
   - `checkStock({ genericCode, brandCode, requestedCount })`:
     Returns `{ inStock: boolean, availableCount: number, warehouseId: string, advisoryWarning?: string }`.
   - `calculatePrice({ goodId, quantity, roundingRule?: string })`:
     Returns `{ unitBasePrice: number, basePrice: number, vatAmount: number, tollAmount: number, technicalFee: number, finalPrice: number, warnings: string[] }`.
   - `createBatchOrder({ draftId, uniqueId, items: Array<{ goodId, genericCode, quantity, price }> })`:
     Headers: `{ "X-Unique-Id": uniqueId }`.
     Returns `{ success: boolean, batchId: string, uniqueId: string, timestamp: string, status: "SUBMITTED" | "CACHED" }`.
   - `searchGoods({ query })`:
     Returns `Array<{ goodId: string, genericCode: string, brandCode: string, title: string, dosageForm: string, strength: string, sellPrice: number }>`.

4. **Pricing and Tax Rules in `/home/admin/projects/Bale-Med-Prices/packages/domain/src/rules/`:**
   - `calculate-tax.ts` lines 37–39:
     ```typescript
     const totalTax = roundValue(input.quantity * appliedRate.averageTax, input.roundingRule);
     const taxAmount = roundValue(totalTax * input.taxMultiplier, input.roundingRule);
     const tollAmount = totalTax - taxAmount;
     ```
     With `taxMultiplier = 0.75`, allocating 75% to government VAT and 25% to municipal toll.
   - `calculate-final-price.ts` lines 58–63:
     `unitBasePrice = input.good.sellPrice || input.good.tempPrice || 0`. If `sellPrice` is missing, warning `"Used tempPrice because sellPrice was not available."` is emitted.
   - `calculate-final-price.ts` lines 24–41:
     Technical dispense fee is excluded if `conditions.excludeNonPharma && input.good.nonPharma` or if `input.quantity < conditions.minimumQuantity`.

5. **Security & Boundary Mandate (`docs/adr/ADR-002-qanoon-authorized-source-access.md`):**
   - No credentials, API keys, or live production endpoints are hardcoded in repository or client configurations.
   - Offline tests and development runs must execute without live network dependencies.

---

## 2. Logic Chain

1. **Decoupling Domain Logic from Legacy API:**
   - Observation 2 & 3: PanelPH domain store (`draft-store.js`) and MCP server (`server.js`) must not invoke raw fetch or know Qanoon's wire schemas.
   - Therefore, `src/adapters/qanoon-adapter.js` must encapsulate all endpoint mapping, data transformations, and HTTP headers (`Authorization`, `X-Pharmacy-Id`, `X-Client-Id`, `X-Unique-Id`).

2. **Zero-Network Offline Mock Mode:**
   - Observation 1, 2, & 5: Acceptance criteria require test suites to pass 100% offline.
   - Therefore, `QanoonAdapter` defaults to `mockMode = true` whenever `apiKey` is absent, or `NODE_ENV === "test"`, or `process.env.QANOON_MOCK_MODE === "true"`.
   - In mock mode, calls read deterministically from `fixtures/qanoon-mock-data.json` without opening sockets or making HTTP requests.

3. **Leading Zero Preservation:**
   - Observation 2 & 4: Codes like `"00001"` and `"00420"` lose their leading zeroes if parsed as integers (e.g. `parseInt("00001") === 1`).
   - Therefore, `searchGoods` and `checkStock` must strictly enforce string coercions (`String(code)`) and avoid numeric conversions.

4. **Deterministic Calculation & Divergence Guards:**
   - Observation 3 & 4: Pricing requires 7 deterministic steps: base price, tax rate resolution, 75/25 VAT/toll split, technical dispense fee, final price sum, TTAC divergence guard (>10,000 Rial warning), and average cost profit ledger.
   - The adapter must implement this identical calculation sequence in mock mode and expect it from live endpoints.

5. **Idempotency Cache Architecture:**
   - Observation 3: Re-submitting an order batch with the same `uniqueId` must never allocate duplicate warehouse inventory or create duplicate order rows.
   - Therefore, `QanoonAdapter` maintains an in-memory 24-hour TTL Map `idempotencyCache`.
   - Identical payloads return `{ ...cached, status: "CACHED" }`.
   - Conflicting payloads with an identical `uniqueId` throw `QanoonConflictError`.

6. **Error Classification Hierarchy:**
   - Observation 3: Upstream failures must be categorized into typed errors (`QanoonValidationError`, `QanoonAuthenticationError`, `QanoonNotFoundError`, `QanoonConflictError`, `QanoonNetworkTimeoutError`, `QanoonServerError`) rather than generic uncaught runtime exceptions.
   - Timeouts must be bounded by `AbortSignal.timeout(this.timeoutMs)` with default 5000ms.

---

## 3. Caveats

1. **Live Network Inaccessibility:**
   No live Qanoon endpoints were pinged, as per ADR-002 integrity constraints (no production endpoints or credentials permitted in dev).
2. **Persistence of Idempotency Cache:**
   The M1 adapter design specifies an in-memory `Map` with 24-hour expiration for `uniqueId`. Disk persistence across process restarts can be layered in Milestone 3 with the draft store mutex persistence if needed.
3. **Fixture Scope:**
   `fixtures/qanoon-mock-data.json` includes 7 representative items covering all dosage forms, tax codes, edge cases (shortage, expired batch, tempPrice only, TTAC divergence), and multi-warehouse routing. Additional items can be appended without breaking the schema.

---

## 4. Conclusion

1. **Target Deliverables Defined:**
   - `src/adapters/qanoon-adapter.js`: Class `QanoonAdapter` exposing `checkStock`, `calculatePrice`, `createBatchOrder`, and `searchGoods`, plus custom error hierarchy.
   - `fixtures/qanoon-mock-data.json`: Self-contained JSON fixture with `goods`, `stock`, `taxRates`, `technicalFees`, and `orders`.
   - `test/qanoon-adapter.test.js`: Suite of unit tests covering stock shortage, expired batches, 7-step pricing, 75/25 tax split, TTAC divergence warning, leading-zero preservation, and 24-hour idempotency cache.
2. **Ready for Implementation:**
   The architectural blueprint in `/home/admin/PanelPH/.agents/teamwork/m1_explorer_1/analysis.md` provides complete ES module code skeletons and schemas ready for the Milestone 1 Worker to implement directly.

---

## 5. Verification Method

1. **Check Analysis Report Existence and Structure:**
   ```bash
   test -f /home/admin/PanelPH/.agents/teamwork/m1_explorer_1/analysis.md
   wc -l /home/admin/PanelPH/.agents/teamwork/m1_explorer_1/analysis.md
   ```
2. **Verify Current Test Baseline:**
   ```bash
   cd /home/admin/PanelPH && npm test
   ```
   (Must output 4 passing tests with exit code 0).
3. **Downstream Worker Verification (Post-Implementation):**
   Once `src/adapters/qanoon-adapter.js`, `fixtures/qanoon-mock-data.json`, and `test/qanoon-adapter.test.js` are created:
   ```bash
   node --test test/qanoon-adapter.test.js
   node --test
   ```
   Expected result: 100% pass with exit code 0 and zero external network calls.

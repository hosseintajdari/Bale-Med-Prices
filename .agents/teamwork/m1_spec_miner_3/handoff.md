# Handoff Report: Milestone 1 — Qanoon API Spec & Idempotency Cache Mining

**From:** m1_spec_miner_3 (Qanoon API Spec & Idempotency Miner)  
**To:** Orchestrator (`ba9cb93f-aa16-41f9-a7c1-f88d790936d4`) and Milestone 1 Worker  
**Date:** 2026-10-14  
**Handoff Type:** Hard (Task complete)  

---

## 1. Observation

Direct observations extracted from inspected authoritative documents, codebases, and tool executions:

1. **`ORIGINAL_REQUEST.md` (R1 & Acceptance Criteria)**:
   - Line 20–23: *"Analyze legacy Qanoon documentation, REST web-service definitions (JSON exchange, uniqueId retry semantics, stock checks), and data models. Implement an isolated Qanoon adapter boundary (src/adapters/qanoon-adapter.js or .ts) ensuring PanelPH domain logic is decoupled from legacy schemas. Document the schema and interaction flow in docs/qanoon-api-spec.md."*
   - Line 48–49: *"Automated test suite runs via node --test with exit code 0 and 100% passing tests. New unit and integration tests verify the Qanoon adapter, catalog resolution, and order batch creation without live external network dependencies (using fixtures/mocks)."*
   - Line 53–54: *"Qanoon API contracts and data exchange flows are fully documented in docs/qanoon-api-spec.md. No hardcoded credentials, live production endpoints, or un-isolated third-party API dependencies."*

2. **`PROJECT.md` (Architecture, Contracts & Layout)**:
   - Line 9: *"Qanoon Adapter Boundary (`src/adapters/qanoon-adapter.js`): Clean abstraction isolating PanelPH from legacy Qanoon webservices. Implements 24-hour uniqueId retry/idempotency cache, stock checks (preliminary and batch pre-check), deterministic 7-step pricing calculation (with 75/25 VAT/toll split and >10,000 Rial TTAC divergence warning), and offline mock fixtures for reproducible tests."*
   - Lines 48–56:
     - `checkStock({ genericCode, brandCode, requestedCount })` -> `{ inStock: boolean, availableCount: number, warehouseId: string, advisoryWarning?: string }`
     - `calculatePrice({ goodId, quantity, roundingRule?: string })` -> `{ unitBasePrice: number, basePrice: number, vatAmount: number, tollAmount: number, technicalFee: number, finalPrice: number, warnings: string[] }`
     - `createBatchOrder({ draftId, uniqueId, items: Array<{ goodId, genericCode, quantity, price }> })` -> `{ success: boolean, batchId: string, uniqueId: string, timestamp: string, status: "SUBMITTED" | "CACHED" }`
     - `searchGoods({ query })` -> `Array<{ goodId: string, genericCode: string, brandCode: string, title: string, dosageForm: string, strength: string, sellPrice: number }>`
   - Line 39: Milestone 1 scope is `src/adapters/qanoon-adapter.js`, `docs/qanoon-api-spec.md`, `fixtures/qanoon-mock-data.json`, `test/qanoon-adapter.test.js`.

3. **`ADR-002-qanoon-authorized-source-access.md`**:
   - Lines 16–21: Confirms pharmacy license for Qanoon API usage, but establishes a strict safety boundary: domain logic must never couple directly to Qanoon schemas; live operational data changes (inventory mutations, financial commitments) are forbidden during prototype/testing; no credentials or private URLs permitted in repo.

4. **Reference Implementation (`/home/admin/projects/Bale-Med-Prices`)**:
   - `packages/domain/src/rules/calculate-final-price.ts` (lines 56–126) and `calculate-tax.ts` (lines 13–47):
     - `unitBasePrice = good.sellPrice || good.tempPrice || 0`
     - `basePrice = roundValue(unitBasePrice * quantity, roundingRule)`
     - `totalTax = roundValue(quantity * appliedRate.averageTax, roundingRule)`
     - `taxAmount = roundValue(totalTax * 0.75, roundingRule)`
     - `tollAmount = totalTax - taxAmount` (exact remainder, no rounding drift)
     - `technicalFee = roundValue(appliedRule.amount * quantity, roundingRule)` (evaluated with `excludeNonPharma` check)
     - `finalPrice = basePrice + taxAmount + tollAmount + technicalFee`
     - Warning emitted if `sellPrice` is absent and `tempPrice` is used.
     - Warning emitted if TTAC unit price diverges from Qanoon unit price by >10,000 Rials.
   - `packages/domain/src/rules/calculate-final-price.test.ts` (lines 56–69): Verifies exact pricing output with Amoxicillin (unit price 185,000, quantity 2, totalTax 18,200, tax 13,650, toll 4,550, technicalFee 30,000, finalPrice 418,200).

5. **Current Codebase State**:
   - `src/adapters/` does not exist yet.
   - `docs/qanoon-api-spec.md` does not exist yet.
   - Existing automated test command `node --test` executed with exit code 0:
     ```
     ✔ stores a free-text need and preserves it after reopening (24.095299ms)
     ✔ resolves a need only when the user supplies a concrete reference (37.636132ms)
     ✔ revert records a new event instead of erasing history (348.239212ms)
     ✔ serves MCP initialization through the local endpoint (2626.482655ms)
     ℹ tests 4
     ℹ suites 0
     ℹ pass 4
     ℹ fail 0
     ℹ duration_ms 3164.259335
     ```

---

## 2. Logic Chain

1. From **Observation 1 & 3**, PanelPH must operate behind an isolated adapter boundary (`src/adapters/qanoon-adapter.js`) with complete specification documentation in `docs/qanoon-api-spec.md`. The adapter must default to mock mode (`mockMode: true`) using local fixtures (`fixtures/qanoon-mock-data.json`) to guarantee 100% offline test execution without external network access or risk to live pharmacy data.
2. From **Observation 1 & 2**, batch order creation (`POST /orders/batch`) requires strict idempotency via `uniqueId` with a 24-hour cache TTL. In a pharmacy counter environment, network retries or repeated button clicks must not create duplicate orders or deduct inventory twice.
3. To implement this 24-hour idempotency cache robustly in `QanoonAdapter`:
   - The cache key is the client-provided `uniqueId`.
   - The payload must be fingerprinted using SHA-256 over normalized, sorted order fields (`draftId`, `warehouseId`, `items`).
   - The cache entry manages states: `IN_FLIGHT` (concurrent request guard), `COMPLETED` (cached response available), `FAILED` (transient vs permanent failure).
   - If an identical `uniqueId` is resubmitted within 24h with an identical payload hash, the adapter immediately returns the cached response with `status: "CACHED"` and `isIdempotentReplay: true`, bypassing execution.
   - If an identical `uniqueId` is resubmitted with an altered payload hash, the adapter rejects the request with HTTP 409 and error code `UNIQUE_ID_PAYLOAD_MISMATCH`.
   - If an identical `uniqueId` arrives while another call is `IN_FLIGHT`, the adapter returns HTTP 409 `CONCURRENT_REQUEST_IN_FLIGHT` with a `Retry-After: 2` header.
   - Eviction is dual-tier: passive lazy eviction on read (`Date.now() > expiresAt`), plus an unref'd active interval sweep and LRU maximum capacity cap.
4. From **Observation 4**, the 7-step deterministic pricing algorithm in the adapter must faithfully match the production-tested logic from `Bale-Med-Prices`:
   - Base price = `sellPrice` (or fallback to `tempPrice` with a warning) × quantity.
   - Tax/toll = dated average tax lookup with 75% VAT (`round(totalTax * 0.75)`) and 25% municipal toll (`totalTax - taxAmount`).
   - Technical dispense fee = 15,000 Rials × quantity for pharma goods, but strictly excluded (`amount: 0`) for non-pharma goods (`good.nonPharma === true`).
   - TTAC divergence guard = attaches warning if `|TTAC_price - Qanoon_price| > 10,000` Rials without overwriting Qanoon price.
5. From **Observation 2 & 4**, code string preservation is critical: Iranian generic and brand codes carry semantic leading zeroes (e.g. `"00001"`, `"08234"`). In numeric JSON conversion or parsing, these zeroes are lost (`"00001"` -> `1`). All adapter methods, schemas, and fixtures must enforce `string` type for `genericCode` and `brandCode`.
6. From **Observation 1 & 5**, all specifications, schemas, endpoints, and caching rules have been synthesized and documented in `/home/admin/PanelPH/.agents/teamwork/m1_spec_miner_3/spec_plan.md`, providing an unambiguous implementation blueprint for the Milestone 1 Worker.

---

## 3. Caveats

1. **Live Qanoon Connectivity**: As prescribed by `ADR-002`, live Qanoon endpoints and credentials are intentionally excluded from the local test environment. All automated verification relies on local mock fixtures in `fixtures/qanoon-mock-data.json`.
2. **Cache Persistence Across Restarts**: The primary requirement is an in-memory 24-hour cache within `QanoonAdapter`. If process crash resilience is required by future milestones, an optional JSON backup (`state/qanoon-idempotency.json`) can be appended, but in-memory `Map` with TTL and concurrency locks fully fulfills M1 requirements.

---

## 4. Conclusion

- The specification mining for Milestone 1 is complete.
- Complete specifications for `docs/qanoon-api-spec.md` (8 sections, OpenAPI-style schemas, Mermaid architecture, error envelopes, leading-zero invariants) have been drafted in `spec_plan.md`.
- Complete mechanics for the 24-hour `uniqueId` idempotency cache (payload hashing, state transitions, concurrent lock queue, 409 conflict detection, dual eviction) have been specified in `spec_plan.md`.
- The Milestone 1 Worker has everything necessary to create `fixtures/qanoon-mock-data.json`, write `docs/qanoon-api-spec.md`, implement `src/adapters/qanoon-adapter.js`, and write unit tests in `test/qanoon-adapter.test.js`.

---

## 5. Verification Method

To independently verify this specification and its readiness for implementation:

1. **Inspect Specification Plan**:
   - File: `/home/admin/PanelPH/.agents/teamwork/m1_spec_miner_3/spec_plan.md`
   - Verify Section 2 contains the full 8-section layout for `docs/qanoon-api-spec.md`.
   - Verify Section 3 defines the 24-hour `uniqueId` cache mechanics, payload SHA-256 hashing, and state transitions.
   - Verify Section 4 defines the `QanoonAdapter` class interface matching `PROJECT.md`.
   - Verify Section 6 & 7 contain the Features Discovered and Edge Cases tables.
2. **Verify Baseline Test Health**:
   - Command: `node --test` in `/home/admin/PanelPH`
   - Expected Output: 4/4 passing tests with exit code 0.
3. **Invalidation Conditions**:
   - Any pricing calculation that fails to split tax/toll 75/25 or drops leading zeros from generic codes.
   - Any idempotency cache implementation that executes duplicate batch order reservations or stock deductions when replaying an identical `uniqueId`.

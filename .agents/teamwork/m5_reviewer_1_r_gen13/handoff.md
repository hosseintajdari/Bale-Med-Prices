# Handoff Report — Gate 5: Backend & Qanoon Adapter Verification

**Agent**: `m5_reviewer_1_r_gen13` (Backend Reviewer & Adversarial Critic)  
**Date**: 2026-10-14T19:20:15Z  
**Verdict**: **APPROVE**  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m5_reviewer_1_r_gen13`  

---

## 1. Observation

### 1.1 Scope Files Inspected
The following 8 review scope files were inspected line-by-line:
1. `src/adapters/qanoon-adapter.js` (615 lines):
   - Lines 10-55: Complete custom typed error hierarchy (`QanoonAdapterError`, `QanoonValidationError`, `QanoonAuthenticationError`, `QanoonNotFoundError`, `QanoonConflictError`, `QanoonNetworkTimeoutError`, `QanoonServerError`).
   - Lines 69-87: `computePayloadHash` normalizes items, sorts by `(goodId || genericCode)`, and produces a deterministic SHA-256 fingerprint.
   - Lines 107-114: In-memory 24-hour idempotency cache (`idempotencyTtlMs = 86400000`, `idempotencyCache = new Map()`, `inFlightLocks = new Set()`).
   - Lines 131-226: Stage 1 advisory stock verification (`checkStock`) evaluating warehouse inventory, `earliestExpDate < today` expiration status, and stockStatus (`in_stock`, `low_stock`, `out_of_stock`).
   - Lines 231-270: Stage 2 pre-batch inventory barrier (`checkBatchStock`) validating multi-item batches and compiling actionable discrepancy warnings.
   - Lines 275-430: Deterministic 7-step pricing calculation engine (`calculatePrice`) executing:
     - Step 1: Base Unit Price resolution (`sellPrice` with fallback to `tempPrice` and warning).
     - Step 2: Base Price extension (`unitBasePrice * quantity`).
     - Step 3: 75/25 Tax/Toll resolution (`taxAmount = roundValue(totalTax * 0.75)`, `tollAmount = totalTax - taxAmount`, ensuring exact sum equality without penny drift).
     - Step 4: Technical dispense fee calculation (rule lookup with date bounds, exempting `nonPharma` items).
     - Step 5: Final price aggregation (`basePrice + taxAmount + tollAmount + technicalFee`).
     - Step 6: Operational cost and profit calculation (`avgCost`, `profitAmount`, `profitPercent`).
     - Step 7: TTAC divergence guard (`Math.abs(effectiveTtacPrice - unitBasePrice) > 10000` emits warning).
   - Lines 435-520: `createBatchOrder` enforcing 24h idempotency cache, payload hash collision detection (throwing `QanoonConflictError` on mismatch), and in-flight lock protection.
   - Lines 525-562: `searchGoods` with strict string preservation of leading-zero codes.
   - Lines 566-604: Resilient HTTP transport (`_fetch`) with `AbortSignal.timeout(this.timeoutMs)` and HTTP status code translation to typed errors.
2. `src/catalog-resolver.js` (635 lines):
   - Lines 8-22: `normalizeDigits` character-by-character Persian/Arabic to ASCII digit transliteration.
   - Lines 32-52: `normalizeText` Persian/Arabic normalizer (Yeh/Keheh/Teh Marbuta, diacritics stripping, ZWNJ to space, punctuation removal).
   - Lines 57-61: `normalizeCodeString` strictly preserving string format and leading zeroes without numeric coercion.
   - Lines 64-90: Disallowed standalone aliases and isolated units/status terms (`GENERIC_DISALLOWED_ALIASES`, `ISOLATED_UNITS`, `ISOLATED_STATUS_TERMS`) to eliminate false-positive candidate matches.
   - Lines 276-444: Multi-tier candidate scoring (`scoreCandidate`) across exact codes, titles, starts-with, multi-token overlap with dosage form/strength boosting, and aliases.
   - Lines 450-514: `searchCatalog` returning ranked results with dual-code tie breaking.
   - Lines 520-596: `resolveItem` categorizing confidence (`high`, `medium`, `low`, `none`) and detecting ambiguity margins.
3. `src/draft-store.js` (453 lines):
   - Lines 14-43: `DraftMutex` per-draftId FIFO promise serialization queue with automatic tail pruning.
   - Lines 81-107: `getActiveRevertTargetIds` and `getActiveEventIds` computing active events newest-to-oldest, supporting recursive un-reverts.
   - Lines 112-167: `projectItems` deterministically projecting draft item states from chronological event replays.
   - Lines 172-188: `atomicWriteFile` utilizing unique `.tmp` filenames and atomic `rename` with cleanup.
   - Lines 207-245: Resilient state loading with auto-creation of missing files and automatic quarantine (`.corrupt.<timestamp>`) for malformed JSON.
   - Lines 274-450: Public store methods (`getDraft`, `addNeed`, `updateNeed`, `resolveNeed`, `revertEvent`) strictly append-only, validated, and mutex-protected.
4. `docs/qanoon-api-spec.md` (359 lines):
   - Full REST interface specification documenting transport, standard headers, schemas for stock check, deterministic 7-step pricing, goods search, 24h idempotency order batching, error codes, and leading-zero preservation invariants.
5. `fixtures/qanoon-mock-data.json` (359 lines):
   - Comprehensive mock catalog containing goods, stock snapshots across warehouses (`main`, `branch-2`), historical tax rate tables (`TAX_MED_STANDARD`, `TAX_MED_REDUCED`, `TAX_COSMETIC`), technical dispense fee rules, and sample orders.
6. `test/qanoon-adapter.test.js` (508 lines):
   - 39 automated tests covering initialization, two-stage stock checks, 7-step pricing, 75/25 VAT split, TTAC divergence warnings, 24h idempotency cache, TTL expiry, payload conflict, leading zero preservation, and typed error handling.
7. `test/draft-store-concurrency.test.js` (301 lines):
   - 10 automated concurrency tests covering 50 parallel adds, 30 mixed operations, 20 parallel reverts, process restart persistence round-trip, cold-start nested directory creation, 0-byte recovery, corrupted JSON quarantine recovery, and temporary file cleanup.
8. `test/e2e/tier5-adversarial-backend.test.js` (1046 lines):
   - 17 adversarial stress tests covering 50 mixed operations under race conditions, 25 failing + 25 valid interleaved operations, 100 burst concurrent operations, deep quadruple revert ladders, 24h cache TTL expiration, payload tampering detection across 5 dimensions, in-flight locks, extreme volume pricing, and dual-protocol REST/MCP concurrency.

---

### 1.2 Verification Commands & Verbatim Test Results

#### Full Project Test Suite in Strict Mode
Command:
```bash
PANELPH_E2E_STRICT=1 node --test
```
Verbatim stdout/stderr summary:
```
✔ Critical form inputs presence (#name, #quantity, #unit, #note, #submit) (0.426074ms)
✔ Status, summary, and column containers presence (#status, #summary, #items, #ambiguities) (0.234477ms)
✔ Ambiguity resolution drawer and action buttons presence (0.231872ms)
✔ Event timeline container presence (#timeline) (0.146063ms)
✔ Host context theme synchronization hooks & dark mode CSS (0.368868ms)
✔ Suite 3: DOM Structure & Element Integrity (5.307661ms)
✔ Suite 4: Client JavaScript Behavioral Simulation in Headless VM (761.677029ms)
✔ QanoonAdapter — Initialization & Offline Mock Mode (8.829562ms)
✔ QanoonAdapter — Two-Stage Stock Verification (6.483004ms)
✔ QanoonAdapter — 7-Step Deterministic Pricing Engine (21.144025ms)
✔ QanoonAdapter — 24-Hour UniqueId Idempotency Cache (43.116013ms)
✔ QanoonAdapter — Leading-Zero String Preservation (4.099778ms)
✔ QanoonAdapter — Error Classification & Input Validation (2.910239ms)
✔ REST API — Operational Endpoints & CORS Preflight (596.444512ms)
✔ MCP Protocol — Expanded Tools on /mcp (171.273056ms)
✔ serves MCP initialization through the local endpoint (493.644594ms)
ℹ tests 211
ℹ suites 0
ℹ pass 211
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8599.764012
```
Exit Code: `0`

#### Component-Specific Test Runs

1. `test/qanoon-adapter.test.js`:
   - Command: `node --test test/qanoon-adapter.test.js`
   - Exit code: `0`
   - Result: `tests 39, pass 39, fail 0`
2. `test/draft-store-concurrency.test.js`:
   - Command: `node --test test/draft-store-concurrency.test.js`
   - Exit code: `0`
   - Result: `tests 10, pass 10, fail 0`
3. `test/e2e/tier5-adversarial-backend.test.js`:
   - Command: `node --test test/e2e/tier5-adversarial-backend.test.js`
   - Exit code: `0`
   - Result: `tests 17, pass 17, fail 0`
4. `test/catalog-resolver.test.js` & `test/draft-store.test.js`:
   - Command: `node --test test/catalog-resolver.test.js test/draft-store.test.js`
   - Exit code: `0`
   - Result: `tests 27, pass 27, fail 0`

---

## 2. Logic Chain

1. **Interface Conformance (PROJECT.md & ORIGINAL_REQUEST.md)**:
   - `src/adapters/qanoon-adapter.js` matches all four methods in PROJECT.md lines 47-56 (`checkStock`, `calculatePrice`, `createBatchOrder`, `searchGoods`).
   - `src/catalog-resolver.js` fulfills PROJECT.md lines 58-62, correctly handling string preservation of leading zeroes on generic and brand codes.
   - `src/draft-store.js` matches all draft management methods in PROJECT.md lines 63-72 (`addNeed`, `updateNeed`, `resolveNeed`, `revertEvent`, `getDraft`), along with status lifecycle transitions (`open` -> `needs_completion` -> `ready_for_review`).
   - Conclusion: 100% interface conformance.

2. **Qanoon Adapter Boundary & Deterministic Calculations**:
   - The 24-hour cache enforces idempotency based on `uniqueId` and SHA-256 payload fingerprints. An altered payload with an identical `uniqueId` cleanly throws `QanoonConflictError` (HTTP 409).
   - The two-stage stock check distinguishes between stage 1 advisory status and stage 2 batch verification discrepancies.
   - The 7-step pricing engine satisfies mathematical invariants: `vatAmount + tollAmount === totalTax` (75/25 split without penny drift), non-pharma goods are properly excluded from technical fees, and TTAC divergences strictly above 10,000 Rials emit authoritative warnings.
   - In offline test mode (`NODE_ENV=test` or `mockMode: true`), zero live network requests are made; fixtures provide full execution fidelity.
   - Conclusion: The adapter boundary is robust, accurate, and completely decoupled.

3. **Draft Store Event Sourcing, Concurrency & Persistence**:
   - `draft.events` is strictly append-only. Reverting an action appends a compensating `event_reverted` event. History is never truncated.
   - `DraftMutex` serializes concurrent operations per draft key. In stress tests with 50 simultaneous parallel writes and 100 burst operations, zero lost updates or race conditions occurred.
   - File persistence uses atomic temporary file writes with immediate rename, preventing partial writes.
   - Corrupted state files are automatically isolated into `.corrupt.<timestamp>` quarantine files, allowing the system to resume gracefully.
   - Conclusion: The event sourcing and persistence model is safe and production-ready.

4. **Adversarial & Integrity Review**:
   - Inspected source code for hardcoded test fixtures, bypassed tasks, dummy facades, or shortcuts: none exist. All calculations (pricing, hashing, projection, normalization, stock validation) are derived from real mathematical and business logic.
   - Verified that `PANELPH_E2E_STRICT=1 node --test` passes 100% of 211 tests with exit code 0.
   - Conclusion: Zero integrity violations.

---

## 3. Caveats

- **In-Memory Idempotency Cache Scale**: The 24h idempotency cache in `QanoonAdapter` is currently stored in-memory (`Map`). While appropriate for the single-desk PanelPH architecture and protected by TTL purging and `clearIdempotencyCache()`, a multi-process distributed cluster would require an external key-value store (e.g. Redis).
- **Scope Boundary**: This review focuses strictly on the backend layer, Qanoon adapter, catalog resolver, draft store, and backend adversarial tests. Frontend UI and browser interactions were evaluated in separate tracks.
- No other caveats.

---

## 4. Conclusion

- **Gate Verdict**: **APPROVE**
- All acceptance criteria for Milestone 5 Gate 5 (Backend & Qanoon Adapter verification) have been rigorously tested and verified.
- The codebase demonstrates high engineering standards: strict typed error handling, defensive string preservation, deterministic mathematical invariants, robust mutex concurrency serialization, and resilient append-only event sourcing.

---

## 5. Verification Method

To independently verify this evaluation, run the following commands in `/home/admin/PanelPH`:

```bash
# 1. Verify strict E2E test execution (211 tests passing)
PANELPH_E2E_STRICT=1 node --test

# 2. Verify Qanoon adapter unit tests
node --test test/qanoon-adapter.test.js

# 3. Verify Draft Store concurrency and persistence tests
node --test test/draft-store-concurrency.test.js

# 4. Verify Tier 5 backend adversarial tests
node --test test/e2e/tier5-adversarial-backend.test.js

# 5. Verify Catalog Resolver tests
node --test test/catalog-resolver.test.js
```

**Invalidation Conditions**:
- Any non-zero exit code from `PANELPH_E2E_STRICT=1 node --test`.
- Failure in any of the 39 adapter tests, 10 concurrency tests, or 17 adversarial backend tests.
- Evidence of data mutation in `draft.events` without compensating events.

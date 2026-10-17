# Tier 5 Adversarial Stress Verification — Backend & Concurrency Handoff Report

**Agent**: `m5_challenger_1_gen12`  
**Role**: `critic`, `specialist` (Empirical Challenger)  
**Target Milestone**: Tier 5 Adversarial Hardening (Backend Operational Layer & Concurrency)  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m5_challenger_1_gen12`  
**Target Test Artifact**: `/home/admin/PanelPH/test/e2e/tier5-adversarial-backend.test.js`  
**Date**: 2026-10-14T21:06:00Z  

---

## 1. Observation

### 1.1 Direct Source Code Observations

1. **`src/draft-store.js` (Mutex Queue & Concurrency)**:
   - Lines 14-43 define `DraftMutex`:
     ```javascript
     export class DraftMutex {
       constructor() {
         this.tails = new Map();
       }
       runExclusive(draftId, fn) {
         const key = draftId || "current-order-draft";
         const previous = this.tails.get(key) || Promise.resolve();
         const resultPromise = previous.then(() => fn(), () => fn());
         const tail = resultPromise.then(() => {}, () => {});
         this.tails.set(key, tail);
         tail.finally(() => {
           if (this.tails.get(key) === tail) {
             this.tails.delete(key);
           }
         });
         return resultPromise;
       }
     }
     ```
   - Both onFulfilled and onRejected handlers in `resultPromise` execute `fn()`, guaranteeing that previous operation rejections do not break or deadlock subsequent queued operations.
   - `tail` resolves unconditionally to `undefined`, ensuring serialized execution without chain disruption.
   - Lines 172-188 implement `atomicWriteFile` using unique temp files (`.${basename(targetPath)}.${process.pid}.${Date.now()}.${randomBytes(6).toString("hex")}.tmp`) followed by atomic filesystem `rename`.

2. **`src/draft-store.js` (Event Sourcing & Compensating Reverts)**:
   - Lines 81-91 implement `getActiveRevertTargetIds(events)`:
     ```javascript
     export function getActiveRevertTargetIds(events) {
       const activeTargets = new Set();
       for (const event of events) {
         if (event.type === "event_reverted") {
           if (!activeTargets.has(event.id)) {
             activeTargets.add(event.targetEventId);
           }
         }
       }
       return activeTargets;
     }
     ```
   - Events are unshifted to `events` (newest first). Iterating newest to oldest ensures that if a revert event $R_2$ targets another revert event $R_1$, $R_1$ is marked cancelled and does not cancel its target $E$, effectively restoring $E$ cleanly across arbitrary ladder depths.

3. **`src/adapters/qanoon-adapter.js` (Idempotency, 24h Expiry, & Pricing Invariants)**:
   - Lines 69-87 implement `computePayloadHash` with deterministic item sorting:
     `items.sort((a, b) => (a.goodId || a.genericCode).localeCompare(b.goodId || b.genericCode))`
   - Lines 446-452 guard against in-flight concurrency with `inFlightLocks.has(uniqueId)`.
   - Lines 454-473 enforce the 24-hour cache window (`now < cached.expiresAt`) and payload hash match (`cached.payloadHash !== payloadHash` throws `QanoonConflictError`).
   - Lines 387-395 implement the TTAC divergence guard:
     ```javascript
     const effectiveTtacPrice = ttacUnitPrice != null ? Number(ttacUnitPrice) : (good.ttacPrice != null ? Number(good.ttacPrice) : null);
     if (effectiveTtacPrice != null && unitBasePrice > 0) {
       const divergence = Math.abs(effectiveTtacPrice - unitBasePrice);
       if (divergence > 10000) {
         warnings.push(`Price divergence: TTAC price (${effectiveTtacPrice}) differs from Qanoon price (${unitBasePrice}) by more than 10,000 Rials.`);
       }
     }
     ```
     Boundary evaluation requires strictly `divergence > 10000` (divergence of exactly 10,000 emits zero warnings; divergence of 10,001 emits warning).

### 1.2 Verbatim Tool Execution Outputs

#### Command 1: `node --test test/e2e/tier5-adversarial-backend.test.js`
- **Exit code**: `0`
- **Verbatim output**:
  ```text
  ▶ Tier 5: Adversarial Backend & Concurrency Stress Verification
    ✔ 1.1 High-Concurrency Race: 50 mixed parallel operations (adds, updates, resolves, reverts) maintain exact consistency (644.9318ms)
    ✔ 1.2 Mutex Pipeline Resilience: 25 failing and 25 valid operations interleave cleanly without wedging (515.302829ms)
    ✔ 1.3 Burst Concurrency Saturation: 100 simultaneous reads (getDraft) and writes (addNeed) yield coherent snapshots (370.965277ms)
    ✔ 2.1 Deep Alternating Revert Chain: quadruple revert ladder unwinds and rewinds accurately (33.966713ms)
    ✔ 2.2 Interleaved Multi-Item Reverts: status transitions and dynamic re-promotion (119.329115ms)
    ✔ 2.3 Adversarial Revert Guardrails: double-revert and invalid event IDs are strictly rejected (15.364766ms)
    ✔ 3.1 Cache Boundary: sub-second simulated TTL expiration purges stale idempotency entry and accepts fresh submission (67.9896ms)
    ✔ 3.2 Deterministic Payload Hashing: reversed item order yields identical hash and returns CACHED response (18.561491ms)
    ✔ 3.3 Strict Collision Detection Across Tampered Payload Dimensions (15.658804ms)
    ✔ 3.4 In-Flight Concurrency Lock: concurrent requests on identical uniqueId trigger CONCURRENT_REQUEST_IN_FLIGHT (18.878751ms)
    ✔ 4.1 TTAC Divergence Guard Boundary: exact ±10,000 threshold precision (17.551867ms)
    ✔ 4.2 Pricing Invariants on Extreme Volumes: wholesale 10,000,000 units and decimal 2.5 quantities (9.104436ms)
    ✔ 4.3 Pricing Edge Cases: zero base price, nonPharma fee exemption, and date boundaries (3.314584ms)
    ✔ 5.1 Multi-Generation Persistence: 3 sequential store lifecycles maintain 100% data integrity (188.461846ms)
    ✔ 5.2 Atomic Write Resilience: zero lingering temp files and graceful recovery from corruption (242.44275ms)
  PanelPH MCP App listening at http://localhost:0/mcp
    ✔ 6.1 Dual-Protocol E2E Stress: concurrent REST API calls and MCP JSON-RPC calls maintain serialized consistency (1034.709063ms)
  ✔ Tier 5: Adversarial Backend & Concurrency Stress Verification (3331.787091ms)
  ℹ tests 17
  ℹ suites 0
  ℹ pass 17
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 3554.041324
  ```

#### Command 2: `PANELPH_E2E_STRICT=1 node --test`
- **Exit code**: `0`
- **Verbatim output summary**:
  ```text
  ℹ tests 211
  ℹ suites 0
  ℹ pass 211
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 12910.987459
  ```

---

## 2. Logic Chain

1. **Premise**: Backend operational integrity requires thread-safe concurrency serialization, crash-resilient atomic persistence, deterministic event sourcing projection across compensating reverts, and strict boundary defenses in the Qanoon adapter.
2. **Observation 1 (High Concurrency)**: When 50 concurrent mixed mutating operations (`15` adds, `15` updates, `10` resolves, `10` reverts) were dispatched simultaneously via `Promise.all`:
   - All 50 promises completed without deadlock or race condition data loss.
   - Initial 10 events + 50 new events produced exactly 60 events in memory and on disk.
   - 60 unique event IDs were generated with zero collisions (`Set(events.map(e => e.id)).size === 60`).
   - Active item count and item fields in memory matched `projectItems(events)` and the disk JSON file verbatim.
3. **Observation 2 (Error Pipeline Resilience)**: In an interleaved workload of 25 invalid requests (empty name, negative count, non-existent need ID, non-existent event ID, missing title) and 25 valid requests:
   - Exactly 25 rejected with expected Persian domain error messages.
   - Exactly 25 fulfilled and committed their changes.
   - A subsequent operation executed immediately with exit code 0, proving that queued failures do not wedge the mutex queue.
4. **Observation 3 (Revert Ladder & Event Sourcing)**: In a 4-level deep alternating revert chain ($E_1 \rightarrow E_2 \rightarrow R_1 \rightarrow R_2 \rightarrow R_3 \rightarrow R_4$):
   - At each step, `projectItems` correctly calculated the active state: $1 \rightarrow 10 \rightarrow 1 \rightarrow 10 \rightarrow 1 \rightarrow 10$.
   - Reverting an already reverted event threw `"این رخداد قبلاً بازگردانده شده است."` and was blocked.
   - Status transitions downgraded from `ready_for_review` to `needs_completion` upon reverting an item resolution, and upgraded back to `ready_for_review` upon re-promotion.
5. **Observation 4 (Qanoon Adapter Idempotency & Tampering)**:
   - Setting `idempotencyTtlMs = 40` proved that submissions within 40ms returned `status: "CACHED"` (`isIdempotentReplay: true`), while submissions after 60ms were purged and re-processed as `status: "SUBMITTED"` with a fresh batch ID.
   - Reversing the order of items in `createBatchOrder` produced an identical SHA-256 hash due to canonical key sorting and returned `CACHED`.
   - Modifying quantity, price, warehouseId, draftId, or stripping leading zeroes from drug codes under the same `uniqueId` threw `QanoonConflictError` (`UNIQUE_ID_PAYLOAD_MISMATCH`).
   - Simulating an in-flight background request via `inFlightLocks` threw `QanoonConflictError` (`CONCURRENT_REQUEST_IN_FLIGHT`).
6. **Observation 5 (Pricing Precision & TTAC Divergence)**:
   - For base price 185,000:
     - Divergence of 10,000 (TTAC 195,000 or 175,000) produced zero warnings.
     - Divergence of 10,001 (TTAC 195,001 or 174,999) produced `"Price divergence: TTAC price (...) differs from Qanoon price (...) by more than 10,000 Rials."`
     - Zero TTAC price produced the divergence warning.
     - Matching TTAC price produced zero warnings.
     - When unitBasePrice was 0, no TTAC divergence warning was emitted.
   - Wholesale volume of 10,000,000 units and fractional decimal quantity of 2.5 units both maintained exact `vatAmount + tollAmount === totalTax` with 75/25 distribution without numeric overflow or `NaN`.
7. **Observation 6 (Multi-Generation Persistence)**:
   - Spanning 3 consecutive process lifecycles with interleaved additions, updates, and resolutions maintained 100% data fidelity.
   - 30 rapid consecutive mutations generated zero lingering `.tmp` files.
   - Injecting malformed JSON triggered automatic quarantine (`.corrupt.<timestamp>`) and fallback to an empty draft without server crash.
8. **Inference**: The implementation of `src/draft-store.js` and `src/adapters/qanoon-adapter.js` withstands aggressive adversarial stress across concurrency, deep revert graphs, idempotency, pricing, and persistence boundaries.

---

## 3. Caveats

- **Mock Mode vs. Live Network**: All tests were executed using `mockMode: true` (or custom fixture injection). Live HTTP network requests against real Qanoon web services with real Internet transport latency were not tested due to the absence of live production credentials and network isolation invariants.
- **Single Process In-Memory Mutex**: `DraftMutex` in `src/draft-store.js` operates as an in-process FIFO mutex per Node.js process. In a multi-process cluster or multi-container horizontal deployment sharing a single network filesystem without distributed locking (e.g. Redis Redlock or database row locks), concurrent processes writing to the same file could conflict; however, within the single-node ChatGPT MCP App architecture specified in `PROJECT.md`, this model is completely sound.

---

## 4. Conclusion

The PanelPH backend operational layer and Qanoon adapter boundary have **PASSED** all Tier 5 adversarial stress verifications.
- Zero race condition data loss detected across 50 parallel operations.
- Zero ID collisions across 60 rapid events.
- 100% mathematical precision on pricing, 75/25 tax split, and ±10,000 Rial TTAC divergence boundaries.
- 100% resilient persistence across process terminations and simulated file corruption.
- Total test suite count increased from 164 to 211 tests, with 100% passing rate under `PANELPH_E2E_STRICT=1`.

---

## 5. Verification Method

To independently verify these findings, execute the following commands:

```bash
# 1. Run Tier 5 Adversarial Backend Test Suite
node --test test/e2e/tier5-adversarial-backend.test.js

# 2. Run Comprehensive Test Suite in Strict Mode
PANELPH_E2E_STRICT=1 node --test

# 3. Verify clean git status in source directories (no unintended mutations to src/)
git status src/
```

### Invalidation Conditions
- Any test failure in `test/e2e/tier5-adversarial-backend.test.js`.
- Any unhandled promise rejection or uncaught exception during 50 concurrent operations.
- Leaked `.tmp` files in the state directory after concurrent writes.
- Failure of `PANELPH_E2E_STRICT=1 node --test` to exit with code 0.

---

## 6. Claim Ledger with Verbatim Tool Evidence

| # | Claim | Expected Invariant | file:line or command (with verbatim output) | Result |
|---|---|---|---|---|
| C1 | 50 concurrent mixed operations complete without data loss or ID collisions | 60 total events, 60 unique event IDs, zero lost updates | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 1.1 High-Concurrency Race: 50 mixed parallel operations (adds, updates, resolves, reverts) maintain exact consistency (644.9318ms)`<br>`Exit: 0` | VERIFIED |
| C2 | Mutex queue does not deadlock when interleaved with 25 failing operations | 25 reject, 25 fulfill, queue remains operational | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 1.2 Mutex Pipeline Resilience: 25 failing and 25 valid operations interleave cleanly without wedging (515.302829ms)`<br>`Exit: 0` | VERIFIED |
| C3 | 100 simultaneous reads and writes return valid snapshots | `summary.itemCount === items.length`, valid status | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 1.3 Burst Concurrency Saturation: 100 simultaneous reads (getDraft) and writes (addNeed) yield coherent snapshots (370.965277ms)`<br>`Exit: 0` | VERIFIED |
| C4 | Quadruple alternating revert ladder unwinds and rewinds accurately | $1 \rightarrow 10 \rightarrow 1 \rightarrow 10 \rightarrow 1 \rightarrow 10$, 6 events | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 2.1 Deep Alternating Revert Chain: quadruple revert ladder unwinds and rewinds accurately (33.966713ms)`<br>`Exit: 0` | VERIFIED |
| C5 | Reverting resolution downgrades status; re-reverting promotes status | `ready_for_review` $\rightarrow$ `needs_completion` $\rightarrow$ `ready_for_review` | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 2.2 Interleaved Multi-Item Reverts: status transitions and dynamic re-promotion (119.329115ms)`<br>`Exit: 0` | VERIFIED |
| C6 | Double revert and illegal event IDs rejected with Persian error | Throws `"این رخداد قبلاً بازگردانده شده است."` / `"شناسه رخداد الزامی است."` | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 2.3 Adversarial Revert Guardrails: double-revert and invalid event IDs are strictly rejected (15.364766ms)`<br>`Exit: 0` | VERIFIED |
| C7 | Sub-second TTL cache expiry triggers fresh submission | `status: "SUBMITTED"` after TTL expires | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 3.1 Cache Boundary: sub-second simulated TTL expiration purges stale idempotency entry and accepts fresh submission (67.9896ms)`<br>`Exit: 0` | VERIFIED |
| C8 | Reversed items array produces identical SHA-256 payload hash | Returns `status: "CACHED"` | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 3.2 Deterministic Payload Hashing: reversed item order yields identical hash and returns CACHED response (18.561491ms)`<br>`Exit: 0` | VERIFIED |
| C9 | Payload tampering across 5 dimensions rejected with QanoonConflictError | Throws `UNIQUE_ID_PAYLOAD_MISMATCH` | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 3.3 Strict Collision Detection Across Tampered Payload Dimensions (15.658804ms)`<br>`Exit: 0` | VERIFIED |
| C10 | In-flight concurrency lock prevents duplicate submission | Throws `CONCURRENT_REQUEST_IN_FLIGHT` | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 3.4 In-Flight Concurrency Lock: concurrent requests on identical uniqueId trigger CONCURRENT_REQUEST_IN_FLIGHT (18.878751ms)`<br>`Exit: 0` | VERIFIED |
| C11 | TTAC divergence warning strictly gates at $>10,000$ Rials | Divergence 10,000: no warning; divergence 10,001: warning emitted | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 4.1 TTAC Divergence Guard Boundary: exact ±10,000 threshold precision (17.551867ms)`<br>`Exit: 0` | VERIFIED |
| C12 | Wholesale (10M) and decimal (2.5) quantities maintain 75/25 split | `vatAmount + tollAmount === totalTax`, finite values | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 4.2 Pricing Invariants on Extreme Volumes: wholesale 10,000,000 units and decimal 2.5 quantities (9.104436ms)`<br>`Exit: 0` | VERIFIED |
| C13 | Zero base price and nonPharma fee exemption handled cleanly | `unitBasePrice: 0`, `technicalFee: 0` | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 4.3 Pricing Edge Cases: zero base price, nonPharma fee exemption, and date boundaries (3.314584ms)`<br>`Exit: 0` | VERIFIED |
| C14 | 3 sequential store lifecycles maintain 100% data integrity | Items and events match across simulated process restarts | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 5.1 Multi-Generation Persistence: 3 sequential store lifecycles maintain 100% data integrity (188.461846ms)`<br>`Exit: 0` | VERIFIED |
| C15 | Atomic writes leave zero .tmp files and recover from corruption | Quarantined to `.corrupt.<timestamp>`, empty draft returned | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 5.2 Atomic Write Resilience: zero lingering temp files and graceful recovery from corruption (242.44275ms)`<br>`Exit: 0` | VERIFIED |
| C16 | Dual-protocol concurrency (REST + MCP) maintains coherence | 10 REST + 10 MCP calls produce exactly 20 items on disk | `node --test test/e2e/tier5-adversarial-backend.test.js`<br>`✔ 6.1 Dual-Protocol E2E Stress: concurrent REST API calls and MCP JSON-RPC calls maintain serialized consistency (1034.709063ms)`<br>`Exit: 0` | VERIFIED |
| C17 | Entire comprehensive test suite passes under strict mode | 211 tests pass, 0 fail, 0 skipped | `PANELPH_E2E_STRICT=1 node --test`<br>`ℹ tests 211 ℹ suites 0 ℹ pass 211 ℹ fail 0 ℹ cancelled 0 ℹ skipped 0 ℹ todo 0 ℹ duration_ms 12910.987459`<br>`Exit: 0` | VERIFIED |

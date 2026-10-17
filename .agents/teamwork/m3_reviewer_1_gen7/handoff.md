# Review & Adversarial Challenge Report — Gate 3 (Milestone 3)

**Reviewer**: M3 Reviewer 1 (Gen 7)  
**Roles**: Reviewer, Adversarial Critic  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m3_reviewer_1_gen7`  
**Date**: 2026-10-14T15:03:00Z  
**Verdict**: **APPROVE**  
**Overall Risk Assessment**: **LOW**

---

## 1. Observation

### 1.1 Integrity Violation Audit
A thorough inspection was conducted on `src/draft-store.js`, `src/server.js`, `test/draft-store-concurrency.test.js`, and `test/draft-store.test.js`:
- **Hardcoded test fixtures/results**: None found. No environment branch shortcuts (`process.env.NODE_ENV === 'test'`) or hardcoded Persian strings returning canned arrays.
- **Dummy/facade implementations**: None found. Implementation contains a genuine FIFO Promise queue (`DraftMutex`), atomic file persistence with temporary files and atomic rename (`atomicWriteFile`), syntax error handling with automatic quarantine (`.corrupt.${Date.now()}`), and a mathematical event projection engine (`projectItems` and `getActiveRevertTargetIds`).
- **Shortcuts/bypasses**: None found. Concurrency tests execute 50 parallel asynchronous calls, mixed operation bursts, and rapid write/read interleaved calls against real filesystem I/O.
- **Self-certifying work**: All test outcomes reported by the worker were independently reproduced and verified by this reviewer from fresh execution.

### 1.2 Code Inspection Observations
1. **`src/draft-store.js`**:
   - Lines 14–43: `DraftMutex` class manages `tails = new Map()` mapping each `draftId` key to a Promise tail. Tasks chain via `previous.then(() => fn(), () => fn())`, ensuring failure of task $N$ does not block task $N+1$. Pruning is performed in `tail.finally` when `this.tails.get(key) === tail`.
   - Lines 77–91: `getActiveRevertTargetIds(events)` evaluates events in reverse chronological order (newest to oldest). If an `event_reverted` event is encountered, its `targetEventId` is recorded into `activeTargets` unless that revert is itself already targeted by a newer revert.
   - Lines 96–107: `getActiveEventIds(events)` filters out any action events present in `activeTargets` and any `event_reverted` events.
   - Lines 112–167: `projectItems(events)` reverses the event list (`events.slice().reverse()`) to chronological order, replaying active events to deterministically reconstruct `items`. It handles field-level delta diffs (`changes: { [field]: { from, to } }`) for `need_updated`, and supports backward-compatible `before`/`after` diffing.
   - Lines 172–188: `atomicWriteFile(targetPath, data)` writes to a unique temporary file (`.${basename}.${pid}.${Date.now()}.${random}.tmp`) in `dirname(targetPath)` followed by `rename`. In case of error, `unlink` removes the temporary file.
   - Lines 194–199 & 220–223: Monotonic counter `idCounter` combines an incrementing integer with `Date.now()`. On startup in `load()`, `idCounter` is initialized to at least `(events.length + items.length)` from disk.
   - Lines 207–245: `load()` safely catches missing files (`ENOENT`), empty files (`!raw.trim()`), and JSON `SyntaxError` (which renames the corrupt file to `${statePath}.corrupt.${Date.now()}` and starts a fresh draft).
   - Lines 274–450: Mutating operations (`addNeed`, `updateNeed`, `resolveNeed`, `revertEvent`) clone the loaded draft (`candidate = clone(draft)`), record events, project items, atomically persist to disk, and only update `loadedDraft = candidate` upon successful persistence.
   - Parameter aliasing:
     - `addNeed`: accepts `name` or `rawText`.
     - `updateNeed`: accepts `id` or `needId`; accepts top-level fields (`name`, `rawText`, `quantity`, `unit`, `note`) or nested `updates` object.
     - `resolveNeed`: accepts `id` or `needId`; accepts `reference` or `catalogReference`.
     - `revertEvent`: accepts string `eventId` or `{ eventId, draftId }`.

2. **`src/server.js`**:
   - Lines 19–21: `wrapWithMutex(store)` returns `store` directly because `createOrderDraftStore` is internally synchronized per `draftId`.
   - Lines 660–728: REST handlers for `/api/draft/needs/:needId/resolve` and `/api/draft/revert` translate store exceptions containing `"پیدا نشد"` to 404 `NOT_FOUND` and other errors to 400 `VALIDATION_ERROR` or `REVERT_ERROR`.

3. **`test/draft-store-concurrency.test.js`**:
   - Implements 9 comprehensive test scenarios verifying parallel additions, mixed concurrent operations, high-concurrency parallel reverts, process restart persistence, nested directory auto-creation, recovery from 0-byte state files, recovery from corrupt JSON with quarantine, concurrent reads during concurrent writes, and atomic temporary file cleanup.

4. **`test/draft-store.test.js`**:
   - Implements 7 unit tests covering free-text capture, catalog resolution, compensating event append, out-of-order field revert preservation, recursive un-reverting (revert of revert), `targetEventId` metadata tracking, and rejection of duplicate reverts.

### 1.3 Verbatim Execution Results

#### Test Suite 1: `node --test test/draft-store-concurrency.test.js`
- Command: `node --test test/draft-store-concurrency.test.js`
- Exit Code: `0`
- Timestamp: 2026-10-14T14:56:56Z
- Verbatim Output:
```
▶ DraftStore — Concurrency & Resilient Persistence Suite
  ✔ 1. High-concurrency parallel addNeed (50 concurrent calls) (385.277104ms)
  ✔ 2. Mixed concurrent operations (adds, updates, resolves) maintain zero lost updates (243.581659ms)
  ✔ 3. High-concurrency parallel reverts preserve audit trail and exact count (228.522403ms)
  ✔ 4. Persistence round-trip across simulated process restart (30.495235ms)
  ✔ 5. Resilient cold start: auto-creates nested non-existent directory (21.331247ms)
  ✔ 6. Resilient recovery from unreadable/empty (0-byte) file (15.158962ms)
  ✔ 7. Resilient recovery from corrupted/malformed JSON with quarantine (12.207957ms)
  ✔ 8. Interleaved concurrent reads (getDraft) during concurrent writes (193.954736ms)
  ✔ 9. Atomic write temporary file isolation and cleanup (141.435338ms)
✔ DraftStore — Concurrency & Resilient Persistence Suite (1295.677769ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1480.462987
```

#### Test Suite 2: `node --test test/draft-store.test.js`
- Command: `node --test test/draft-store.test.js`
- Exit Code: `0`
- Timestamp: 2026-10-14T14:57:00Z
- Verbatim Output:
```
✔ stores a free-text need and preserves it after reopening (42.808927ms)
✔ resolves a need only when the user supplies a concrete reference (26.606356ms)
✔ revert records a new event instead of erasing history (21.849494ms)
✔ out-of-order field revert: reverts targeted update without clobbering other edits (62.403939ms)
✔ revert of revert (un-revert): reverting an event_reverted event restores original item state (38.235821ms)
✔ targetEventId presence: compensating event records targetEventId (36.817769ms)
✔ rejection of duplicate reverts: attempting to revert an already-reverted event throws error (28.032692ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 520.517798
```

#### Test Suite 3: Full Project Test Suite `PANELPH_E2E_STRICT=1 node --test`
- Command: `PANELPH_E2E_STRICT=1 node --test`
- Exit Code: `0`
- Timestamp: 2026-10-14T14:57:09Z
- Summary: 141 tests pass across 12 test suites, 0 failed, 0 cancelled, 0 skipped.

#### Syntax Verification: `node --check`
- Command: `node --check src/draft-store.js src/server.js test/draft-store.test.js test/draft-store-concurrency.test.js`
- Exit Code: `0` (clean, 0 warnings/errors)

---

## 2. Logic Chain

1. **Compliance with F12 (Strict Event Sourcing & Compensating Events)**:
   - *Requirement*: Append-only event history with `event_reverted` compensation without mutating past events (`PROJECT.md` line 25, `ORIGINAL_REQUEST.md § R4`).
   - *Evidence*: In `src/draft-store.js`, `revertEvent` prepends a new event of type `event_reverted` (`revertRecord = { id: nextId("event"), type: "event_reverted", targetEventId: sourceEvent.id, itemId: sourceEvent.itemId, before, after, occurredAt: now() }`). No past events are removed or altered.
   - *Evaluation*: Verified in unit test 3 (`draft-store.test.js:29-36`) and E2E test T3_03 (`tier3-cross-feature.test.js:130-170`).

2. **Compliance with F13 (Concurrency Lock & Race Condition Protection)**:
   - *Requirement*: Mutex queue preventing corrupted writes during simultaneous edits or reverts (`PROJECT.md` line 26).
   - *Evidence*: `createOrderDraftStore` routes all mutating methods (`addNeed`, `updateNeed`, `resolveNeed`, `revertEvent`) as well as `getDraft` through `mutex.runExclusive(resolveDraftKey(draftId), ...)`. In `DraftMutex`, asynchronous operations are chained on a promise tail.
   - *Evaluation*: Verified under 50 concurrent additions (test 1), 30 mixed concurrent operations (test 2), 20 parallel reverts (test 3), and 60 interleaved reads/writes (test 8), with 0 lost updates, zero ID collisions, and exact event log counts.

3. **Compliance with F14 (Resilient Persistence Across Restarts)**:
   - *Requirement*: Atomic file write (temp file + rename) for `state/order-draft.json` resilient across restarts (`PROJECT.md` line 27).
   - *Evidence*: `atomicWriteFile` creates a PID-and-timestamp-keyed temporary file in the destination directory and atomically renames it. Interrupted writes or crash simulations leave the previous state file intact. Recovery handles 0-byte files and corrupt JSON without throwing unhandled exceptions.
   - *Evaluation*: Verified in concurrency tests 4, 5, 6, 7, and 9.

4. **Interface Contract Conformance**:
   - `addNeed({ draftId, rawText, quantity, unit, note })`: conforms, returns `Promise<Draft>`.
   - `updateNeed({ draftId, needId, updates })`: conforms, returns `Promise<Draft>`.
   - `resolveNeed({ draftId, needId, catalogReference })`: conforms, returns `Promise<Draft>`.
   - `revertEvent({ draftId, eventId })`: conforms, returns `Promise<Draft>`.
   - `getDraft({ draftId })`: conforms, returns `Promise<Draft>`.
   - Concurrency contract: "All mutating methods pass through an internal mutex queue ensuring serial execution per draftId." Conforms fully.

---

## 3. Quality Review

### Verdict
**APPROVE**

### Findings

#### [Minor] Finding 1: `exportBatch` architectural delegation
- **What**: `PROJECT.md § Interface Contracts § Draft Store` lists `exportBatch({ draftId, adapter })` under Draft Store methods, but the implementation resides in `src/server.js` (`runExportBatch` exported as `exportBatch`).
- **Where**: `PROJECT.md:69`, `src/server.js:289`
- **Why**: `runExportBatch` orchestrates multiple system boundaries (catalog resolver, Qanoon adapter, stock checks, pricing engine, draft store). Housing it in `src/server.js` avoids circular dependencies between `src/draft-store.js` and `src/adapters/qanoon-adapter.js`.
- **Suggestion**: In a subsequent refactor or documentation alignment, either add an optional convenience forwarder on `store.exportBatch` or update `PROJECT.md` to clarify that `exportBatch` is an operational orchestration service in `src/server.js`.

#### [Minor] Finding 2: `draftId` keying in single-state store
- **What**: `resolveDraftKey(draftId)` returns `draftId || loadedDraft?.id || "current-order-draft"`.
- **Where**: `src/draft-store.js:261-263`
- **Why**: Because the store instance persists to a single configured `statePath`, callers passing different `draftId` strings would acquire different mutex keys while targeting the same physical file. In PanelPH all callers use `"current-order-draft"`.
- **Suggestion**: For multi-tenant or multi-file setups, the mutex key should incorporate `statePath`.

### Verified Claims
- `DraftMutex` serializes concurrent tasks in FIFO order $\rightarrow$ Verified via concurrency tests 1, 2, 3, 8 and reviewer stress test $\rightarrow$ **PASS**
- Monotonic IDs never collide even in the same millisecond $\rightarrow$ Verified across 100 concurrent operations in same tick $\rightarrow$ **PASS**
- Corrupt JSON does not crash the store and quarantines damaged data $\rightarrow$ Verified via test 7 (`draft-store-concurrency.test.js`) $\rightarrow$ **PASS**
- Out-of-order field updates can be reverted without clobbering other fields $\rightarrow$ Verified via unit test 4 (`draft-store.test.js`) $\rightarrow$ **PASS**
- Revert of revert (un-revert) reactivates original event $\rightarrow$ Verified via unit test 5 and 4-depth stress test $\rightarrow$ **PASS**
- 100% test pass under strict mode $\rightarrow$ Verified via `PANELPH_E2E_STRICT=1 node --test` (141/141) $\rightarrow$ **PASS**

### Coverage Gaps
- None. Unit, integration, concurrency, and E2E suites comprehensively exercise all store methods and edge conditions.

---

## 4. Adversarial Review

### Challenge Summary
- **Overall Risk Assessment**: **LOW**

### Challenges & Stress Test Results

#### Challenge 1: Multi-Level Recursive Un-Reverting (Depth = 4)
- **Assumption Challenged**: Can `getActiveRevertTargetIds` correctly compute active states when an event is reverted, un-reverted, reverted again, and un-reverted again?
- **Attack Scenario**: 
  1. Add Need $A$.
  2. Revert $1$ (reverts Add) $\rightarrow$ item deleted ($0$ items).
  3. Revert $2$ (reverts Revert $1$) $\rightarrow$ item restored ($1$ item).
  4. Revert $3$ (reverts Revert $2$) $\rightarrow$ item deleted ($0$ items).
  5. Revert $4$ (reverts Revert $3$) $\rightarrow$ item restored ($1$ item).
- **Execution**: Run via standalone Node stress script.
- **Result**: **PASS**. Alternating boolean cancellation correctly evaluates odd vs even revert depth without stack overflow or corrupted projection.

#### Challenge 2: 100 Concurrent Updates on the Same Item
- **Assumption Challenged**: Does high contention on a single item cause race conditions, lost deltas, or event counter divergence?
- **Attack Scenario**: Pre-create 1 item, then simultaneously fire 100 parallel `updateNeed` calls with distinct quantities and notes via `Promise.all`.
- **Execution**: Run via standalone Node stress script.
- **Result**: **PASS**. Exactly 1 item maintained in memory and on disk; exactly 101 events recorded (1 add + 100 updates); 0 lost updates; 0 unhandled rejections.

#### Challenge 3: Mutex Resilience on Task Failure
- **Assumption Challenged**: If an operation in the mutex queue throws an exception, does the queue freeze or stall subsequent pending tasks?
- **Attack Scenario**: Enqueue Task 1 (deliberately throws `Error`), followed immediately by Task 2 and Task 3.
- **Execution**: Run via standalone Node stress script.
- **Result**: **PASS**. Task 1 rejects cleanly to its caller; Task 2 and Task 3 execute in order and resolve successfully.

#### Challenge 4: Transactional Rollback (Candidate Clone Pattern) on I/O Failure
- **Assumption Challenged**: If disk persistence fails (e.g., `EACCES` permission denied), does the in-memory store retain a "phantom" uncommitted item?
- **Attack Scenario**: Add 1 item successfully. Make directory read-only (`chmod 0o555`). Attempt `addNeed`, which fails with `EACCES`. Restore permissions. Verify `getDraft()`.
- **Execution**: Run via standalone Node stress script.
- **Result**: **PASS**. In-memory draft retained only 1 item and 1 event. No partial or dirty state leaked into memory.

### Unchallenged Areas
- OS-level multi-process file locking (`flock`): Unchallenged because PanelPH runs as a single Node.js process operational backend according to architectural guardrails.

---

## 5. Caveats

1. **Single-Process Scope**:
   `DraftMutex` guarantees serial execution across all concurrent asynchronous calls within the single Node.js process. It does not provide inter-process distributed locking if multiple disparate OS processes were concurrently pointed at the same JSON file.
2. **Quarantine Directory Maintenance**:
   The automated quarantine feature moves damaged JSON to `${statePath}.corrupt.${Date.now()}`. While this guarantees high availability, operational tooling should monitor `state/` for quarantined files to alert administrators of disk corruption.

---

## 6. Conclusion

Milestone 3 (F12, F13, F14) meets all requirements, passes all acceptance criteria, exhibits clean architecture with zero integrity violations, and withstands rigorous adversarial stress-testing.

- **F12 (Strict Event Sourcing & Compensating Events)**: **VERIFIED & SATISFIED**
- **F13 (Concurrency Lock & Race Condition Protection)**: **VERIFIED & SATISFIED**
- **F14 (Resilient Persistence Across Restarts)**: **VERIFIED & SATISFIED**

**Final Gate 3 Verdict**: **APPROVE**

---

## 7. Verification Method

To independently verify this report:

1. **Run Concurrency Test Suite**:
   ```bash
   node --test test/draft-store-concurrency.test.js
   ```
   *Expected*: 10 pass, 0 fail, exit code 0.

2. **Run Draft Store Unit Tests**:
   ```bash
   node --test test/draft-store.test.js
   ```
   *Expected*: 7 pass, 0 fail, exit code 0.

3. **Run Full Project Test Suite**:
   ```bash
   PANELPH_E2E_STRICT=1 node --test
   ```
   *Expected*: 141 pass, 0 fail, exit code 0.

4. **Verify Syntax**:
   ```bash
   node --check src/draft-store.js src/server.js test/draft-store.test.js test/draft-store-concurrency.test.js
   ```
   *Expected*: Exit code 0 with no errors.

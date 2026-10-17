## 2026-10-14T14:43:18Z

You are M3 Implementation Worker (Gen 7) for the PanelPH project.
Your assigned working directory is: /home/admin/PanelPH/.agents/teamwork/m3_worker_gen7
The project root is: /home/admin/PanelPH
The authoritative user request is at: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
The project scope is at: /home/admin/PanelPH/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Detailed Explorer handoffs are prepared and verified for you:
- Mutex & Candidate Rollback: `/home/admin/PanelPH/.agents/teamwork/m3_explorer_1_gen7/handoff.md`
- Event Sourcing & Pure Projection Engine: `/home/admin/PanelPH/.agents/teamwork/m3_explorer_2_gen7/handoff.md`
- Atomic Persistence & 9-Test Concurrency Suite: `/home/admin/PanelPH/.agents/teamwork/m3_explorer_3_gen7/handoff.md`

Your Scope of Work:
1. File Write Ownership:
   - You exclusively own: `src/draft-store.js`, `test/draft-store-concurrency.test.js`
   - You are authorized to update: `src/server.js` (pass-through for `wrapWithMutex`), `test/draft-store.test.js` (adding unit tests for compensating reverts)
   - Do NOT edit other source files without need.

2. Implement in `src/draft-store.js`:
   - Internal `DraftMutex` per-`draftId` serialization queue with auto-pruning.
   - Candidate Clone Pattern: operations mutate a deep clone `candidate = clone(draft)` and only commit to `loadedDraft = candidate` once atomic persistence succeeds. Persistence failure leaves memory intact.
   - Monotonic ID counter (`idCounter++`) preventing microsecond collisions.
   - Strict append-only event sourcing with `targetEventId` recorded on `event_reverted`.
   - Field-level `changes: { [field]: { from, to } }` recorded on `need_updated`.
   - Pure deterministic projection engine (`getActiveEventIds` and `projectItems`) supporting multi-level revert chains, un-reverting (reverting an `event_reverted` event restores original item), and out-of-order reverts without clobbering other edits.
   - Parameter aliases (`rawText` / `name`, `needId` / `id`, `catalogReference` / `reference`, `updates`) to satisfy all callers.
   - Resilient `atomicWriteFile`: write to `.tmp` file in `dirname(statePath)` + `rename` + failure cleanup.
   - Resilient `load()`: handle missing directory, 0-byte/empty files (`!raw.trim()`), and quarantine corrupted JSON (`.corrupt.<timestamp>`) without crashing server boot.

3. Update `src/server.js`:
   - Ensure `wrapWithMutex(store)` returns `store` seamlessly since `store` is now internally synchronized.

4. Create `test/draft-store-concurrency.test.js`:
   - Implement all 9 test scenarios specified in Explorer 3's handoff (50-way concurrent `addNeed`, mixed concurrent adds/updates/resolves, concurrent reverts, simulated process restart round-trip, cold start directory creation, 0-byte recovery, corrupt JSON recovery with quarantine, interleaved reads/writes, temp file isolation).

5. Update `test/draft-store.test.js`:
   - Add unit tests verifying out-of-order field revert, revert of revert (un-revert), `targetEventId` presence, and rejection of duplicate reverts.

6. Verification:
   - Run `node --test test/draft-store-concurrency.test.js` (must pass 9/9, exit 0).
   - Run `node --test test/draft-store.test.js` (must pass all unit tests, exit 0).
   - Run `PANELPH_E2E_STRICT=1 node --test` (must pass 100% across all suites with 0 skips and 0 failures, exit code 0).

7. Output:
   - Write a complete `handoff.md` in `/home/admin/PanelPH/.agents/teamwork/m3_worker_gen7/handoff.md` including exact diffs, test outputs, and verification commands.
   - Send a completion message to your parent orchestrator.

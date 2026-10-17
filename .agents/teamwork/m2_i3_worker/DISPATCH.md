# Task Assignment: Milestone 2 Iteration 3 Worker (Remediation)

## Working Directory
`/home/admin/PanelPH/.agents/teamwork/m2_i3_worker`

## Authoritative User Request
`/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`

## Scope Document
`/home/admin/PanelPH/PROJECT.md`

## Patch Source
`/home/admin/PanelPH/.agents/teamwork/m2_i3_explorer_3/proposed_remediation.patch`

## Task Description
Apply the validated unified patch at `/home/admin/PanelPH/.agents/teamwork/m2_i3_explorer_3/proposed_remediation.patch`:
- `patch -p1 < /home/admin/PanelPH/.agents/teamwork/m2_i3_explorer_3/proposed_remediation.patch`
This patch resolves all issues raised in Gate 2 Iteration 2:
1. `src/server.js`: Global error boundary on `http.createServer` and strict type guards on `POST /api/draft/needs`, `PATCH /api/draft/needs/:id`, `POST /api/draft/needs/:id/resolve`, and `POST /api/draft/revert`.
2. `src/catalog-resolver.js`: Upfront unicode alphanumeric check (eliminates punctuation query collapse), generic token rejection, standalone dosage form guards, pure dosage detection, and primary code tie-breaking.
3. Expanded tests in `test/catalog-resolver.test.js` (CR_16-CR_20) and `test/server-rest.test.js`.

After applying:
1. Verify with `git status` that only `src/catalog-resolver.js`, `src/server.js`, `test/catalog-resolver.test.js`, and `test/server-rest.test.js` are touched. Remove any untracked `.orig` files if generated.
2. Run `npm test` and verify 100% pass (127/127 tests pass, 0 failures, 0 skips).
3. Run `node /tmp/m2_i2_adversarial_suite.mjs` and verify 28/28 scenarios pass.
4. Run `node /tmp/adversarial_challenger_2.mjs` and verify 95/95 assertions pass.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Deliverables
Write `handoff.md` and `progress.md` in `/home/admin/PanelPH/.agents/teamwork/m2_i3_worker/` and report test results to the orchestrator.

## 2026-10-14T13:54:35Z
[Message] timestamp=2026-10-14T13:54:35Z sender=ee57eff4-94e8-4a01-b031-0d2a45354361 priority=MESSAGE_PRIORITY_HIGH content=You are Milestone 2 Iteration 3 Worker for PanelPH.
Working directory: /home/admin/PanelPH/.agents/teamwork/m2_i3_worker
Authoritative user request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Scope document: /home/admin/PanelPH/PROJECT.md
Read DISPATCH.md at /home/admin/PanelPH/.agents/teamwork/m2_i3_worker/DISPATCH.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task:
1. Apply the unified patch prepared and verified by m2_i3_explorer_3:
   `patch -p1 < /home/admin/PanelPH/.agents/teamwork/m2_i3_explorer_3/proposed_remediation.patch`
2. Remove any `.orig` files created by patch.
3. Verify test suites:
   - `npm test` (verify 127/127 tests pass, 0 skips, 0 failures)
   - `node /tmp/m2_i2_adversarial_suite.mjs` (verify 28/28 pass)
   - `node /tmp/adversarial_challenger_2.mjs` (verify 95/95 pass)
4. Deliver your handoff report to `/home/admin/PanelPH/.agents/teamwork/m2_i3_worker/handoff.md` and message the orchestrator when completed.

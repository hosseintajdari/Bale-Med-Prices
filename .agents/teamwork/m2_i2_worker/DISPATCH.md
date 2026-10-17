# Task Assignment: Milestone 2 Iteration 2 Worker (Remediation)

## Working Directory
`/home/admin/PanelPH/.agents/teamwork/m2_i2_worker`

## Authoritative User Request
`/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`

## Scope Document
`/home/admin/PanelPH/PROJECT.md`

## Task Description
Apply the exact validated patch prepared by m2_i2_explorer_2:
`/home/admin/PanelPH/.agents/teamwork/m2_i2_explorer_2/proposed_catalog_resolver.patch`
This patch addresses all Challenger 2 findings:
1. Alef normalization variants across Arabic/Persian forms ([آأإٱ] -> ا, [يى] -> ی)
2. Standalone generic dosage form alias false positives (removing generic dosage forms like "ویال", "شربت", "کرم" from single alias matches)
3. Preserving leading zeros and exact scoring
4. Adding tests CR_11 to CR_15 in `test/catalog-resolver.test.js` and updating `fixtures/qanoon-mock-data.json`.

After applying, run `npm test` (or `node --test`) to verify that all test suites pass with 100% success (0 skips, 0 failures).

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Deliverables
Write `handoff.md` and `progress.md` in `/home/admin/PanelPH/.agents/teamwork/m2_i2_worker/`.
Report test output and git diff summary back to orchestrator.

## 2026-10-14T13:18:46Z
You are the Milestone 2 Iteration 2 Worker for the PanelPH project.

Your assigned working directory is: /home/admin/PanelPH/.agents/teamwork/m2_i2_worker
You must read your task assignment at: /home/admin/PanelPH/.agents/teamwork/m2_i2_worker/DISPATCH.md
The authoritative user request is at: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
The scope document is at: /home/admin/PanelPH/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task:
1. Apply the exact validated patch prepared by m2_i2_explorer_2:
   /home/admin/PanelPH/.agents/teamwork/m2_i2_explorer_2/proposed_catalog_resolver.patch
   (using `git apply /home/admin/PanelPH/.agents/teamwork/m2_i2_explorer_2/proposed_catalog_resolver.patch`)
2. Verify affected files: `src/catalog-resolver.js`, `fixtures/qanoon-mock-data.json`, and `test/catalog-resolver.test.js`.
3. Run `npm test` (or `node --test`) to confirm 100% pass across all tests with 0 skips and 0 failures.
4. Record your progress in `/home/admin/PanelPH/.agents/teamwork/m2_i2_worker/progress.md`.
5. Write your complete handoff report in `/home/admin/PanelPH/.agents/teamwork/m2_i2_worker/handoff.md` with:
   - Summary of changes applied
   - Verbatim test command and stdout/stderr output confirming all tests pass
   - Verification of file layout and integrity
6. Send a message to the orchestrator when completed.


# Dispatch — Gate 4 Forensic Auditor (Gen 9)

**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m4_auditor_gen9`
**Role**: `teamwork_preview_auditor`
**Parent Orchestrator ID**: `57fbf1bd-3ef6-46f1-939c-ad68febf12f7`
**Target Milestone**: Milestone 4 (Pharmacist Frontend & Apps SDK in `public/order-desk.html`)

## Instructions
1. Read `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md` (mandatory).
2. Read `/home/admin/PanelPH/PROJECT.md` and `/home/admin/PanelPH/.agents/teamwork/m4_worker_gen8/handoff.md`.
3. Perform a rigorous forensic integrity audit across all Milestone 4 artifacts:
   - Check `public/order-desk.html`: verify genuine DOM structures, authentic event handling, real debouncing, genuine state management, and absence of hardcoded dummy outputs or mock bypasses.
   - Check `public/order-desk.html.bak`: confirm pre-modification backup exists and is authentic.
   - Check `test/frontend-order-desk.test.js`: verify genuine assertions, authentic VM execution, no tautological tests (`assert(true)`), no test skipping, full coverage of all 4 suites.
   - Check git status and diff integrity: ensure modifications are confined to M4 scope and no unauthorized regressions were introduced.
   - Execute verification commands directly:
     * `node --test test/frontend-order-desk.test.js`
     * `PANELPH_E2E_STRICT=1 node --test`
4. Formulate explicit audit verdict: `CLEAN` or `INTEGRITY VIOLATION`.
5. Write your complete forensic audit report to `/home/admin/PanelPH/.agents/teamwork/m4_auditor_gen9/handoff.md`.
6. Send completion message back to parent orchestrator.

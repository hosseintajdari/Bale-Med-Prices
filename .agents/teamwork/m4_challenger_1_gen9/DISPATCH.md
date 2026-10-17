# Dispatch — Gate 4 Challenger 1 (Gen 9)

**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m4_challenger_1_gen9`
**Role**: `teamwork_preview_challenger`
**Parent Orchestrator ID**: `57fbf1bd-3ef6-46f1-939c-ad68febf12f7`
**Target Milestone**: Milestone 4 (Pharmacist Frontend & Apps SDK in `public/order-desk.html`)

## Instructions
1. Read `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md` (mandatory).
2. Read `/home/admin/PanelPH/PROJECT.md` and `/home/admin/PanelPH/.agents/teamwork/m4_worker_gen8/handoff.md`.
3. Empirically verify frontend robustness, edge cases, and adversarial scenarios:
   - Free-text input validation (extreme length, Persian half-spaces, HTML entity injection, rapid multiple submits).
   - Drug code string preservation (zero stripping attacks on genericCode / brandCode like "00001", "08234").
   - Ambiguity drawer safety gate (confirm resolution disabled without explicit selection).
   - Debounce timing and error rendering on simulated network drops.
4. Execute test suites and write any edge-case verification scripts if needed:
   - `node --test test/frontend-order-desk.test.js`
   - `PANELPH_E2E_STRICT=1 node --test`
5. Write handoff report to `/home/admin/PanelPH/.agents/teamwork/m4_challenger_1_gen9/handoff.md` with explicit verdict: `APPROVE` or `REJECT`.
6. Send completion message back to parent orchestrator.

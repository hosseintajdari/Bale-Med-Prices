# Dispatch — Gate 4 Challenger 2 (Gen 9)

**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m4_challenger_2_gen9`
**Role**: `teamwork_preview_challenger`
**Parent Orchestrator ID**: `57fbf1bd-3ef6-46f1-939c-ad68febf12f7`
**Target Milestone**: Milestone 4 (Pharmacist Frontend & Apps SDK in `public/order-desk.html`)

## Instructions
1. Read `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md` (mandatory).
2. Read `/home/admin/PanelPH/PROJECT.md` and `/home/admin/PanelPH/.agents/teamwork/m4_worker_gen8/handoff.md`.
3. Empirically verify transport, lifecycle, and compensating event reversibility:
   - Apps SDK postMessage handshake (`ui/initialize`, `ui/notifications/initialized`).
   - Standalone REST fallback operation when embedded Apps SDK is absent.
   - Event timeline revert action: verify that reverting an event creates a compensating event rather than truncating history.
   - Verify HTTP static delivery (`/order-desk.html`) content-type and payload integrity.
4. Execute test suites:
   - `node --test test/frontend-order-desk.test.js`
   - `PANELPH_E2E_STRICT=1 node --test`
5. Write handoff report to `/home/admin/PanelPH/.agents/teamwork/m4_challenger_2_gen9/handoff.md` with explicit verdict: `APPROVE` or `REJECT`.
6. Send completion message back to parent orchestrator.

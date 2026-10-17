# Dispatch — Gate 4 Reviewer 2 (Gen 9)

**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m4_reviewer_2_gen9`
**Role**: `teamwork_preview_reviewer`
**Parent Orchestrator ID**: `57fbf1bd-3ef6-46f1-939c-ad68febf12f7`
**Target Milestone**: Milestone 4 (Pharmacist Frontend & Apps SDK in `public/order-desk.html`)

## Instructions
1. Read `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md` (mandatory).
2. Read `/home/admin/PanelPH/PROJECT.md`, `/home/admin/PanelPH/TEST_READY.md`, and `/home/admin/PanelPH/.agents/teamwork/m4_worker_gen8/handoff.md`.
3. Inspect `public/order-desk.html`, `public/order-desk.html.bak`, and `test/frontend-order-desk.test.js`.
4. Review from architectural, integration, and security perspective:
   - Apps SDK resource schema (`ui://panelph/order-desk.html`, `text/html;profile=mcp-app`).
   - REST fallback API integration and error handling.
   - Code cleanliness, lack of external CDN dependencies, CSP compliance.
   - Persian typography and RTL layout conformance (`lang="fa"`, `dir="rtl"`).
   - Event reversibility and compensating action flow.
5. Independently execute:
   - `node --test test/frontend-order-desk.test.js`
   - `PANELPH_E2E_STRICT=1 node --test`
6. Write your comprehensive evaluation to `/home/admin/PanelPH/.agents/teamwork/m4_reviewer_2_gen9/handoff.md` concluding with explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
7. Send completion message back to parent orchestrator.

# Dispatch — Gate 4 Reviewer 1 (Gen 9)

**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m4_reviewer_1_gen9`
**Role**: `teamwork_preview_reviewer`
**Parent Orchestrator ID**: `57fbf1bd-3ef6-46f1-939c-ad68febf12f7`
**Target Milestone**: Milestone 4 (Pharmacist Frontend & Apps SDK in `public/order-desk.html`)

## Instructions
1. Read `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md` (mandatory).
2. Read `/home/admin/PanelPH/PROJECT.md`, `/home/admin/PanelPH/TEST_READY.md`, and `/home/admin/PanelPH/.agents/teamwork/m4_worker_gen8/handoff.md`.
3. Inspect `public/order-desk.html`, `public/order-desk.html.bak`, and `test/frontend-order-desk.test.js`.
4. Verify all M4 requirements:
   - Rapid free-text need entry form (#name, #quantity, #unit, #note, #submit, Enter submit binding, focus restoration).
   - Sliding ambiguity resolution drawer (#ambiguity-drawer, #drawer-backdrop, debounced #catalog-search, candidate cards, leading zero code preservation, disabled confirm button until selection).
   - Live draft status badge (#status: open, needs_completion, ready_for_review), #summary counters (#summary-items, #summary-ambiguities), and responsive layout (#items, #ambiguities).
   - Event timeline (#timeline, #history) with interactive revert buttons calling revert_order_event / POST /api/draft/revert.
   - Host theme synchronization (prefers-color-scheme, host-context-changed, #btn-theme-toggle).
   - Dual transport (Apps SDK postMessage JSON-RPC 2.0 and REST fallback).
   - CSP-safe, zero external CDN scripts or fonts.
5. Independently execute:
   - `node --test test/frontend-order-desk.test.js`
   - `PANELPH_E2E_STRICT=1 node --test`
6. Write your comprehensive evaluation to `/home/admin/PanelPH/.agents/teamwork/m4_reviewer_1_gen9/handoff.md` concluding with explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
7. Send completion message back to parent orchestrator.

# Dispatch for M4 Implementation Worker (Gen 8)

Assigned working directory: /home/admin/PanelPH/.agents/teamwork/m4_worker_gen8
Role: teamwork_preview_worker
Target: Milestone 4 (Pharmacist Frontend & Apps SDK in public/order-desk.html)
Refer to prompt instructions for full implementation requirements and verification steps.
## 2026-10-14T15:23:07Z
You are M4 Implementation Worker (Gen 8) for the PanelPH project.
Your assigned working directory is: /home/admin/PanelPH/.agents/teamwork/m4_worker_gen8
The project root is: /home/admin/PanelPH
The authoritative user request is at: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
The project scope is at: /home/admin/PanelPH/PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Detailed Explorer handoffs and validated blueprints are prepared for you:
- Validated Production Code Draft: `/home/admin/PanelPH/.agents/teamwork/m4_explorer_2_gen7/proposed_order-desk.html`
- Architecture & State Machine: `/home/admin/PanelPH/.agents/teamwork/m4_explorer_2_gen7/handoff.md`
- UI Test Harness Specification: `/home/admin/PanelPH/.agents/teamwork/m4_explorer_3_r_gen7/handoff.md`
- Authoritative UI Specifications: `/home/admin/PanelPH/.agents/teamwork/m4_spec_miner_1_gen7/handoff.md`

Your Scope of Work:
1. File Write Ownership:
   - You exclusively own: `public/order-desk.html` and `test/frontend-order-desk.test.js`
   - Do NOT edit other source files unless strictly required.
2. Step 1: Backup `public/order-desk.html` to `public/order-desk.html.bak`.
3. Step 2: Implement `public/order-desk.html`:
   - Inspect `/home/admin/PanelPH/.agents/teamwork/m4_explorer_2_gen7/proposed_order-desk.html` and copy/adapt its validated code into `public/order-desk.html`.
   - Ensure it includes:
     * Free-text need entry form: `#name`, `#quantity`, `#unit`, and `#note` with `Enter` submit and focus loop.
     * Sliding ambiguity resolution drawer (`#ambiguity-drawer`) with live debounced catalog search (`/api/catalog/search`), candidate proposal cards, leading zero code preservation, and human confirmation safety gate (`#btn-confirm-resolve` disabled until a card is selected).
     * Draft status header (`#status`), summary counts (`#summary`), and responsive 2-column layout (`#items` and `#ambiguities`).
     * Reverse-chronological event timeline (`#timeline`) with compensating `[↩ بازگردانی]` revert buttons calling `revert_order_event` or `POST /api/draft/revert`.
     * 3-tier theme sync (system `prefers-color-scheme`, Apps SDK `hostContext.theme` / `ui/notifications/host-context-changed`, and manual toggle).
     * Dual-transport controller running seamlessly in both ChatGPT Apps SDK (`postMessage`) and standalone browser mode (`fetch('/api/*')`).
     * Completely self-contained vanilla HTML/CSS/JS with zero external CDN scripts or Google fonts (iframe CSP safe).
4. Step 3: Implement `test/frontend-order-desk.test.js`:
   - Inspect the complete test specification in `/home/admin/PanelPH/.agents/teamwork/m4_explorer_3_r_gen7/handoff.md § Section 3`.
   - Implement the automated test suite verifying:
     * Serving over HTTP (`GET /order-desk.html` returns 200, text/html).
     * Serving over MCP resource (`ui://panelph/order-desk.html` returns valid resource payload).
     * Complete DOM structure: inputs (`#name`, `#quantity`, `#unit`, `#note`), drawers (`#ambiguity-drawer`), buttons (`#btn-confirm-resolve`, `#btn-theme-toggle`), containers (`#items`, `#ambiguities`, `#timeline`).
     * Theme tokens: CSS variable definitions for light and dark palettes.
     * Script integrity: check for dual-transport routing, debounce logic, leading zero preservation, and error handling.
5. Verification:
   - Run `node --test test/frontend-order-desk.test.js` (must pass, exit code 0).
   - Run `PANELPH_E2E_STRICT=1 node --test` (must pass 100% across all 141+ tests with 0 skips and 0 failures, exit code 0).
6. Output:
   - Write a complete `handoff.md` in `/home/admin/PanelPH/.agents/teamwork/m4_worker_gen8/handoff.md` with:
     * Observation: Verification commands and test execution outputs.
     * Logic Chain: Summary of changes to `public/order-desk.html` and new tests.
     * Caveats: Any edge cases or browser sandbox constraints.
     * Conclusion: Readiness for Gate 4 review.
   - Update `progress.md` in your directory.
   - Send a completion message to your parent orchestrator with your results and test outputs.

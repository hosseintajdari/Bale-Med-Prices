# Task Dispatch: Milestone 2 — MCP Tools & Batch Export (Explorer 3)

## Objective
Explore the expansion of MCP tools and order batch generation with discrepancy highlighting in `src/server.js` using the Qanoon adapter.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Architecture & Contracts: `/home/admin/PanelPH/PROJECT.md`
- Adapter code: `/home/admin/PanelPH/src/adapters/qanoon-adapter.js`
- Draft store: `/home/admin/PanelPH/src/draft-store.js`
- E2E Tests: `/home/admin/PanelPH/test/e2e/tier1-feature-coverage.test.js`

## Key Questions to Investigate
1. What MCP tools currently exist in `src/server.js`?
2. What new tools need to be registered with `@modelcontextprotocol/sdk`?
   - `search_catalog`
   - `check_stock`
   - `export_order_batch`
3. How does `export_order_batch` validate the draft?
   - Status check (must be `ready_for_review` or flag unresolved items)
   - Pre-batch stock check via `adapter.checkBatchStock`
   - Price calculation and divergence checks via `adapter.calculatePrice`
   - Generation of uniqueId and calling `adapter.createBatchOrder`
   - Compiling and returning discrepancies (e.g. out of stock, unapproved price divergence, unresolved needs)
4. How should REST endpoint `/api/orders/export-batch` mirror the MCP tool?

## Deliverable
Write your findings to `/home/admin/PanelPH/.agents/teamwork/m2_explorer_3/analysis.md` and complete `/home/admin/PanelPH/.agents/teamwork/m2_explorer_3/handoff.md`.
Send a completion message to the orchestrator when finished.


## 2026-10-14T10:01:13Z
You are m2_explorer_3, an MCP Tools & Batch Export Explorer for Milestone 2 of PanelPH.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m2_explorer_3
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m2_explorer_3/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Explore expansion of MCP tools and order batch export with discrepancy highlighting (stock checks, price calculations, uniqueId batch creation).
Write your analysis to /home/admin/PanelPH/.agents/teamwork/m2_explorer_3/analysis.md and your handoff to /home/admin/PanelPH/.agents/teamwork/m2_explorer_3/handoff.md.
Send a message back to the orchestrator when finished.

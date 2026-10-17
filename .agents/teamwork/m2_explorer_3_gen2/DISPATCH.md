## 2026-10-14T10:06:00Z
You are m2_explorer_3 (teamwork_preview_explorer).
Your assigned working directory is: /home/admin/PanelPH/.agents/teamwork/m2_explorer_3_gen2

### Task
Explore Order Batch Generation, Discrepancy Highlighting, and MCP Tools expansion for Milestone 2.

### Required Reading
1. /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md (Authoritative requirements - MANDATORY)
2. /home/admin/PanelPH/PROJECT.md (Architecture, Milestone 2 scope, Interface Contracts)
3. /home/admin/PanelPH/src/draft-store.js (Current draft store methods and state shape)
4. /home/admin/PanelPH/src/adapters/qanoon-adapter.js (Stock check and batch order APIs)
5. /home/admin/PanelPH/src/server.js (Existing MCP tool registrations)
6. /home/admin/PanelPH/test/e2e/tier1-feature-coverage.test.js (F11: Order Batch Generation & Discrepancy Highlighting)

### Focus Areas
- Inspect the batch export flow (`POST /api/orders/export-batch` and MCP tool `export_order_batch`).
- Define discrepancy rules:
  - If draft has unresolved items (`status === "needs_completion"` or `resolvedReference === null`), flag each as an ambiguity/unresolved discrepancy.
  - If any items fail stock verification via adapter pre-check, flag as stock discrepancy.
  - If draft is empty or has zero items, return appropriate error/discrepancy.
- Detail the exported batch data structure:
  - Export-ready payload format compatible with Qanoon adapter's `createBatchOrder({ draftId, uniqueId, items })`.
  - Idempotency with uniqueId generation.
- Evaluate MCP tools expansion:
  - Register `search_catalog`, `check_stock`, `export_order_batch` in `src/server.js` using `@modelcontextprotocol/sdk`.
- Provide concrete implementation recommendations for M2 Worker.

### Deliverables
- Write `analysis.md` in your working directory.
- Write `handoff.md` with: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
- Send a completion message back to the orchestrator.

# Orchestrator Execution Plan — Gen 5

## Scope & Target
PanelPH pharmacy operational layer and private ChatGPT MCP App:
1. Complete Milestone 2 Iteration 2 (Catalog resolver & operational backend)
2. Pass Gate 2 (Reviewers x2, Challengers x2, Auditor)
3. Execute Milestone 3 (Draft store concurrency, event sourcing F12-F14)
4. Execute Milestone 4 (Order desk frontend, drawer, theme sync F15-F19)
5. Execute Milestone 5 (E2E Test validation Tiers 1-4, Tier 5 hardening F20-F21)

## Step-by-Step Execution Plan
- **Step 1**: Dispatch M2 Iteration 2 Worker (`teamwork_preview_worker`) to apply `/home/admin/PanelPH/.agents/teamwork/m2_i2_explorer_2/proposed_catalog_resolver.patch`, run `npm test`, verify 0 failures and 0 skips.
- **Step 2**: Dispatch 2 Reviewers, 2 Challengers, and 1 Forensic Auditor for Gate 2 verification.
- **Step 3**: Evaluate Gate 2. Upon unanimous APPROVE and CLEAN audit, mark M2 DONE in `PROJECT.md`.
- **Step 4**: Milestone 3: Dispatch Explorers -> Worker -> Reviewers -> Challengers -> Auditor for Event Sourcing & Mutex Concurrency (`src/draft-store.js`).
- **Step 5**: Milestone 4: Dispatch Explorers -> Worker -> Reviewers -> Challengers -> Auditor for Frontend Order Desk & Apps SDK (`public/order-desk.html`).
- **Step 6**: Milestone 5: Full E2E test verification (`TEST_READY.md`), adversarial stress testing (Tier 5), and final completion report to parent.

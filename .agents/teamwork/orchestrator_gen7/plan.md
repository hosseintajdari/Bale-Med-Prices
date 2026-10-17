# Orchestrator Execution Plan — Gen 6

## Scope & Target
PanelPH pharmacy operational layer and private ChatGPT MCP App:
1. Complete Milestone 2 Iteration 3 Remediation (Dosage guard & bare number filter)
2. Verify Challenger 1 suite & conclude Gate 2
3. Execute Milestone 3 (Event Sourcing & Mutex Concurrency F12, F13, F14 in `src/draft-store.js`)
4. Execute Milestone 4 (Pharmacist Frontend & Apps SDK F15-F19 in `public/order-desk.html`)
5. Execute Milestone 5 (E2E Verification & Hardening F20, F21 across Tiers 1-4, `PANELPH_E2E_STRICT=1`, Tier 5)

## Step-by-Step Execution Plan
- **Step 1**: Dispatch M2 Worker (`teamwork_preview_worker`) to apply the compact dosage guard and bare numeric filter in `src/catalog-resolver.js` per `/home/admin/PanelPH/.agents/teamwork/m2_i3_challenger_1/handoff.md`.
- **Step 2**: Worker runs `npm test`, `node /tmp/m2_i3_challenger_1_suite.mjs`, `node /tmp/m2_i2_adversarial_suite.mjs`, and `node /tmp/adversarial_challenger_2.mjs`.
- **Step 3**: Conclude Gate 2 with PASS and update `PROJECT.md` and `GATE_STATUS.md`.
- **Step 4**: Milestone 3: Dispatch Worker to implement mutex queue and atomic writes in `src/draft-store.js`, verify `test/draft-store.test.js` and `test/e2e/tier1-feature-coverage.test.js` F13 mutex test, review and audit Gate 3.
- **Step 5**: Milestone 4: Dispatch Worker to implement ambiguity drawer, note field, event revert buttons, theme sync in `public/order-desk.html`, review and audit Gate 4.
- **Step 6**: Milestone 5: Run full E2E test suite in strict mode (`PANELPH_E2E_STRICT=1 npm test`), adversarial stress tests, and compile final verification report.

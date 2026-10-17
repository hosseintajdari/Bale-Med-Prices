# Task Assignment: m5_challenger_1_gen12 (Tier 5 Adversarial Stress Verifier — Backend & Concurrency)

## Working Directory
`/home/admin/PanelPH/.agents/teamwork/m5_challenger_1_gen12`

## Mandatory Reference Documents
- `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md` (read first)
- `/home/admin/PanelPH/PROJECT.md`
- `/home/admin/PanelPH/TEST_INFRA.md`
- `/home/admin/PanelPH/TEST_READY.md`

## Focus
Adversarial stress testing of Backend Operational Layer:
1. `src/draft-store.js`: Concurrency mutex saturation, heavy parallel `addNeed`/`updateNeed`/`resolveNeed`/`revertEvent`, deep compensating event chains, atomic write resilience under rapid mutations.
2. `src/adapters/qanoon-adapter.js`: 24-hour uniqueId cache expiry and collision boundaries, two-stage stock check discrepancies, 7-step pricing calculation edge cases (zero base price, large values, TTAC divergence warnings >10,000 Rial).
3. Author adversarial test file `test/e2e/tier5-adversarial-backend.test.js` using `node:test` and `node:assert/strict`.
4. Run your adversarial test file and `PANELPH_E2E_STRICT=1 node --test`.
5. Report findings, stress test results, claim ledger, and handoff to `/home/admin/PanelPH/.agents/teamwork/m5_challenger_1_gen12/handoff.md`.
6. Send completion message to orchestrator (`c9975cd4-4d89-4540-a974-dfd9e05810f7`).


## 2026-10-14T18:58:35Z
You are m5_challenger_1_gen12, a teamwork_preview_challenger assigned to perform Tier 5 adversarial stress verification on the backend and concurrency layer of PanelPH.

Your working directory is: /home/admin/PanelPH/.agents/teamwork/m5_challenger_1_gen12
Please read:
- /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
- /home/admin/PanelPH/PROJECT.md
- /home/admin/PanelPH/TEST_INFRA.md
- /home/admin/PanelPH/TEST_READY.md
- /home/admin/PanelPH/.agents/teamwork/m5_challenger_1_gen12/DISPATCH.md

Tasks:
1. Deeply inspect `src/draft-store.js` and `src/adapters/qanoon-adapter.js`.
2. Construct aggressive adversarial test scenarios:
   - High-concurrency race condition attacks (e.g. 50 parallel operations mixing adds, updates, resolves, reverts).
   - Deep compensating revert chains (reverting a reverted event, interleaved additions).
   - Qanoon adapter idempotency collisions, 24h cache boundary tests, pricing calculation edge cases (e.g. zero, max integer, >10,000 Rial TTAC divergence checks).
   - Resilient persistence under rapid concurrent writes and simulated process reloads.
3. Write an adversarial test file: `test/e2e/tier5-adversarial-backend.test.js` using `node:test` and `node:assert/strict`.
4. Run `node --test test/e2e/tier5-adversarial-backend.test.js` and `PANELPH_E2E_STRICT=1 node --test`.
5. Write your comprehensive handoff report to /home/admin/PanelPH/.agents/teamwork/m5_challenger_1_gen12/handoff.md including full observations, adversarial test results, and claim ledger.
6. Send a message to orchestrator (conversation ID: c9975cd4-4d89-4540-a974-dfd9e05810f7) with your findings.

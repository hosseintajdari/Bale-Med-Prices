# Task Dispatch: Milestone 1 Challenger 1 — Adversarial Empirical Verification

## Objective
Adversarially challenge and stress-test the Milestone 1 Qanoon Adapter implementation (`src/adapters/qanoon-adapter.js`, `fixtures/qanoon-mock-data.json`).

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Architecture & Contracts: `/home/admin/PanelPH/PROJECT.md`
- Adapter code: `/home/admin/PanelPH/src/adapters/qanoon-adapter.js`

## Challenge Focus
1. Adversarially test pricing calculations:
   - Check rounding behavior across various decimal quantities (e.g., 2.5, 0.33, 100000).
   - Check boundary of TTAC divergence threshold: exactly 10,000 Rial divergence (no warning) vs 10,001 Rial divergence (warning emitted).
   - Mathematical check: does `vatAmount + tollAmount === totalTax` hold for every single combination of tax rates, multipliers, and quantities?
2. Adversarially test idempotency and cache expiration:
   - Concurrent submissions with the same `uniqueId`.
   - Replay after payload mutation (must trigger 409 conflict).
   - Cache expiration behavior when TTL exceeds 24 hours.
3. Execute empirical tests and verify behavior.

## Deliverable
Write your empirical test results to `/home/admin/PanelPH/.agents/teamwork/m1_challenger_1/challenge_report.md` and complete `/home/admin/PanelPH/.agents/teamwork/m1_challenger_1/handoff.md` with explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
Send your verdict and summary to the orchestrator.


## 2026-10-14T09:52:03Z
[Message] timestamp=2026-10-14T09:52:03Z sender=ba9cb93f-aa16-41f9-a7c1-f88d790936d4 priority=MESSAGE_PRIORITY_HIGH content=You are m1_challenger_1, an adversarial verifier for Milestone 1 of PanelPH.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m1_challenger_1
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m1_challenger_1/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Adversarially challenge and stress-test pricing calculations, 75/25 VAT/toll split mathematical invariants, TTAC divergence thresholds, and 24-hour uniqueId replay/concurrency in src/adapters/qanoon-adapter.js.
Write your challenge report to /home/admin/PanelPH/.agents/teamwork/m1_challenger_1/challenge_report.md and your handoff to /home/admin/PanelPH/.agents/teamwork/m1_challenger_1/handoff.md with an explicit verdict (APPROVE or REQUEST_CHANGES).
Send your verdict and summary back to the orchestrator.

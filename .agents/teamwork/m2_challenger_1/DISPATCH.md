# Task Dispatch: Milestone 2 Challenger 1 — REST & Batch Export Stress Testing

## Objective
Empirically stress-test the REST API endpoints and batch export discrepancy detection in `src/server.js`.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Architecture & Contracts: `/home/admin/PanelPH/PROJECT.md`
- Server code: `/home/admin/PanelPH/src/server.js`

## Challenge Focus
1. Adversarially stress test REST endpoints:
   - Invalid JSON bodies (truncated, malformed, non-object).
   - Missing fields, invalid types, negative quantities, boundary IDs.
   - Non-existent route handling (404).
   - `OPTIONS` CORS preflight across all endpoints.
2. Stress test batch export discrepancy compilation:
   - Draft with multiple unresolved items.
   - Draft with items exceeding warehouse stock.
   - Draft with items triggering TTAC divergence warning (>10,000 Rial).
   - Replay batch export with identical uniqueId (verify status: "CACHED").
3. Execute empirical tests and report findings.

## Deliverable
Write your report to `/home/admin/PanelPH/.agents/teamwork/m2_challenger_1/challenge_report.md` and complete `/home/admin/PanelPH/.agents/teamwork/m2_challenger_1/handoff.md` with explicit verdict (`APPROVE` or `REQUEST_CHANGES`).
Send your verdict and summary to the orchestrator.

## 2026-10-14T10:24:38Z
You are m2_challenger_1, an adversarial verifier for Milestone 2 of PanelPH.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m2_challenger_1
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m2_challenger_1/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Empirically stress-test REST endpoints (malformed JSON, CORS OPTIONS, boundary parameters) and batch export discrepancy detection (unresolved items, stock shortages, TTAC divergence).
Write your challenge report to /home/admin/PanelPH/.agents/teamwork/m2_challenger_1/challenge_report.md and handoff to /home/admin/PanelPH/.agents/teamwork/m2_challenger_1/handoff.md with an explicit verdict (APPROVE or REQUEST_CHANGES).
Send your verdict and summary back to the orchestrator.

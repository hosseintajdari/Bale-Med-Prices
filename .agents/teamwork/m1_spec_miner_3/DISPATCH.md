# Task Dispatch: Milestone 1 — Qanoon API Spec & Idempotency (Spec Miner 3)

## Objective
Detail the exact requirements for `docs/qanoon-api-spec.md` and the 24-hour `uniqueId` idempotency cache in `src/adapters/qanoon-adapter.js`.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Project Architecture: `/home/admin/PanelPH/PROJECT.md`
- Survey Reports: `/home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/spec_report.md`
- ADR-002: `/home/admin/PanelPH/docs/adr/ADR-002-qanoon-authorized-source-access.md`

## Focus
1. What sections, diagrams/flows, and endpoint documentation must appear in `docs/qanoon-api-spec.md`?
   - Architecture overview & isolation boundary
   - Authentication & headers (`Authorization`, `X-Pharmacy-Id`, `X-Unique-Id`)
   - Endpoints: `POST /stock/check`, `POST /orders/batch`, `POST /pricing/calculate`, `GET /goods/search`
   - Request and response JSON schemas with realistic examples
   - Error handling & HTTP status codes
   - Idempotency & retry semantics specification (24-hour uniqueId cache)
2. Specify the exact in-memory / persisted cache mechanics for `uniqueId` idempotency in the adapter (cache keys, TTL 24h, return cached response on replay, avoid duplicate stock deductions).

## Deliverables
- Report at `/home/admin/PanelPH/.agents/teamwork/m1_spec_miner_3/spec_plan.md`
- Handoff at `/home/admin/PanelPH/.agents/teamwork/m1_spec_miner_3/handoff.md`


## 2026-10-14T09:34:36Z
[Message] timestamp=2026-10-14T09:34:36Z sender=ba9cb93f-aa16-41f9-a7c1-f88d790936d4 priority=MESSAGE_PRIORITY_HIGH content=You are m1_spec_miner_3, a Qanoon API Spec & Idempotency Miner.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m1_spec_miner_3
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m1_spec_miner_3/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Detail exact requirements for docs/qanoon-api-spec.md and 24-hour uniqueId idempotency cache in src/adapters/qanoon-adapter.js.
Write your plan to /home/admin/PanelPH/.agents/teamwork/m1_spec_miner_3/spec_plan.md and your handoff to /home/admin/PanelPH/.agents/teamwork/m1_spec_miner_3/handoff.md.
Send a message back to the orchestrator when finished.

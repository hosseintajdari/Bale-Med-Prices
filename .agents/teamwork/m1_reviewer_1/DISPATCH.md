# Task Dispatch: Milestone 1 Reviewer 1

## Objective
Independently review the work product delivered for Milestone 1:
- `src/adapters/qanoon-adapter.js`
- `fixtures/qanoon-mock-data.json`
- `docs/qanoon-api-spec.md`
- `test/qanoon-adapter.test.js`

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Architecture & Contracts: `/home/admin/PanelPH/PROJECT.md`
- Worker Handoff: `/home/admin/PanelPH/.agents/teamwork/m1_worker/handoff.md`
- E2E Test Suite Ready: `/home/admin/PanelPH/TEST_READY.md`

## Review Criteria
1. Interface conformance: Does `QanoonAdapter` satisfy all method signatures, data types, and options defined in `PROJECT.md § Interface Contracts`?
2. Pricing correctness: Does `calculatePrice` correctly execute the 7-step sequence, 75/25 VAT/toll split (`tollAmount = totalTax - vatAmount`), technical fee, and >10,000 Rial TTAC divergence warning?
3. Stock verification: Are both preliminary advisory check and pre-batch check implemented properly?
4. Idempotency: Does `createBatchOrder` properly use 24h `uniqueId` caching, returning CACHED on replay and 409 on payload mismatch?
5. Leading zero preservation: Are generic and brand codes strictly kept as strings?
6. Run `node --test` to verify unit and E2E tests pass.

## Deliverable
Write your review report to `/home/admin/PanelPH/.agents/teamwork/m1_reviewer_1/review.md` and complete `/home/admin/PanelPH/.agents/teamwork/m1_reviewer_1/handoff.md` with explicit verdict: `APPROVE` or `REQUEST_CHANGES`.
Send your verdict and summary to the orchestrator.

## 2026-10-14T09:52:03Z
You are m1_reviewer_1, an independent code reviewer for Milestone 1 of PanelPH.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m1_reviewer_1
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m1_reviewer_1/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Independently review src/adapters/qanoon-adapter.js, fixtures/qanoon-mock-data.json, docs/qanoon-api-spec.md, and test/qanoon-adapter.test.js.
Run `node --test` to verify unit and E2E tests pass.
Write your review to /home/admin/PanelPH/.agents/teamwork/m1_reviewer_1/review.md and your handoff to /home/admin/PanelPH/.agents/teamwork/m1_reviewer_1/handoff.md with an explicit verdict (APPROVE or REQUEST_CHANGES).
Send your verdict and summary back to the orchestrator.

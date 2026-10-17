# Task Dispatch: Milestone 1 Worker — Implement Qanoon Adapter & Docs

## Objective
Implement the complete legacy Qanoon adapter boundary, mock fixtures, documentation, and unit test suite according to the explorer specifications.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Architecture & Contracts: `/home/admin/PanelPH/PROJECT.md`
- Adapter Architecture & Mocks: `/home/admin/PanelPH/.agents/teamwork/m1_explorer_1/analysis.md`
- Pricing, Stock Rules & Tests: `/home/admin/PanelPH/.agents/teamwork/m1_explorer_2/analysis.md`
- API Spec Layout & Idempotency: `/home/admin/PanelPH/.agents/teamwork/m1_spec_miner_3/spec_plan.md`

## File Ownership (Strict Write Boundaries)
You exclusively own and may create/edit these files:
- `src/adapters/qanoon-adapter.js`
- `fixtures/qanoon-mock-data.json`
- `docs/qanoon-api-spec.md`
- `test/qanoon-adapter.test.js`
Do NOT modify any other files (such as `src/server.js`, `src/draft-store.js`, or existing tests in `test/`).

## Implementation Requirements
1. **Mock Data Fixtures (`fixtures/qanoon-mock-data.json`)**:
   - Provide realistic sample goods, stock data, warehouse records, tax codes, and pricing rules.
   - Ensure generic and brand codes strictly preserve leading zeroes (e.g., `"00001"`, `"08234"`).
2. **Qanoon Adapter Boundary (`src/adapters/qanoon-adapter.js`)**:
   - Class `QanoonAdapter` with methods:
     - `checkStock({ genericCode, brandCode, requestedCount })`: Returns `{ inStock, availableCount, warehouseId, advisoryWarning, expDate }`.
     - `calculatePrice({ goodId, quantity, roundingRule })`: 7-step deterministic pricing pipeline with basePrice, 75/25 VAT/toll split (`tollAmount = totalTax - taxAmount`), technical fee, and >10,000 Rial TTAC divergence warning.
     - `createBatchOrder({ draftId, uniqueId, items })`: 24-hour `uniqueId` idempotency cache. If uniqueId was seen with identical payload, return cached response with status `CACHED`. If seen with conflicting payload, throw/return 409 conflict error.
     - `searchGoods({ query })`: Search goods in mock/live catalog preserving leading zeros.
   - Built-in offline fallback: when no API key/URL is configured or when `mockMode: true` is passed, use `fixtures/qanoon-mock-data.json` without external network calls.
   - Robust error handling hierarchy (`QanoonAdapterError`, `QanoonValidationError`, `QanoonConflictError`, etc.).
3. **API Specification Document (`docs/qanoon-api-spec.md`)**:
   - Complete 8-section specification per `m1_spec_miner_3/spec_plan.md` documenting architecture boundary, headers, endpoints, schemas, Mermaid diagram, and retry semantics.
4. **Unit Tests (`test/qanoon-adapter.test.js`)**:
   - Native Node.js `node:test` suite covering all features, stock checks, pricing rules, 75/25 tax split, TTAC divergence warnings, uniqueId replay/caching, 409 conflict detection, and offline mode.
   - Run `node --test` to verify 100% passing tests with exit code 0.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Deliverables
- Implementation files in `src/adapters/`, `fixtures/`, `docs/`, `test/`.
- Handoff report at `/home/admin/PanelPH/.agents/teamwork/m1_worker/handoff.md`.
- Send message to orchestrator with test results and summary.


## 2026-10-14T09:41:49Z
You are m1_worker, a Software Engineer implementing Milestone 1 for PanelPH.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m1_worker
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m1_worker/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.

Exclusively own and implement:
- src/adapters/qanoon-adapter.js
- fixtures/qanoon-mock-data.json
- docs/qanoon-api-spec.md
- test/qanoon-adapter.test.js

Run `node --test` to verify 100% test pass rate with exit code 0.
Write your handoff report to /home/admin/PanelPH/.agents/teamwork/m1_worker/handoff.md and report back with exact test outputs.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

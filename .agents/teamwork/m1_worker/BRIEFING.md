# BRIEFING — 2026-10-14T09:50:00Z

## Mission
Implement the complete legacy Qanoon adapter boundary (`src/adapters/qanoon-adapter.js`), mock fixtures (`fixtures/qanoon-mock-data.json`), API specification documentation (`docs/qanoon-api-spec.md`), and unit test suite (`test/qanoon-adapter.test.js`) for PanelPH Milestone 1.

## 🔒 My Identity
- Archetype: Software Engineer
- Roles: implementer, qa, specialist
- Working directory: /home/admin/PanelPH/.agents/teamwork/m1_worker
- Original parent: ba9cb93f-aa16-41f9-a7c1-f88d790936d4
- Milestone: Milestone 1 — Qanoon Adapter & Docs

## 🔒 Key Constraints
- Exclusively own and edit:
  - `src/adapters/qanoon-adapter.js`
  - `fixtures/qanoon-mock-data.json`
  - `docs/qanoon-api-spec.md`
  - `test/qanoon-adapter.test.js`
- Do NOT modify any other files (such as `src/server.js`, `src/draft-store.js`, or existing tests in `test/`).
- Strict leading-zero string preservation for genericCode and brandCode (e.g., "00001", "08234").
- 24-hour uniqueId idempotency cache with status CACHED on match and 409 conflict on payload mismatch.
- Deterministic 7-step pricing engine with 75/25 VAT/toll split (`tollAmount = totalTax - taxAmount`) and >10,000 Rial TTAC divergence warning.
- 100% offline mock execution without external network calls or hardcoded secrets.
- Mandatory integrity: no hardcoding test results, no dummy facade implementations. Genuine business logic throughout.

## Current Parent
- Conversation ID: ba9cb93f-aa16-41f9-a7c1-f88d790936d4
- Updated: 2026-10-14T09:50:00Z

## Task Summary
- **What to build**: Qanoon legacy REST adapter boundary class (`QanoonAdapter`), mock fixtures JSON, formal API specification markdown, and unit test suite verifying stock checks, 7-step pricing, uniqueId idempotency, conflict detection, and offline mode.
- **Success criteria**: 100% test pass rate on unit tests and repository test suite, seamless offline mock mode, full adherence to PROJECT.md interface contracts.
- **Interface contracts**: `/home/admin/PanelPH/PROJECT.md` § Interface Contracts
- **Code layout**: `/home/admin/PanelPH/PROJECT.md` § Code Layout

## Key Decisions Made
- Implemented `fixtures/qanoon-mock-data.json` with 7 comprehensive catalog items (including Amoxicillin "00001", Adult Cream "08234", Acetaminophen "00025", Cough Syrup "04210", Vitamin D3 "00115", and compatibility alias "g1"), multi-warehouse inventory ("main" and "branch-2"), dated tax tables (`TAX_MED_STANDARD`, `TAX_MED_REDUCED`, `TAX_COSMETIC`), dated technical fee rules (pharma-only with minimum quantity), and pre-seeded uniqueId orders.
- Implemented `docs/qanoon-api-spec.md` with 8 complete sections: Architecture Overview (with Mermaid diagram), Transport & Authentication Headers, Stock Check endpoint & two-stage lifecycle, 7-Step Pricing Calculation endpoint with 75/25 tax split, Goods Catalog Search endpoint, Order Batch Reservation endpoint with 24-hour idempotency, Error Codes & Standard Envelope, and Leading-Zero String Preservation Invariant.
- Implemented `src/adapters/qanoon-adapter.js` exporting `QanoonAdapter`, `createQanoonAdapter`, and typed error hierarchy (`QanoonAdapterError`, `QanoonValidationError`, `QanoonAuthenticationError`, `QanoonNotFoundError`, `QanoonConflictError`, `QanoonNetworkTimeoutError`, `QanoonServerError`). Supports automatic mock mode, SHA-256 payload hashing, concurrent in-flight locking, 2-stage stock check (`checkStock` and `checkBatchStock`), 7-step pricing calculation with `ttacUnitPrice` / divergence guard, and search preserving leading zeroes.
- Implemented `test/qanoon-adapter.test.js` with 39 comprehensive native tests. Verified 100% pass on both `node --test test/qanoon-adapter.test.js` (39/39 pass) and full repo `node --test` (83/83 pass, 2 skipped M2 endpoints).

## Artifact Index
- `/home/admin/PanelPH/fixtures/qanoon-mock-data.json` — Realistic mock dataset for catalog goods, inventory stock, tax tables, technical fees, pre-seeded orders.
- `/home/admin/PanelPH/docs/qanoon-api-spec.md` — Complete 8-section Qanoon REST API specification.
- `/home/admin/PanelPH/src/adapters/qanoon-adapter.js` — QanoonAdapter class, factory, error hierarchy, 24h idempotency cache, 7-step pricing engine, 2-stage stock check, catalog search.
- `/home/admin/PanelPH/test/qanoon-adapter.test.js` — Comprehensive node:test unit test suite covering all features and edge cases.
- `/home/admin/PanelPH/.agents/teamwork/m1_worker/progress.md` — Progress tracker and liveness heartbeat.
- `/home/admin/PanelPH/.agents/teamwork/m1_worker/handoff.md` — 5-component handoff report.

## Change Tracker
- **Files modified**:
  - `fixtures/qanoon-mock-data.json`: Comprehensive catalog, stock, tax tables, fees, and preseeded order fixtures.
  - `docs/qanoon-api-spec.md`: 8-section formal REST API specification document with Mermaid architecture diagram.
  - `src/adapters/qanoon-adapter.js`: Isolated adapter boundary, 24h idempotency cache, 7-step pricing engine, two-stage stock check.
  - `test/qanoon-adapter.test.js`: 39 unit tests for offline mock execution, pricing, stock, idempotency, leading zeros, and error classes.
- **Build status**: 100% test pass rate across `node --test` (83 passed, 0 failed, 2 skipped M2 endpoints).
- **Pending issues**: None for Milestone 1.

## Quality Status
- **Build/test result**: PASS (exit code 0; 39/39 M1 unit tests pass; 83/83 active repository tests pass).
- **Lint status**: clean (node --check passed on all JS files).
- **Tests added/modified**: 39 new tests in `test/qanoon-adapter.test.js` covering initialization, mock mode, Stage 1 advisory stock, Stage 2 pre-batch barrier, 7-step pricing, tempPrice fallback, non-pharma fee exemption, historical tax boundaries, TTAC divergence warnings, rounding rules, 24h uniqueId replay/conflict/expiration, leading zero preservation, and typed error inheritance.

## Loaded Skills
- None requested by orchestrator

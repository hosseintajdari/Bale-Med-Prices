# PanelPH Orchestration Plan

## Objective
Implement and verify the PanelPH pharmacy operational layer end-to-end, integrating legacy Qanoon workflows with Node.js backend, pharmacist frontend, and ChatGPT MCP App integration according to ORIGINAL_REQUEST.md.

## Phases

### Phase 0: Survey & Scope Mapping
- Dispatch 3 parallel Explorers to inspect existing codebase, legacy documentation, reference data, and existing tests:
  - Explorer 1: Codebase & Architecture (current server, draft-store, tests, dependencies, MCP setup)
  - Explorer 2: Legacy Qanoon documentation, webservices notes, pricing notes, reference data
  - Explorer 3: Frontend specifications, UI designs, and Apps SDK widget requirements
- Aggregate findings into `PROJECT.md` with Feature Inventory, Architecture, and Interface Contracts.

### Phase 1: Dual Track Decomposition
- Implementation Track:
  - Milestone 1 (R1): Legacy Qanoon Workflow Ingestion & API Adapter (src/adapters/qanoon-adapter.js, docs/qanoon-api-spec.md, mock fixtures)
  - Milestone 2 (R2): Pharmacy Operational Backend & MCP Tools (free-text entry, catalog resolution, stock checks, batch review, REST + MCP tools)
  - Milestone 3 (R4): Event Sourcing, Reversibility & Auditability (compensating events, event_reverted, race condition protection, persistence across restarts)
  - Milestone 4 (R3): Modern Pharmacist Frontend & Apps SDK Widget (rapid free-text capture, ambiguity resolution drawer, live draft overview, theme integration)
  - Milestone 5: Final Integration & E2E Acceptance (Tiers 1-4 pass 100%, Tier 5 adversarial hardening)
- E2E Testing Track:
  - Build opaque-box automated test harness covering all 4 tiers (Feature coverage, Boundary/Corner, Cross-feature, Real-world).
  - Publish `TEST_READY.md`.

### Phase 2: Execution & Verification Gate
- For each milestone:
  - Explorers (3) -> Worker -> Reviewers (2) -> Challengers (2) -> Forensic Auditor -> Gate.
  - Verification: `node --test` exit 0, zero regressions, clean audit.
- Final gate: 100% test pass on test suite, audit clean, report to parent.

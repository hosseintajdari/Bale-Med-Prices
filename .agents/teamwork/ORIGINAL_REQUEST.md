# Original User Request

## Initial Request — 2026-10-14T09:19:31Z

# Teamwork Project Prompt

Complete the pharmacy operational layer (PanelPH) end-to-end, integrating legacy pharmacy workflows (Qanoon / قانون) with a robust backend service, modern pharmacist frontend, and ChatGPT MCP App integration.

Working directory: /home/admin/PanelPH
Integrity mode: development

## Reference Materials
- Repository: /home/admin/PanelPH (and Windows counterpart C:\Users\hosse\PanelPH)
- Architectural records: docs/adr/ADR-001-private-chatgpt-mcp-workspace.md, docs/adr/ADR-002-qanoon-authorized-source-access.md
- Qanoon webservices & pricing notes: docs/REFERENCE-DATA.md, /home/admin/projects/Bale-Med-Prices/docs/qanoon-webservices-notes.md
- Core UI specifications: docs/UI-DESIGN.md

## Requirements

### R1. Legacy Qanoon Workflow Ingestion & API Adapter
- Analyze legacy Qanoon documentation, REST web-service definitions (JSON exchange, uniqueId retry semantics, stock checks), and data models.
- Implement an isolated Qanoon adapter boundary (src/adapters/qanoon-adapter.js or .ts) ensuring PanelPH domain logic is decoupled from legacy schemas.
- Document the schema and interaction flow in docs/qanoon-api-spec.md.

### R2. Pharmacy Operational Backend & MCP Tools
- Expand the existing Node.js operational backend (src/server.js, src/draft-store.js) to support the full operational lifecycle:
  1. Free-text need entry without forced catalog lookup.
  2. Medicine catalog resolution (generic code, TTAC / IRC identity, dosage form, strength).
  3. Live stock availability checks and price rule validation via the adapter.
  4. Final review, discrepancy highlighting, and export-ready order batches.
- Expose all capabilities via both standard REST endpoints and MCP App tools (using @modelcontextprotocol/sdk).

### R3. Modern Pharmacist Frontend & Apps SDK Widget
- Enhance the pharmacist user interface (public/order-desk.html or dedicated frontend) supporting:
  - Rapid free-text item capture.
  - Interactive ambiguity resolution drawer/modal.
  - Live draft overview with clear status indicators (open, needs_completion, ready_for_review).
  - Seamless dark/light theme integration matching host design principles.

### R4. Event Sourcing, Reversibility & Auditability
- Maintain strict event sourcing for all draft changes (need_added, need_updated, need_resolved, event_reverted).
- Ensure every change can be reverted by appending a compensating event rather than truncating history.
- Ensure state persistence is resilient across process restarts.

## Acceptance Criteria

### Automated Verification
- [ ] Automated test suite runs via node --test with exit code 0 and 100% passing tests.
- [ ] New unit and integration tests verify the Qanoon adapter, catalog resolution, and order batch creation without live external network dependencies (using fixtures/mocks).
- [ ] Event-revert functionality tested and verified against race conditions.

### Architectural & Functional Guardrails
- [ ] Qanoon API contracts and data exchange flows are fully documented in docs/qanoon-api-spec.md.
- [ ] No hardcoded credentials, live production endpoints, or un-isolated third-party API dependencies.
- [ ] Existing MCP test cases in test/ remain intact and green.
- [ ] Local MCP endpoint at /mcp successfully serves tools and UI resources.

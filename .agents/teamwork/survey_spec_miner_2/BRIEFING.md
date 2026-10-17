# BRIEFING — 2026-10-14T09:32:00Z

## Mission
Mine legacy Qanoon webservice specifications, schemas, idempotency semantics, stock checks, pricing rules, and catalog resolution fields.

## 🔒 My Identity
- Archetype: Specification Miner
- Roles: Legacy Qanoon Spec Miner, Teamwork Specialist
- Working directory: /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2
- Original parent: ba9cb93f-aa16-41f9-a7c1-f88d790936d4
- Milestone: Survey Phase

## 🔒 Key Constraints
- Sole job is to discover and document features by probing authoritative specification sources; do NOT implement anything.
- Probe ALL discovered features; capture exact inputs, outputs, error behaviors, edge cases.
- Write findings to /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/spec_report.md and handoff to /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/handoff.md.
- Send a message back to orchestrator ba9cb93f-aa16-41f9-a7c1-f88d790936d4 upon completion.
- Antigravity CLI English-only rule.

## Current Parent
- Conversation ID: ba9cb93f-aa16-41f9-a7c1-f88d790936d4
- Updated: 2026-10-14T09:32:00Z

## Task Summary
- **What to build**: Specification report (`spec_report.md`) detailing legacy Qanoon webservice endpoints, payload schemas, uniqueId retry semantics, stock checks, pricing rules, catalog resolution fields, and mock fixture requirements.
- **Success criteria**: Exhaustive, accurate extraction and documentation of all legacy Qanoon webservices and domain models supported by direct evidence from docs/adr, REFERENCE-DATA, Bale-Med-Prices notes, and related documentation. Completed.
- **Interface contracts**: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
- **Code layout**: .agents/teamwork/ holds metadata only.

## Key Decisions Made
- Prioritizing authoritative local documentation and reference data files.
- Extracted exact REST endpoints: `/stock/check`, `/orders/batch`, `/pricing/calculate`, `/goods/search`.
- Defined `uniqueId` retry semantics (24h idempotency cache, duplicate replay returning cached response, conflict on divergent payload).
- Defined two-stage stock check lifecycle (resolution time + pre-export batch barrier).
- Detailed deterministic 7-step pricing engine, 75/25 VAT/toll split, technical fee conditions, and >10,000 Rial TTAC discrepancy guard.
- Preserved leading zero string constraint for `genericCode` and `brandCode`.
- Completed spec_report.md and handoff.md.

## Artifact Index
- /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/DISPATCH.md — Task assignment
- /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/spec_report.md — Detailed specification report
- /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/handoff.md — 5-component handoff report
- /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/progress.md — Liveness heartbeat

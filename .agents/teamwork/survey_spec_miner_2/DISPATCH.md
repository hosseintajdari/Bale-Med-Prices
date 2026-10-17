# Task Dispatch: Legacy Qanoon & Domain Spec Mining

## Objective
Investigate all legacy Qanoon documentation, webservice definitions, data models, reference data, and architectural decision records to extract complete domain requirements for the adapter, catalog resolution, stock checks, and pricing.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- ADRs: `/home/admin/PanelPH/docs/adr/ADR-001-private-chatgpt-mcp-workspace.md`, `/home/admin/PanelPH/docs/adr/ADR-002-qanoon-authorized-source-access.md`
- Reference data: `/home/admin/PanelPH/docs/REFERENCE-DATA.md`
- External notes: `/home/admin/projects/Bale-Med-Prices/docs/qanoon-webservices-notes.md`
- Any other docs in `/home/admin/PanelPH/docs/`

## Key Questions to Answer
1. What are the legacy REST webservice endpoints, payload schemas, headers, and authentication/access mechanisms for Qanoon?
2. What are the exact uniqueId retry semantics and idempotency requirements?
3. How are stock checks performed? What is the request/response schema?
4. What are the pricing rules, discounts, and validation requirements?
5. What are the catalog resolution fields (generic code, TTAC / IRC identity, dosage form, strength) and how are they mapped?
6. What mock fixtures are needed to test the Qanoon adapter without live external network dependencies?

## Deliverable
Write your findings to `/home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/spec_report.md` and complete `/home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/handoff.md`.
Send a completion message back to the orchestrator when finished.


## 2026-10-14T09:22:02Z
You are survey_spec_miner_2, a Legacy Qanoon Spec Miner.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/DISPATCH.md and /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md first.
Investigate docs/adr/*, docs/REFERENCE-DATA.md, /home/admin/projects/Bale-Med-Prices/docs/qanoon-webservices-notes.md, and all related documentation.
Extract exact endpoints, payload schemas, uniqueId retry semantics, stock checks, pricing rules, catalog resolution fields, and mock fixture requirements.
Write your detailed report to /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/spec_report.md and your handoff to /home/admin/PanelPH/.agents/teamwork/survey_spec_miner_2/handoff.md.
Send a message back to the orchestrator when finished.

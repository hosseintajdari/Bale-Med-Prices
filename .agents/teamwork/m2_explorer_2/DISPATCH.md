# Task Dispatch: Milestone 2 — Catalog Resolver & Search (Explorer 2)

## Objective
Explore the design and implementation strategy for `src/catalog-resolver.js` to support progressive medicine catalog resolution.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Architecture & Contracts: `/home/admin/PanelPH/PROJECT.md`
- Reference Data: `/home/admin/PanelPH/docs/REFERENCE-DATA.md`
- Fixtures: `/home/admin/PanelPH/fixtures/catalog.sample.json`, `/home/admin/PanelPH/fixtures/qanoon-mock-data.json`

## Key Questions to Investigate
1. What fields must be returned for resolved items (genericCode, brandCode, title, dosageForm, strength, sellPrice)?
2. How should text search work across English and Persian drug names (e.g., Amoxicillin, آلوپروستادیل, Adult Cream, Syrup)?
3. How to strictly guarantee leading zero preservation for generic and brand codes (e.g. `"00001"`, `"08234"`, `"00025"`)?
4. How should the resolver interface connect with `src/server.js` and `src/draft-store.js` without blocking free-text need capture?

## Deliverable
Write your findings to `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2/analysis.md` and complete `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2/handoff.md`.
Send a completion message to the orchestrator when finished.


## 2026-10-14T10:01:13Z
Sender: ba9cb93f-aa16-41f9-a7c1-f88d790936d4
Message: You are m2_explorer_2, a Catalog Resolver Explorer for Milestone 2 of PanelPH.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m2_explorer_2
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m2_explorer_2/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Explore design and implementation for src/catalog-resolver.js to support progressive medicine catalog search and resolution while strictly preserving leading zeroes.
Write your analysis to /home/admin/PanelPH/.agents/teamwork/m2_explorer_2/analysis.md and your handoff to /home/admin/PanelPH/.agents/teamwork/m2_explorer_2/handoff.md.
Send a message back to the orchestrator when finished.

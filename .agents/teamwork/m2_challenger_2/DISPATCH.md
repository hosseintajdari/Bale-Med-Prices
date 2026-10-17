# Task Dispatch: Milestone 2 Challenger 2 — Catalog Resolver & MCP Stress Testing

## Objective
Empirically stress-test the catalog resolver (`src/catalog-resolver.js`) and MCP tools in `src/server.js`.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Architecture & Contracts: `/home/admin/PanelPH/PROJECT.md`
- Code: `/home/admin/PanelPH/src/catalog-resolver.js`, `/home/admin/PanelPH/src/server.js`

## Challenge Focus
1. Bilingual search fuzzing:
   - Search with Persian characters (آ, ی, ک, ه), Arabic variants (ي, ك), half-space (ZWNJ), mixed case, typos, special characters.
   - Leading zero preservation check: verify string type and leading zeros on `"00001"`, `"08234"`, `"00025"`.
2. MCP tools stress testing:
   - Test `search_catalog`, `check_stock`, `export_order_batch` via JSON-RPC 2.0 requests to `/mcp`.
   - Verify tool schema validation (`zod`) rejects invalid arguments with clear error messages.
3. Execute empirical tests and report findings.

## Deliverable
Write your report to `/home/admin/PanelPH/.agents/teamwork/m2_challenger_2/challenge_report.md` and complete `/home/admin/PanelPH/.agents/teamwork/m2_challenger_2/handoff.md` with explicit verdict (`APPROVE` or `REQUEST_CHANGES`).
Send your verdict and summary to the orchestrator.


## 2026-10-14T10:24:06Z
You are m2_challenger_2, an adversarial verifier for Milestone 2 of PanelPH.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m2_challenger_2
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m2_challenger_2/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Empirically stress-test bilingual catalog search (Arabic/Persian character normalization, ZWNJ, leading zeros preservation) and MCP tools via /mcp JSON-RPC.
Write your challenge report to /home/admin/PanelPH/.agents/teamwork/m2_challenger_2/challenge_report.md and handoff to /home/admin/PanelPH/.agents/teamwork/m2_challenger_2/handoff.md with an explicit verdict (APPROVE or REQUEST_CHANGES).
Send your verdict and summary back to the orchestrator.

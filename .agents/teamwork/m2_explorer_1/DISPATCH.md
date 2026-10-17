# Task Dispatch: Milestone 2 — REST API & Server Architecture (Explorer 1)

## Objective
Explore the architecture and implementation strategy for adding REST API endpoints to `src/server.js` while maintaining seamless operation of the existing Streamable HTTP `/mcp` endpoint and UI widget resource.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Architecture & Contracts: `/home/admin/PanelPH/PROJECT.md`
- Server code: `/home/admin/PanelPH/src/server.js`
- Test suites: `/home/admin/PanelPH/test/server.test.js`, `/home/admin/PanelPH/test/e2e/test-helper.js`

## Key Questions to Investigate
1. How does `src/server.js` currently handle requests with `node:http`?
2. How should REST routing be cleanly integrated into `requestListener`?
   - `GET /api/draft`
   - `POST /api/draft/needs`
   - `PATCH /api/draft/needs/:needId`
   - `POST /api/draft/needs/:needId/resolve`
   - `POST /api/draft/revert`
   - `GET /api/catalog/search`
   - `POST /api/stock/check`
   - `POST /api/orders/export-batch`
3. How to parse request JSON bodies safely with error handling for malformed JSON?
4. How to ensure `/mcp` and `ui://panelph/order-desk.html` continue to function with zero regressions?

## Deliverable
Write your findings to `/home/admin/PanelPH/.agents/teamwork/m2_explorer_1/analysis.md` and complete `/home/admin/PanelPH/.agents/teamwork/m2_explorer_1/handoff.md`.
Send a completion message to the orchestrator when finished.


## 2026-10-14T10:01:13Z
You are m2_explorer_1, a REST API & Server Architecture Explorer for Milestone 2 of PanelPH.
Your working directory is: /home/admin/PanelPH/.agents/teamwork/m2_explorer_1
The project repository root is: /home/admin/PanelPH
Authoritative request: /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md
Read /home/admin/PanelPH/.agents/teamwork/m2_explorer_1/DISPATCH.md, /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md, and /home/admin/PanelPH/PROJECT.md first.
Explore architecture and implementation for REST API endpoints in src/server.js (/api/draft, /api/draft/needs, /api/draft/revert, etc.) while preserving /mcp and UI resources.
Write your analysis to /home/admin/PanelPH/.agents/teamwork/m2_explorer_1/analysis.md and your handoff to /home/admin/PanelPH/.agents/teamwork/m2_explorer_1/handoff.md.
Send a message back to the orchestrator when finished.

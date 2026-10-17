# Task Assignment: m5_challenger_2_gen12 (Tier 5 Adversarial Stress Verifier — API, MCP & Frontend)

## Working Directory
`/home/admin/PanelPH/.agents/teamwork/m5_challenger_2_gen12`

## Mandatory Reference Documents
- `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md` (read first)
- `/home/admin/PanelPH/PROJECT.md`
- `/home/admin/PanelPH/TEST_INFRA.md`
- `/home/admin/PanelPH/TEST_READY.md`

## Focus
Adversarial stress testing of API, MCP Tools & Frontend:
1. `src/server.js`: Malformed JSON-RPC payloads, invalid tool parameters, edge cases in REST endpoints (`/api/draft/*`, `/api/catalog/*`, `/api/orders/*`), batch export discrepancies.
2. `src/catalog-resolver.js`: Extreme fuzzy search patterns, boundary drug codes, Unicode RTL characters, leading zero preservation (`00001`, `08234`, `00000`).
3. `public/order-desk.html`: Host context notification boundaries, theme rapid toggles, safety gate on unselected candidates, foreign cross-origin message rejections.
4. Author adversarial test file `test/e2e/tier5-adversarial-api-ui.test.js` using `node:test` and `node:assert/strict`.
5. Run your adversarial test file and `PANELPH_E2E_STRICT=1 node --test`.
6. Report findings, stress test results, claim ledger, and handoff to `/home/admin/PanelPH/.agents/teamwork/m5_challenger_2_gen12/handoff.md`.
7. Send completion message to orchestrator (`c9975cd4-4d89-4540-a974-dfd9e05810f7`).
## 2026-10-14T18:58:35Z
You are m5_challenger_2_gen12, a teamwork_preview_challenger assigned to perform Tier 5 adversarial stress verification on the API, MCP tools, and Frontend layer of PanelPH.
Working directory: /home/admin/PanelPH/.agents/teamwork/m5_challenger_2_gen12
Parent conversation ID: c9975cd4-4d89-4540-a974-dfd9e05810f7

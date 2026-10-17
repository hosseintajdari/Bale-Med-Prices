## 2026-10-14T10:14:00Z
You are m2_worker (teamwork_preview_worker).
Your assigned working directory is: /home/admin/PanelPH/.agents/teamwork/m2_worker_gen2

### MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

### Objective
Implement Milestone 2: Operational Backend & MCP Tools (F7, F8, F9, F10, F11) per ORIGINAL_REQUEST.md and PROJECT.md.

### Exclusive File Ownership
- `src/catalog-resolver.js` (NEW)
- `src/server.js` (MODIFY)
- `test/catalog-resolver.test.js` (NEW)
- `test/server-rest.test.js` (NEW)

### Required Reading
1. /home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md (MANDATORY)
2. /home/admin/PanelPH/PROJECT.md
3. /home/admin/PanelPH/.agents/teamwork/m2_explorer_1_gen2/handoff.md & analysis.md (REST API architecture & routing)
4. /home/admin/PanelPH/.agents/teamwork/m2_explorer_2_gen2/handoff.md & analysis.md (Catalog resolver design & zero-preservation)
5. /home/admin/PanelPH/.agents/teamwork/m2_explorer_3_gen2/handoff.md & analysis.md (Batch export, discrepancy highlighting & MCP tools)
6. /home/admin/PanelPH/src/adapters/qanoon-adapter.js (Verified Qanoon adapter methods)
7. /home/admin/PanelPH/src/draft-store.js (Draft store methods)
8. /home/admin/PanelPH/test/e2e/test-helper.js & test/e2e/tier1-feature-coverage.test.js

### Requirements & Scope
1. Implement `src/catalog-resolver.js`:
   - `searchCatalog(query, options)`: Returns candidates with `genericCode`, `brandCode`, `title`, `dosageForm`, `strength`, `score`.
   - `resolveItem(query, candidates, options)`: Returns resolution metadata (`resolved`, `confidence`, `isAmbiguous`, `bestMatch`, `candidates`, `suggestedReference`).
   - Strict string preservation of codes with leading zeroes ("00001", "08234"). NEVER convert to numbers.
   - Persian/Arabic numeral transliteration (۰-۹ -> 0-9) preserving leading zeroes.
   - Character normalization (half-space / ZWNJ, Arabic yeh/kaf).
   - Multi-tier candidate scoring in [0.0, 1.0].
   - Built-in reference items from fixtures/reference data.
2. Implement `test/catalog-resolver.test.js`:
   - Unit tests verifying code preservation ("00001"), Persian numerals ("۰۰۰۰۱"), scoring, and resolveItem.
3. Update `src/server.js`:
   - Add CORS & preflight `OPTIONS` returning 204 for all endpoints (`/mcp`, `/api/*`).
   - Implement REST endpoints natively using `node:http`:
     - `GET /api/draft`: Returns `{ draft: {...} }`
     - `POST /api/draft/needs`: Adds free-text need, returns `201 { draft, need }`
     - `PATCH /api/draft/needs/:needId`: Updates need, returns `200 { draft }`
     - `POST /api/draft/needs/:needId/resolve`: Resolves need with catalog reference, returns `200 { draft }`
     - `POST /api/draft/revert`: Reverts event, returns `200 { draft }`
     - `GET /api/catalog/search?q=...`: Searches catalog via catalog-resolver, returns `200 { results: [...] }`
     - `POST /api/stock/check`: Checks stock via qanoon adapter, returns `200 { inStock, availableCount, ... }`
     - `POST /api/orders/export-batch`: Validates draft, detects discrepancies (empty draft, unresolved items, inventory shortages via adapter), returns `200 { batch, discrepancies, ... }`
   - Register new MCP tools: `search_catalog`, `check_stock`, `export_order_batch`.
   - Maintain 100% backward compatibility for `/mcp` and UI resource `ui://panelph/order-desk.html`.
4. Implement `test/server-rest.test.js`:
   - Unit and integration tests for all REST endpoints, CORS preflight, error handling.
5. Verification:
   - Run `npm test` (`node --test`).
   - All tests must pass: 85 passed, 0 skipped, 0 failed.
   - Un-skip both `F9` and `F11` in test runs.

### Deliverables
- Write `progress.md` with step-by-step progress and verification logs.
- Write `handoff.md` with 5 components: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
- Send completion message to orchestrator.

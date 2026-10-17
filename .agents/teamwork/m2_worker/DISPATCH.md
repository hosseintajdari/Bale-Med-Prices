# Task Dispatch: Milestone 2 Worker — Operational Backend & MCP Tools

## Objective
Implement Milestone 2:
1. Progressive medicine catalog resolution engine in `src/catalog-resolver.js`.
2. REST API endpoints, expanded MCP tools, and batch export with discrepancy highlighting in `src/server.js`.
3. Unit and integration test suites in `test/catalog-resolver.test.js` and `test/server-rest.test.js`.

## Authoritative Inputs
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Architecture & Contracts: `/home/admin/PanelPH/PROJECT.md`
- Explorer 1 (REST Architecture): `/home/admin/PanelPH/.agents/teamwork/m2_explorer_1/analysis.md`
- Explorer 2 (Catalog Resolver): `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2/analysis.md`
- Explorer 3 (MCP Tools & Batch Export): `/home/admin/PanelPH/.agents/teamwork/m2_explorer_3/analysis.md`
- Qanoon Adapter: `/home/admin/PanelPH/src/adapters/qanoon-adapter.js`
- Fixtures: `/home/admin/PanelPH/fixtures/qanoon-mock-data.json`, `/home/admin/PanelPH/fixtures/catalog.sample.json`

## File Ownership (Strict Write Boundaries)
You exclusively own and may create/edit these files:
- `src/catalog-resolver.js`
- `src/server.js`
- `test/catalog-resolver.test.js`
- `test/server-rest.test.js`
Do NOT modify `src/adapters/qanoon-adapter.js`, `public/order-desk.html`, or files owned by other milestones.

## Implementation Details

### 1. Catalog Resolver (`src/catalog-resolver.js`)
- Export `searchCatalog(query, catalogData)` and `createCatalogResolver(catalogData)`.
- Support bilingual query search (English, Persian) with orthographic normalization (Arabic kaf/yeh, ZWNJ, numerals).
- Invariant: strictly preserve leading zeroes on genericCode (`"00001"`) and brandCode (`"08234"`). Never parse or cast codes to numbers.
- Return structured matches sorted by relevance score.

### 2. Operational REST API (`src/server.js`)
- Handle `OPTIONS` preflight requests for all `/api/*` routes with appropriate CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization`).
- Endpoints:
  - `GET /api/draft`: Returns `{ draft: {...} }`.
  - `POST /api/draft/needs`: Free-text capture (`rawText`, `quantity`, `unit`, `note`). Returns 201 `{ draft: {...}, need: {...} }`.
  - `PATCH /api/draft/needs/:needId`: Update need fields.
  - `POST /api/draft/needs/:needId/resolve`: Resolve need with catalog reference.
  - `POST /api/draft/revert`: Revert event by `eventId` (appending compensating event).
  - `GET /api/catalog/search?q=...`: Search catalog via `catalogResolver`.
  - `POST /api/stock/check`: Check stock via `qanoonAdapter.checkStock`.
  - `POST /api/orders/export-batch`: Run batch export lifecycle:
    1. Validate draft items (flag unresolved needs).
    2. Check stock via `qanoonAdapter.checkBatchStock`.
    3. Calculate prices & TTAC divergences via `qanoonAdapter.calculatePrice`.
    4. Compile list of discrepancies.
    5. Call `qanoonAdapter.createBatchOrder` with stable/provided `uniqueId`.
    6. Return 200 `{ success, batch, discrepancies, status }`.
- JSON error handling: safely parse body, return 400 on malformed JSON, return appropriate 404/500 on errors.
- Ensure Streamable HTTP `/mcp` endpoint and UI resource `ui://panelph/order-desk.html` continue functioning without regression.

### 3. MCP Tools Expansion (`src/server.js`)
- Preserve existing tools: `get_order_draft`, `add_order_need`, `update_order_need`, `resolve_order_need`, `revert_order_event`, `render_order_desk`.
- Register 3 new tools:
  - `search_catalog`: Search medicine catalog.
  - `check_stock`: Query stock availability and FEFO expiration.
  - `export_order_batch`: Export order batch with discrepancy detection.

### 4. Verification
- Implement unit tests in `test/catalog-resolver.test.js` and `test/server-rest.test.js`.
- Run `node --test` to verify 100% test pass rate (all 85 repository tests including Tier 1 F9 and F11 must pass, 0 failed, 0 skipped, exit code 0).

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Deliverables
- Implementation files in `src/` and `test/`.
- Handoff report at `/home/admin/PanelPH/.agents/teamwork/m2_worker/handoff.md`.
- Send message to orchestrator with test results and summary.

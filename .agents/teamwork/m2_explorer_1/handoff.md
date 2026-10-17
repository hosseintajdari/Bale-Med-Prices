# Milestone 2 Handoff Report: REST API & Server Architecture

**Agent**: `m2_explorer_1`  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m2_explorer_1`  
**Handoff Type**: Hard (Task Complete)  
**Date**: 2026-10-14  

---

## 1. Observation

1. **Monolithic Path Guard in `src/server.js` (lines 165-168)**:
   ```javascript
   const methods = new Set(["POST", "GET", "DELETE"]);
   if (url.pathname !== mcpPath || !methods.has(request.method ?? "")) {
     return response.writeHead(404).end("Not Found");
   }
   ```
   Any request with `url.pathname !== "/mcp"` (except `GET /` at line 152) returns `404 Not Found`.

2. **Endpoint Availability Probing in `test/e2e/test-helper.js` (lines 51-59)**:
   ```javascript
   export async function isEndpointAvailable(baseUrl, path) {
     try {
       const res = await fetch(`${baseUrl}${path}`, { method: "OPTIONS" });
       if (res.status === 404) return false;
       return true;
     } catch {
       return false;
     }
   }
   ```
   E2E suites use HTTP `OPTIONS` requests to detect whether REST endpoints are mounted. Because `src/server.js:155-163` only handles `OPTIONS` for `url.pathname === mcpPath`, any `OPTIONS` request to `/api/*` returns 404, triggering test skips.

3. **Current E2E Test Suite Status (`node --test test/e2e/*.test.js`)**:
   ```
   ▶ Tier 1: Feature Coverage (Core Functional Baseline)
     ...
     ﹣ F9: Operational REST API endpoints (/api/draft/*) (44.676427ms) # REST API endpoint /api/draft not yet mounted (Milestone 2 dependency)
     ...
     ﹣ F11: Order Batch Generation & Discrepancy Highlighting (27.462912ms) # Batch export endpoint /api/orders/export-batch not yet mounted (Milestone 2 dependency)
     ...
   ℹ tests 41
   ℹ suites 0
   ℹ pass 39
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 2
   ℹ todo 0
   ℹ duration_ms 3224.51848
   ```
   Both skipped tests directly depend on Milestone 2 REST endpoints mounted in `src/server.js`.

4. **Package Dependencies in `package.json` (lines 14-18)**:
   ```json
   "dependencies": {
     "@modelcontextprotocol/ext-apps": "^1.0.1",
     "@modelcontextprotocol/sdk": "^1.20.2",
     "zod": "^3.25.76"
   }
   ```
   The project has no Express, Fastify, or external routing middleware. All REST routing and body parsing must be built using native Node.js ESM standard library modules (`node:http`, `node:url`).

5. **Existing Unit Test Baseline (`node --test test/*.test.js`)**:
   ```
   ℹ tests 43
   ℹ suites 0
   ℹ pass 43
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ duration_ms 993.176073
   ```
   All 43 unit tests (including `test/server.test.js` and `test/qanoon-adapter.test.js`) pass with 100% green results.

6. **MCP Streamable Transport Lifecycle in `src/server.js` (lines 172-184)**:
   ```javascript
   const server = createPanelServer();
   const transport = new StreamableHTTPServerTransport({
     sessionIdGenerator: undefined,
     enableJsonResponse: true,
   });
   response.on("close", () => {
     transport.close();
     server.close();
   });
   await server.connect(transport);
   await transport.handleRequest(request, response);
   ```
   `StreamableHTTPServerTransport` consumes raw request/response streams. If request body streaming is intercepted or read before `/mcp` handling, MCP calls will fail or hang.

---

## 2. Logic Chain

1. From **Observation 4**, PanelPH relies exclusively on native `node:http`. Introducing an external framework like Express would violate project dependencies and require unnecessary package modifications. Therefore, REST routing must use a clean, native `node:http` dispatcher.
2. From **Observation 1**, non-`/mcp` requests return 404 because line 166 acts as an unconditional blocker. To mount `/api/*`, the request listener must inspect `url.pathname` and branch into either `/mcp`, `/api/*`, or static routes before hitting the fallback 404.
3. From **Observation 2**, `isEndpointAvailable()` tests endpoint presence by sending an `OPTIONS` request. If `/api/*` endpoints do not respond with status 200 or 204 to `OPTIONS`, E2E tests will continue to skip F9 and F11. Therefore, the server must implement global CORS preflight handling for `/api/*` returning `204 No Content` with `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`.
4. From **Observation 6**, `StreamableHTTPServerTransport` consumes raw request streams. If body parsing middleware consumes `request` before checking if the route is `/mcp`, MCP functionality will regress. Therefore, body parsing via `readJsonBody()` must only be called **inside** matched REST route handlers for mutating methods (`POST`, `PATCH`), completely preserving the untouched stream for `/mcp`.
5. From **Observation 3**, enabling the 8 REST endpoints specified in `PROJECT.md` (`GET /api/draft`, `POST /api/draft/needs`, `PATCH /api/draft/needs/:needId`, `POST /api/draft/needs/:needId/resolve`, `POST /api/draft/revert`, `GET /api/catalog/search`, `POST /api/stock/check`, `POST /api/orders/export-batch`) will immediately un-skip and satisfy both `F9` and `F11` in `test/e2e/tier1-feature-coverage.test.js`.
6. From **Observation 5**, maintaining the `createPanelServer` resource registration `registerAppResource(server, "panelph-order-desk", WIDGET_URI, ...)` and `GET /` text response ensures that the 43 existing unit tests remain 100% green.

---

## 3. Caveats

1. **Catalog Resolver Status**: `src/catalog-resolver.js` is not yet created on disk. The REST endpoint `GET /api/catalog/search` should check whether `catalogResolver` is injected or imported, falling back to `adapter.searchGoods({ query: q, limit })` so that catalog search works seamlessly before and after `src/catalog-resolver.js` is implemented by the M2 Worker.
2. **Draft Store Mutex**: `src/draft-store.js` mutex queue concurrency is part of Milestone 3. In Milestone 2, `store.addNeed`, `store.updateNeed`, and `store.resolveNeed` operate synchronously on in-memory/persisted state, which is sufficient for M2 single-request flows.
3. **Leading-Zero Code Preservation**: Both `POST /api/draft/needs/:needId/resolve` and `GET /api/catalog/search` must preserve leading zeroes on codes (e.g., `"00001"`, `"08234"`). Coercing these to numbers will cause E2E test failures (`T2_05`).

---

## 4. Conclusion

1. `src/server.js` should be updated to a dual-protocol architecture routing `/mcp` to `StreamableHTTPServerTransport` and `/api/*` to native REST route handlers.
2. The 8 required REST endpoints must be implemented as documented in `analysis.md`:
   - `GET /api/draft` -> 200 `{ draft }`
   - `POST /api/draft/needs` -> 201 `{ draft, need }` with `Location` header
   - `PATCH /api/draft/needs/:needId` -> 200 `{ draft }` (or 404)
   - `POST /api/draft/needs/:needId/resolve` -> 200 `{ draft }` preserving string codes
   - `POST /api/draft/revert` -> 200 `{ draft }` with compensating event
   - `GET /api/catalog/search?q=...` -> 200 `{ results }`
   - `POST /api/stock/check` -> 200 stock availability object via `QanoonAdapter`
   - `POST /api/orders/export-batch` -> 200 `{ batch, discrepancies }`
3. A safe `readJsonBody(request, { maxBytes })` helper must be used for mutating REST routes, rejecting payloads > 1MB with `413` and malformed JSON with `400 Bad Request`.
4. CORS preflight (`OPTIONS`) must return 204 for `/api/*` to enable browser clients and pass `isEndpointAvailable()` in E2E tests.
5. All detailed route specifications, schemas, error formats, and architectural diagrams are preserved in `/home/admin/PanelPH/.agents/teamwork/m2_explorer_1/analysis.md`.

---

## 5. Verification Method

To verify these conclusions and validate the implementation when performed:

1. **Verify Unit Test Suite**:
   ```bash
   node --test test/*.test.js
   ```
   *Expected result*: Exit code 0, 43 passing tests. Zero regressions on MCP initialization and tools.

2. **Verify E2E Test Suite (Milestone 2 Unskipping)**:
   ```bash
   node --test test/e2e/tier1-feature-coverage.test.js
   ```
   *Expected result*: Exit code 0. Tests `F9: Operational REST API endpoints (/api/draft/*)` and `F11: Order Batch Generation & Discrepancy Highlighting` transition from `skipped` to `pass`.

3. **Verify Boundary Cases (Malformed JSON & CORS)**:
   ```bash
   node --test test/e2e/tier2-boundary-corner.test.js
   ```
   *Expected result*: Test `T2_14: Malformed JSON payload handling on server` and `T2_05: String preservation of leading zeros` pass with exit code 0.

4. **Verify Implementation File Inspection**:
   - Inspect `src/server.js` to ensure `readJsonBody()` is called only inside `/api/*` handlers and never before `/mcp`.
   - Inspect `test/server-rest.test.js` to ensure comprehensive integration test coverage for all 8 REST endpoints.

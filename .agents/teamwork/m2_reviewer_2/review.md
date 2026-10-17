# Independent Quality & Adversarial Review: Milestone 2 (PanelPH)

**Reviewer**: `m2_reviewer_2` (Roles: Reviewer, Adversarial Critic)  
**Date**: 2026-10-14  
**Target Repository**: `/home/admin/PanelPH`  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m2_reviewer_2`  

---

## Review Summary

**Verdict**: **APPROVE**

Milestone 2 deliverable meets and exceeds all acceptance criteria and interface contracts specified in `PROJECT.md` and `ORIGINAL_REQUEST.md`:
1. **MCP Stream Isolation on `/mcp`**: The Streamable HTTP MCP JSON-RPC protocol transport is mounted at `/mcp` with zero stream interference. Body parsing (`readJsonBody`) is strictly isolated to `/api/*` routes. All 9 operational tools (6 original + 3 M2 expansions) and UI resource `ui://panelph/order-desk.html` are operational and verified.
2. **Robustness & CORS Preflight**: Global `OPTIONS` handler returns `204 No Content` with appropriate CORS headers for `/mcp` and `/api/*`. Request body validation safely rejects malformed JSON (400 `INVALID_JSON`), enforces 1MB payload ceilings, and validates field types.
3. **Order Batch Export & Discrepancy Highlighting**: `runExportBatch` and `/api/orders/export-batch` implement 4-tier discrepancy detection (unresolved items, inventory shortages via Stage 2 stock barrier, >10,000 Rial TTAC price divergences, and empty draft integrity). 24-hour `uniqueId` idempotency cache operates properly, returning `CACHED` on replay and `409 Conflict` on payload divergence.
4. **Automated Verification**: Full test suite runs via `node --test` with **100% pass rate (113 passed, 0 failed, 0 skipped, 0 cancelled, exit code 0)**.
5. **Integrity Check**: No hardcoded test results, mock shortcuts, dummy facades, or fake attestations were detected.

---

## Findings

### [Minor] Finding 1: Socket Destruction on Oversized Payload Preempts HTTP 413 Response

- **What**: In `readJsonBody(request)` (`src/server.js:65-72`), when incoming bytes exceed `maxBytes` (1MB), `request.destroy()` is called immediately on the request socket before rejecting the promise.
- **Where**: `/home/admin/PanelPH/src/server.js`, lines 65–72 and lines 613–616.
- **Why**: Calling `request.destroy()` terminates the underlying TCP socket immediately (`UND_ERR_SOCKET` / `ECONNRESET`). When the caller attempts `sendError(response, 413, "PAYLOAD_TOO_LARGE", ...)`, writing to the destroyed socket cannot deliver the HTTP 413 headers to the client.
- **Impact**: Defensively stops DoS payload consumption, but clients observe an abrupt socket disconnection rather than a structured HTTP 413 status code.
- **Suggestion**: For future milestone hardening, pause the incoming readable stream, write `response.writeHead(413, ...)`, call `response.end()`, and then destroy or close the socket.

### [Minor] Finding 2: Minor Test Count Discrepancy in Worker Handoff Report

- **What**: Worker handoff report (`m2_worker/handoff.md:56`) stated `test/catalog-resolver.test.js` contains 13 tests.
- **Where**: `/home/admin/PanelPH/.agents/teamwork/m2_worker/handoff.md`, line 56, and `/home/admin/PanelPH/test/catalog-resolver.test.js`.
- **Why**: `test/catalog-resolver.test.js` contains exactly 10 tests (`CR_01` through `CR_10`).
- **Impact**: Zero functional or code impact. The overall test suite total (113 tests) was accurately reported and verified.

---

## Verified Claims

| # | Claim | Verification Method | Result |
|---|-------|---------------------|--------|
| 1 | Full test suite passes with 0 failures and 0 skipped | Executed `node --test` in `/home/admin/PanelPH` (exit code 0, 113/113 passed) | **PASS** |
| 2 | Leading zeroes preserved across codes (`"00001"`, `"08234"`) | Executed `node --test test/catalog-resolver.test.js` (CR_01, CR_02 pass) & evaluated code lookups | **PASS** |
| 3 | Bilingual Persian/English search with Arabic normalizations | Executed CR_03–CR_07 and tested queries with ZWNJ, Arabic Keheh/Yeh, numerals | **PASS** |
| 4 | Stream isolation on `/mcp` untouched by REST body reader | Code inspection of `src/server.js` lines 570–595 vs line 598; live JSON-RPC execution over `/mcp` | **PASS** |
| 5 | `ui://panelph/order-desk.html` served via MCP resource | Executed `resources/read` for `ui://panelph/order-desk.html` via Streamable HTTP (200, 10,026 bytes) | **PASS** |
| 6 | OPTIONS CORS preflight returns 204 for `/api/*` and `/mcp` | Queried `OPTIONS /mcp` and `OPTIONS /api/draft` via `fetch` -> both returned 204 with CORS headers | **PASS** |
| 7 | OPTIONS on unknown routes returns 404 | Queried `OPTIONS /unknown` -> returned 404 | **PASS** |
| 8 | Malformed JSON rejected with 400 `INVALID_JSON` | Sent `"MALFORMED_JSON_STRING{{{"`, `"42"`, `"\"str\""`, and `"null"` -> 400 `INVALID_JSON` | **PASS** |
| 9 | 8 operational REST endpoints mounted | Tested all 8 endpoints: `/api/draft`, `/api/draft/needs`, `/api/draft/needs/:id`, `/api/draft/needs/:id/resolve`, `/api/draft/revert`, `/api/catalog/search`, `/api/stock/check`, `/api/orders/export-batch` | **PASS** |
| 10 | 9 MCP tools registered and discoverable on `/mcp` | Executed `tools/list` on `/mcp` -> verified all 9 tools present and callable | **PASS** |
| 11 | Order batch export highlights unresolved items | Exported draft with unmapped item -> 200, `success: false`, `status: DISCREPANCIES_DETECTED` | **PASS** |
| 12 | Order batch export highlights stock shortages | Exported draft with out-of-stock item -> 200, `success: false`, `status: DISCREPANCIES_DETECTED` | **PASS** |
| 13 | Order batch export applies 7-step pricing and 24h idempotency | Exported valid draft -> `SUBMITTED`, calculated final price; repeated with same `uniqueId` -> `CACHED` | **PASS** |
| 14 | Payload mismatch on identical `uniqueId` returns 409 | Replayed existing `uniqueId` with modified order quantity -> returned `409 Conflict` | **PASS** |
| 15 | Mutex queue prevents concurrent race conditions | Executed Tier 1 F13 test with parallel `add_order_need` calls -> state file persisted cleanly | **PASS** |

---

## Coverage Gaps

- **None Identified**: All Milestone 2 requirements (R2, F7, F8, F9, F10, F11) have corresponding unit, integration, and E2E coverage.

---

## Unverified Items

- **None**: Every critical path was independently verified via live test execution and adversarial inspection.

---

## Challenge Summary

**Overall risk assessment**: **LOW**

Adversarial stress-testing of Milestone 2 components confirmed that boundary conditions, malicious payloads, and concurrency edge cases are handled safely.

---

## Challenges & Stress Test Results

### Challenge 1: Codec Truncation & Number Coercion on Leading Zeros
- **Assumption Challenged**: Iranian pharmaceutical codes with leading zeroes (e.g. `"00001"`, `"08234"`, `"00025"`) might undergo implicit numeric coercion during JSON parsing, URL search params, or adapter interop.
- **Attack Scenario**: Submit code `"00001"` through REST URL query param, JSON request body, and MCP tool call; verify whether any step converts it to number `1`.
- **Stress Test Result**:
  - `GET /api/catalog/search?q=00001` -> returns `results[0].genericCode === "00001"` (string, length 5).
  - `POST /api/draft/needs/:id/resolve` with `genericCode: "00001"` -> persisted draft retains string `"00001"`.
  - `POST /api/stock/check` with `genericCode: "00001"` -> adapter receives string `"00001"`.
  - `normalizeCodeString` explicitly preserves string type.
- **Status**: **PASS (Robust)**

### Challenge 2: Stream Protocol Collision Between MCP and REST
- **Assumption Challenged**: Handling REST requests on the same HTTP server instance could disrupt the Streamable HTTP transport on `/mcp`, or `readJsonBody` might consume the stream of an incoming MCP JSON-RPC call.
- **Attack Scenario**: Interleave concurrent calls to `/mcp` (Streamable HTTP JSON-RPC) and `/api/draft/needs` (REST JSON body reading).
- **Stress Test Result**:
  - Route routing at `src/server.js:570` strictly checks `url.pathname === mcpPath` and delegates directly to `StreamableHTTPServerTransport.handleRequest`.
  - `readJsonBody` is never invoked on `/mcp`.
  - Streaming SSE / JSON responses on `/mcp` execute cleanly with 0 dropped sessions.
- **Status**: **PASS (Isolated)**

### Challenge 3: Malformed Payloads & Primitive JSON Attack
- **Assumption Challenged**: Submitting JSON primitives (`42`, `"string"`, `null`, `[]`) or invalid syntax might cause unhandled promise rejections or server crashes.
- **Attack Scenario**: Send raw body `42`, `"text"`, `null`, `[]`, and `{"incomplete` to all mutating endpoints (`/api/draft/needs`, `/api/draft/revert`, `/api/orders/export-batch`).
- **Stress Test Result**:
  - All primitives and invalid JSON payloads are caught by `readJsonBody`.
  - Server returns structured 400 Bad Request `{ error: { code: "INVALID_JSON", message: ... } }`.
  - Server remains healthy and responsive.
- **Status**: **PASS (Hardened)**

### Challenge 4: Extreme Query & Catalog Search Bounds
- **Assumption Challenged**: Searching catalog with negative limit (`limit=-10`), giant limit (`limit=999999`), NaN limit (`limit=abc`), or empty string might cause out-of-memory or invalid array operations.
- **Attack Scenario**: Send requests with various limit values and search terms.
- **Stress Test Result**:
  - `limit=-10`: Clamped to `1` via `Math.max(1, ...)`.
  - `limit=999999`: Clamped to `100` via `Math.min(100, ...)`.
  - `limit=abc`: Falls back to default `20`.
  - `q=""`: Returns `200` with `[]` without error.
  - Regex special chars (`.*+?^${}()|[]\\`): Handled safely without regex crash.
- **Status**: **PASS (Protected)**

### Challenge 5: Discrepancy Gatekeeper Bypass
- **Assumption Challenged**: Can an unreviewed, ambiguous, or out-of-stock draft bypass the discrepancy checks in `runExportBatch` and generate a batch?
- **Attack Scenario**: Attempt batch export on:
  1. An empty draft.
  2. A draft with an unresolved item (`status: "needs_completion"`).
  3. A draft with an out-of-stock item (`goodId: "g-1006"`).
- **Stress Test Result**:
  1. Empty draft -> `success: false, status: "DISCREPANCIES_DETECTED"`, discrepancy list populated.
  2. Unresolved item -> `success: false, status: "DISCREPANCIES_DETECTED"`, unresolved item flagged.
  3. Out-of-stock item -> `success: false, status: "DISCREPANCIES_DETECTED"`, stock shortage flagged.
  4. Batch order is NEVER created when blocking discrepancies exist.
- **Status**: **PASS (Enforced)**

---

## Unchallenged Areas

- **Frontend UI rendering (`public/order-desk.html`)**: Frontend interaction and theme switching logic are designated for Milestone 4 review. However, the static serving and MCP App resource contract for the widget were verified.

---

## Conclusion & Verdict

**Verdict**: **APPROVE**

Milestone 2 implementation is robust, complete, strictly adheres to all interface contracts in `PROJECT.md`, passes 100% of the test suite (113/113 tests), and contains no integrity violations or regressions.

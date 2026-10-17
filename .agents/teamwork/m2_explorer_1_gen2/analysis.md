# Milestone 2 Architectural Analysis: REST API Routing & Server Architecture

**Author**: `m2_explorer_1` (Teamwork Explorer, Generation 2)  
**Date**: 2026-10-14  
**Assigned Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m2_explorer_1_gen2`  
**Primary Target**: `src/server.js`  
**Key References**: `ORIGINAL_REQUEST.md`, `PROJECT.md`, `PRD.md`, `test/e2e/test-helper.js`, `test/e2e/tier1-feature-coverage.test.js`

---

## 1. Executive Summary & Problem Scope

PanelPH is designed as a hybrid, dual-protocol pharmacy operational layer:
1. **Model Context Protocol (MCP)**: Streamable HTTP transport at `/mcp` using `@modelcontextprotocol/sdk` and `@modelcontextprotocol/ext-apps`, exposing tools (`get_order_draft`, `add_order_need`, `update_order_need`, `resolve_order_need`, `revert_order_event`, `render_order_desk`) and delivering the interactive pharmacist widget (`ui://panelph/order-desk.html`).
2. **Operational REST API**: Mounted at `/api/*` over standard HTTP verbs (`GET`, `POST`, `PATCH`, `OPTIONS`), serving web browser UI components, integration testing harnesses, and external pharmacy subsystems.

### Current Gap
In the current baseline (`src/server.js`), only `GET /` and `/mcp` routes exist. Any request directed to `/api/*` is abruptly rejected at line 166 with `404 Not Found`. Consequently, in `npm test` (`test/e2e/tier1-feature-coverage.test.js`), two primary functional tests are skipped:
- `F9: Operational REST API endpoints (/api/draft/*)` (line 206)
- `F11: Order Batch Generation & Discrepancy Highlighting` (line 298)

This analysis provides the complete architectural design, routing logic, request body parsing mechanics, CORS preflight strategy, error envelopes, and zero-regression safeguards necessary for the M2 Worker to successfully implement Milestone 2.

---

## 2. Existing Request Flow Analysis in `src/server.js`

### 2.1 Current Implementation Trace
`src/server.js:146-192` defines `startServer({ port = Number(process.env.PORT ?? 8787) } = {})`:
```javascript
const httpServer = createServer(async (request, response) => {
  if (!request.url) return response.writeHead(400).end("Missing URL");
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/") {
    return response.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("PanelPH MCP App");
  }
  if (request.method === "OPTIONS" && url.pathname === mcpPath) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    return response.end();
  }

  const methods = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname !== mcpPath || !methods.has(request.method ?? "")) {
    return response.writeHead(404).end("Not Found");
  }
  // MCP StreamableHTTPServerTransport handling ...
});
```

### 2.2 Critical Limitations & Hazards
1. **Hard Path Blocker (Line 166)**:
   `if (url.pathname !== mcpPath || !methods.has(request.method ?? ""))` unconditionally short-circuits any non-`/mcp` URL to `404 Not Found`.
2. **CORS Preflight Restricted to `/mcp` (Lines 155-163)**:
   Preflight `OPTIONS` requests are handled exclusively when `url.pathname === "/mcp"`. In `test/e2e/test-helper.js:51-59`, `isEndpointAvailable(baseUrl, path)` probes endpoints by dispatching an `OPTIONS` request. Because `/api/*` currently yields 404 on `OPTIONS`, the test runner assumes the endpoint is absent and skips the tests.
3. **Absence of Request Body Parsing for REST**:
   While the MCP SDK handles stream parsing internally via `StreamableHTTPServerTransport`, REST `POST` and `PATCH` requests require an asynchronous streaming JSON body parser with byte length caps to prevent memory leaks and unhandled exceptions on malformed input.
4. **Premature Stream Consumption Hazard**:
   Node.js HTTP request streams can only be read once. If a global body parser attempts to buffer all requests before inspecting `url.pathname`, incoming `/mcp` requests will fail or hang because the underlying stream is drained before reaching `StreamableHTTPServerTransport`.

---

## 3. E2E Test Suite & Test-Helper Integration Analysis

### 3.1 Probing Mechanism in `test/e2e/test-helper.js`
In `test/e2e/test-helper.js:51-59`:
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
**Rule**: Any `/api/*` endpoint MUST respond to `OPTIONS` with a non-404 status (specifically `204 No Content` with appropriate `Access-Control-Allow-*` headers). If it returns 404, `isEndpointAvailable` evaluates to `false`.

### 3.2 REST Client Expectations in `test-helper.js`
`test-helper.js:138-180` constructs a `restClient` with `get(path)`, `post(path, payload, customHeaders)`, and `patch(path, payload)`:
- `headers: { "accept": "application/json" }` on GET.
- `headers: { "content-type": "application/json", "accept": "application/json" }` on POST and PATCH.
- Automatic response body parsing if `content-type` includes `application/json`.
- Therefore, all REST endpoints must return `Content-Type: application/json; charset=utf-8` and `Access-Control-Allow-Origin: *`.

### 3.3 Test Invariants from `tier1-feature-coverage.test.js`
1. **F9 (`/api/draft/*`)**:
   ```javascript
   const draftRes = await env.restClient.get("/api/draft");
   assert.equal(draftRes.status, 200);
   assert.ok(draftRes.body?.draft);

   const addRes = await env.restClient.post("/api/draft/needs", {
     name: "پماد زینک اکساید",
     quantity: 2,
     unit: "تیوب",
   });
   assert.equal(addRes.status, 201);
   assert.equal(addRes.body?.need?.freeTextName, "پماد زینک اکساید");
   ```
2. **F11 (`/api/orders/export-batch`)**:
   ```javascript
   await env.mcpClient.callTool("add_order_need", { name: "مورد مبهم", quantity: 1 });
   const exportRes = await env.restClient.post("/api/orders/export-batch", {
     draftId: "current-order-draft",
   });
   assert.equal(exportRes.status, 200);
   assert.ok(exportRes.body.discrepancies?.length > 0, "Unresolved items must be flagged as discrepancies");
   ```

---

## 4. REST API Endpoint Specifications & Routing Contracts

The REST interface contains 8 required endpoints defined in `PROJECT.md:73-82`:

| # | HTTP Method | Path Pattern | Success Code | Request Body / Query | Response Payload |
|---|---|---|---|---|---|
| 1 | `GET` | `/api/draft` | `200 OK` | None | `{ draft: Draft }` |
| 2 | `POST` | `/api/draft/needs` | `201 Created` | `{ name, quantity, unit?, note? }` | `{ draft: Draft, need: NeedItem }` |
| 3 | `PATCH` | `/api/draft/needs/:needId` | `200 OK` | `{ name?, quantity?, unit?, note? }` | `{ draft: Draft }` |
| 4 | `POST` | `/api/draft/needs/:needId/resolve` | `200 OK` | `{ reference: CatalogRef }` | `{ draft: Draft }` |
| 5 | `POST` | `/api/draft/revert` | `200 OK` | `{ eventId: string }` | `{ draft: Draft }` |
| 6 | `GET` | `/api/catalog/search` | `200 OK` | `?q=...&limit=...` | `{ results: Array<CatalogItem> }` |
| 7 | `POST` | `/api/stock/check` | `200 OK` | `{ genericCode?, brandCode?, goodId?, requestedCount?, warehouseId? }` | `{ inStock: boolean, availableCount: number, ... }` |
| 8 | `POST` | `/api/orders/export-batch` | `200 OK` | `{ draftId?, warehouseId? }` | `{ batch: BatchObject, discrepancies: Array<string> }` |

### Detailed Contract Specifications

#### 1. `GET /api/draft`
- **Method & Path**: `GET /api/draft`
- **Behavior**: Retrieves current draft with summary (`itemCount`, `ambiguityCount`).
- **Store Call**: `await store.getDraft()`
- **Response**: `200 OK`
  ```json
  {
    "draft": {
      "id": "current-order-draft",
      "status": "open",
      "items": [],
      "events": [],
      "createdAt": "2026-10-14T...",
      "updatedAt": "2026-10-14T...",
      "summary": { "itemCount": 0, "ambiguityCount": 0 }
    }
  }
  ```

#### 2. `POST /api/draft/needs`
- **Method & Path**: `POST /api/draft/needs`
- **Behavior**: Free-text capture without catalog restriction (R2, F7).
- **Validation**:
  - `name`: string, trimmed length >= 1. Whitespace or empty returns `400 Bad Request`.
  - `quantity`: positive finite number (> 0). Zero, negative, non-numeric returns `400 Bad Request`.
  - `unit`: optional string, default `""`.
  - `note`: optional string, default `""`.
- **Store Call**: `await store.addNeed({ name, quantity, unit, note })`
- **Response**: `201 Created`
  - Headers: `Location: /api/draft/needs/${need.id}`
  - Body: `{ draft: <updatedDraft>, need: <addedItem> }`
  - Note: `store.addNeed` appends to `draft.items`. The added item is `draft.items[draft.items.length - 1]`.

#### 3. `PATCH /api/draft/needs/:needId`
- **Method & Path**: `PATCH /api/draft/needs/:needId` (URL regex: `/^\/api\/draft\/needs\/([^/]+)$/`)
- **Behavior**: Updates editable fields of an existing need.
- **Validation**:
  - `needId`: must exist in `draft.items`. If not found, returns `404 Not Found`.
  - If `name` is provided, must be non-empty after trimming (else 400).
  - If `quantity` is provided, must be positive finite number (else 400).
- **Store Call**: `await store.updateNeed({ id: needId, name, quantity, unit, note })`
- **Response**: `200 OK` `{ draft: <updatedDraft> }`

#### 4. `POST /api/draft/needs/:needId/resolve`
- **Method & Path**: `POST /api/draft/needs/:needId/resolve` (URL regex: `/^\/api\/draft\/needs\/([^/]+)\/resolve$/`)
- **Behavior**: Binds an ambiguous need to a confirmed catalog reference (R2, F8).
- **Validation**:
  - `needId`: must exist in `draft.items`. If not found, returns `404 Not Found`.
  - `reference`: must have non-empty `title`. If missing, returns `400 Bad Request`.
  - **Leading Zero Invariant**: `genericCode` and `brandCode` must remain exact string representations (`"00001"`, `"08234"`). Numeric coercion (`1`, `8234`) is strictly forbidden.
- **Store Call**:
  ```javascript
  const cleanRef = {
    title: reference.title.trim(),
    genericCode: reference.genericCode != null ? String(reference.genericCode).trim() : "",
    brandCode: reference.brandCode != null ? String(reference.brandCode).trim() : "",
    dosageForm: reference.dosageForm != null ? String(reference.dosageForm).trim() : "",
    strength: reference.strength != null ? String(reference.strength).trim() : "",
  };
  const draft = await store.resolveNeed({ id: needId, reference: cleanRef });
  ```
- **Response**: `200 OK` `{ draft: <updatedDraft> }`

#### 5. `POST /api/draft/revert`
- **Method & Path**: `POST /api/draft/revert`
- **Behavior**: Appends a compensating `event_reverted` event, reversing the targeted event without truncating audit history (R4, F12).
- **Validation**:
  - `eventId`: string, required. If missing, returns `400 Bad Request`.
  - If `eventId` is not found in `draft.events`, returns `404 Not Found`.
- **Store Call**: `await store.revertEvent({ eventId })`
- **Response**: `200 OK` `{ draft: <updatedDraft> }`

#### 6. `GET /api/catalog/search`
- **Method & Path**: `GET /api/catalog/search?q=...&limit=...`
- **Behavior**: Searches medicine catalog goods by title, generic code, brand code, or alias (F8).
- **Resolver Call**:
  - Uses `catalogResolver.searchCatalog(q, { limit })` if available, or falls back to `adapter.searchGoods({ query: q, limit })`.
  - Strings with leading zeros (`"00001"`, `"08234"`) are strictly preserved.
- **Response**: `200 OK` `{ results: Array<{ genericCode, brandCode, title, dosageForm, strength, score }> }`

#### 7. `POST /api/stock/check`
- **Method & Path**: `POST /api/stock/check`
- **Behavior**: Performs Stage 1 preliminary advisory stock availability check using `QanoonAdapter` (F1, F3).
- **Adapter Call**:
  ```javascript
  const stock = await adapter.checkStock({
    genericCode: body.genericCode,
    brandCode: body.brandCode,
    goodId: body.goodId,
    warehouseId: body.warehouseId || "main",
    requestedCount: Number(body.requestedCount || body.quantity || 1),
  });
  ```
- **Response**: `200 OK` returning `{ inStock, availableCount, warehouseId, advisoryWarning, stockStatus, ... }`

#### 8. `POST /api/orders/export-batch`
- **Method & Path**: `POST /api/orders/export-batch`
- **Behavior**: Evaluates current draft, highlights discrepancies (unresolved items or out-of-stock inventory), and compiles the order batch payload (F11).
- **Logic**:
  1. Retrieve active draft: `const draft = await store.getDraft()`.
  2. Iterate `draft.items`:
     - If `item.status === "needs_completion"` or `!item.resolvedReference`:
       Add discrepancy: `قلم "${item.freeTextName}" تعیین تکلیف نشده است (فاقد کالای مرجع).`
     - If `item.status === "ready_for_review"`:
       Perform Stage 2 stock check via `adapter.checkStock({ genericCode: item.resolvedReference.genericCode, brandCode: item.resolvedReference.brandCode, requestedCount: item.quantity, warehouseId })`.
       If `!stock.inStock`:
         Add discrepancy: `stock.advisoryWarning || کسری موجودی برای ${item.resolvedReference.title}`.
       Add item to `exportItems`.
  3. If `discrepancies.length === 0 && exportItems.length > 0`:
     Call `adapter.createBatchOrder({ draftId: draft.id, uniqueId, items: exportItems })` and set `status: "READY"` or `"SUBMITTED"`.
     Else:
     Set `status: discrepancies.length === 0 ? "EMPTY" : "DRAFT_WITH_DISCREPANCIES"`.
- **Response**: `200 OK` `{ batch: BatchObject, discrepancies: Array<string> }`

---

## 5. Request Body Parsing & Error Handling Strategy

### 5.1 Asynchronous Body Parser Helper
```javascript
export async function parseJsonBody(request, { maxBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let receivedBytes = 0;
    request.setEncoding("utf8");

    request.on("data", (chunk) => {
      receivedBytes += Buffer.byteLength(chunk);
      if (receivedBytes > maxBytes) {
        const error = new Error("Payload Too Large");
        error.statusCode = 413;
        request.destroy();
        reject(error);
        return;
      }
      raw += chunk;
    });

    request.on("end", () => {
      const trimmed = raw.trim();
      if (!trimmed) {
        return resolve({});
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null) {
          const error = new Error("Invalid JSON: body must be an object");
          error.statusCode = 400;
          return reject(error);
        }
        resolve(parsed);
      } catch (err) {
        const error = new Error(`Malformed JSON: ${err.message}`);
        error.statusCode = 400;
        reject(error);
      }
    });

    request.on("error", (err) => reject(err));
  });
}
```

### 5.2 Uniform Response Helpers
```javascript
export function sendJson(response, statusCode, data, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...headers,
  });
  response.end(JSON.stringify(data));
}

export function sendError(response, statusCode, message, details = null) {
  sendJson(response, statusCode, {
    error: message,
    ...(details ? { details } : {}),
  });
}
```

### 5.3 Error Status Mapping
- `400 Bad Request`: Validation failure (empty string name, quantity <= 0, missing title, malformed JSON).
- `404 Not Found`: Need ID not found, event ID not found, or unregistered route.
- `413 Payload Too Large`: Payload exceeds 1MB limit.
- `500 Internal Server Error`: Unhandled runtime exceptions.

---

## 6. CORS Preflight & Test Harness Interoperability

Because `test/e2e/test-helper.js:51-59` checks endpoint presence via `OPTIONS`, the server must handle `OPTIONS` requests before route dispatch:

```javascript
if (request.method === "OPTIONS") {
  if (url.pathname === mcpPath) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    return response.end();
  }

  if (url.pathname.startsWith("/api/")) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, accept, authorization, x-unique-id, x-pharmacy-id, x-request-id",
      "Access-Control-Expose-Headers": "Location, X-Unique-Id",
    });
    return response.end();
  }

  return response.writeHead(404).end("Not Found");
}
```

---

## 7. Non-Regression Safeguards for `/mcp` & UI App Resource

### 7.1 Stream Isolation Invariant
- **Rule**: `parseJsonBody` must **never** be invoked on `/mcp`.
- If `url.pathname === "/mcp"`, the unconsumed Node.js `request` and `response` objects must be passed directly to `transport.handleRequest(request, response)`.
- If the stream were consumed earlier, `StreamableHTTPServerTransport` would freeze or throw connection errors.

### 7.2 MCP App Resource (`ui://panelph/order-desk.html`)
- Must maintain the exact resource registration:
  ```javascript
  registerAppResource(server, "panelph-order-desk", WIDGET_URI, {}, async () => ({
    contents: [{
      uri: WIDGET_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: widgetHtml,
      _meta: {
        "openai/ui": { availableDisplayModes: ["inline", "fullscreen"] },
        "openai/widgetDescription": "میز سفارش PanelPH برای ثبت و بازبینی پیش‌نویس سفارش.",
      },
    }],
  }));
  ```
- In addition, providing `GET /order-desk.html` returning `widgetHtml` with `Content-Type: text/html; charset=utf-8` facilitates local browser testing.

---

## 8. Component Integration

### 8.1 State Coherence Across Protocols
Both `/mcp` tools and `/api/*` REST endpoints must share the same `store` instance (`createOrderDraftStore(statePath)`).
- When an item is added via `POST /api/draft/needs`, the next call to `env.mcpClient.callTool("get_order_draft")` immediately returns the added item.
- When an item is resolved via `resolve_order_need` in MCP, `GET /api/draft` immediately reflects `status: "ready_for_review"`.

### 8.2 Dependency Injection in `startServer`
To support integration testing and in-memory test stores without global process leaks:
```javascript
export function startServer({
  port = Number(process.env.PORT ?? 8787),
  statePath = process.env.PANELPH_STATE_PATH ?? join(rootDirectory, "state", "order-draft.json"),
  store = null,
  adapter = null,
  catalogResolver = null,
} = {})
```
If not supplied:
- `activeStore = store ?? createOrderDraftStore(statePath)`
- `activeAdapter = adapter ?? createQanoonAdapter({ mockMode: true })`
- `activeCatalog = catalogResolver ?? (await tryLoadCatalogResolver() || defaultAdapterCatalog(activeAdapter))`

---

## 9. Implementation Recommendations for M2 Worker

1. **Keep Dependencies Minimal**: Use only Node.js built-ins (`node:http`, `node:url`) and existing packages (`@modelcontextprotocol/sdk`, `@modelcontextprotocol/ext-apps`, `zod`). Do not add external HTTP frameworks (Express, Koa, Fastify).
2. **Regex URL Matching**: Use exact regexes for parameterized routes:
   - Match PATCH need: `const patchMatch = url.pathname.match(/^\/api\/draft\/needs\/([^/]+)$/);`
   - Match POST resolve: `const resolveMatch = url.pathname.match(/^\/api\/draft\/needs\/([^/]+)\/resolve$/);`
3. **Leading Zero Preservation**: Always ensure `cleanRef.genericCode = String(ref.genericCode)` and never use `parseInt()` or `+ref.genericCode`.
4. **Discrepancy Highlighting**: In `POST /api/orders/export-batch`, ensure that unresolved items are pushed into `discrepancies` so `exportRes.body.discrepancies?.length > 0` passes in `test/e2e/tier1-feature-coverage.test.js`.
5. **Create Dedicated Integration Test Suite**: Write `test/server-rest.test.js` covering all 8 REST endpoints, CORS preflight, malformed JSON handling, and leading zero preservation.

---

## 10. Verification Plan

1. **Current Baseline**:
   - `npm test` runs 85 tests: 83 pass, 2 skipped (`F9` and `F11`).
2. **Post-M2 Implementation Target**:
   - `npm test` runs all tests with **0 skipped, 0 failed, 100% pass**.
   - `F9: Operational REST API endpoints (/api/draft/*)` passes cleanly.
   - `F11: Order Batch Generation & Discrepancy Highlighting` passes cleanly.
   - `test/server-rest.test.js` passes with 100% green tests.
   - Existing MCP test `test/server.test.js` passes without regression.

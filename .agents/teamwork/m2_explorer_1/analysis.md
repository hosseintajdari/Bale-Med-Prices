# Milestone 2 Architectural Analysis: REST API & Server Architecture

**Author**: `m2_explorer_1` (Teamwork Explorer)  
**Date**: 2026-10-14  
**Target File**: `src/server.js`  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m2_explorer_1`  
**Reference Contracts**: `PROJECT.md`, `ORIGINAL_REQUEST.md`, `docs/UI-DESIGN.md`, `test/e2e/test-helper.js`

---

## 1. Executive Summary & Problem Boundary

PanelPH requires a dual-protocol Node.js ESM server architecture (`src/server.js`):
1. **Model Context Protocol (MCP)**: Served over Streamable HTTP at `/mcp` via `@modelcontextprotocol/sdk` and `@modelcontextprotocol/ext-apps`, exposing tools (`get_order_draft`, `add_order_need`, `update_order_need`, `resolve_order_need`, `revert_order_event`, `render_order_desk`) and the Apps SDK widget resource (`ui://panelph/order-desk.html`).
2. **Operational REST API**: Served at `/api/*` via standard HTTP methods (`GET`, `POST`, `PATCH`, `OPTIONS`) to support web browser clients, external dashboard integration, and automated integration test harnesses.

Currently, `src/server.js` only handles `GET /` and `/mcp`. All other paths are blocked by a strict guard (`url.pathname !== mcpPath`) returning `404 Not Found`. In the E2E verification suite (`test/e2e/tier1-feature-coverage.test.js`), two tests are currently skipped due to the absence of these REST routes:
- `F9: Operational REST API endpoints (/api/draft/*)`
- `F11: Order Batch Generation & Discrepancy Highlighting (/api/orders/export-batch)`

This document establishes the exact architectural design, routing strategy, JSON body parsing safeguards, and zero-regression guarantees required for Milestone 2 implementation.

---

## 2. Current Request Handling Analysis in `src/server.js`

### 2.1 Code Structure (`src/server.js:146-192`)
```javascript
export function startServer({ port = Number(process.env.PORT ?? 8787) } = {}) {
  const mcpPath = "/mcp";
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

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    const server = createPanelServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      console.error("PanelPH MCP request failed", error);
      if (!response.headersSent) response.writeHead(500).end("Internal server error");
    }
  });
  return httpServer.listen(port, () => {
    console.log(`PanelPH MCP App listening at http://localhost:${port}${mcpPath}`);
  });
}
```

### 2.2 Key Observations & Architectural Gaps
1. **Path Blocker at Line 166**: `if (url.pathname !== mcpPath || !methods.has(request.method ?? ""))` immediately terminates any request that is not `GET /` or `/mcp` with `404 Not Found`.
2. **CORS Restricted to `/mcp` (Lines 155-163)**: Preflight `OPTIONS` requests are only acknowledged for `/mcp`. However, `isEndpointAvailable(baseUrl, path)` in `test/e2e/test-helper.js:51-59` probes endpoints by issuing an `OPTIONS` request. Any endpoint without `OPTIONS` support returning 404 is assumed to be missing by test runners and browser fetch clients.
3. **Absence of Body Parser for REST**: While `StreamableHTTPServerTransport` parses raw streams internally for `/mcp`, REST endpoints require an asynchronous, secure body parser that handles chunk aggregation, memory limits, and `JSON.parse` exceptions.
4. **Shared Store Instantiation (Lines 17-18)**: Currently `store = createOrderDraftStore(statePath)` is instantiated once at the module top level. In tests where `process.env.PANELPH_STATE_PATH` is altered, dynamic imports with cache-busting queries (`?test=...`) are needed. Allowing `startServer` to optionally accept `{ store, statePath, adapter }` ensures clean dependency injection for unit and integration testing while maintaining 100% backward compatibility with parameterless calls.

---

## 3. REST API Specification & Endpoint Contracts

All REST endpoints reside under the `/api/` prefix. They must return `Content-Type: application/json; charset=utf-8` and standard CORS headers (`Access-Control-Allow-Origin: *`).

### 3.1 Endpoint Inventory

| HTTP Method | Route Path | Purpose | Success Status | Request Body | Response Payload |
|---|---|---|---|---|---|
| `GET` | `/api/draft` | Retrieve current draft state | `200 OK` | None | `{ draft: Draft }` |
| `POST` | `/api/draft/needs` | Add free-text need item | `201 Created` | `{ name, quantity, unit?, note? }` | `{ draft: Draft, need: NeedItem }` |
| `PATCH` | `/api/draft/needs/:needId` | Update need attributes | `200 OK` | `{ name?, quantity?, unit?, note? }` | `{ draft: Draft }` |
| `POST` | `/api/draft/needs/:needId/resolve` | Bind need to catalog reference | `200 OK` | `{ reference: CatalogRef }` | `{ draft: Draft }` |
| `POST` | `/api/draft/revert` | Revert an event via compensating event | `200 OK` | `{ eventId: string }` | `{ draft: Draft }` |
| `GET` | `/api/catalog/search` | Search medicine catalog | `200 OK` | Query: `?q=...&limit=...` | `{ results: Array<CatalogItem> }` |
| `POST` | `/api/stock/check` | Advisory stock availability check | `200 OK` | `{ genericCode?, brandCode?, goodId?, requestedCount? }` | `{ inStock: boolean, availableCount: number, ... }` |
| `POST` | `/api/orders/export-batch` | Validate draft and export order batch | `200 OK` | `{ draftId?, warehouseId? }` | `{ batch: BatchObject, discrepancies: Array<string> }` |

### 3.2 Detailed Contract Specifications

#### 1. `GET /api/draft`
- **Semantics**: Read-only fetch of the active draft and summary.
- **Handler Logic**: `const draft = await store.getDraft(); sendJson(res, 200, { draft });`
- **Output Schema**:
  ```json
  {
    "draft": {
      "id": "current-order-draft",
      "status": "open" | "needs_completion" | "ready_for_review",
      "items": [],
      "events": [],
      "createdAt": "2026-10-14T...",
      "updatedAt": "2026-10-14T...",
      "summary": { "itemCount": 0, "ambiguityCount": 0 }
    }
  }
  ```

#### 2. `POST /api/draft/needs`
- **Semantics**: Adds a free-text need without forced catalog matching (Requirement R2 / Feature F7).
- **Validation**:
  - `name`: Must be a non-empty string after trimming. Empty/whitespace returns `400 Bad Request` with code `VALIDATION_ERROR`.
  - `quantity`: Must be a positive finite number (> 0). Zero, negative, NaN returns `400 Bad Request`.
  - `unit`: Optional string (defaults to `""`).
  - `note`: Optional string (defaults to `""`).
- **Handler Logic**:
  ```javascript
  const draft = await store.addNeed({ name, quantity, unit, note });
  const need = draft.items[draft.items.length - 1];
  res.setHeader("Location", `/api/draft/needs/${need.id}`);
  sendJson(res, 201, { draft, need });
  ```
- **Test Alignment**: `test/e2e/tier1-feature-coverage.test.js:214-221` asserts `status === 201` and `res.body.need.freeTextName === "پماد زینک اکساید"`.

#### 3. `PATCH /api/draft/needs/:needId`
- **Semantics**: Updates attributes (`name`, `quantity`, `unit`, `note`) of an existing need.
- **URL Parameter**: `needId` (string extracted via regex `/^\/api\/draft\/needs\/([^/]+)$/`).
- **Validation**:
  - If `name` provided: non-empty string.
  - If `quantity` provided: positive finite number.
  - If item `needId` not found in draft: returns `404 Not Found` with code `NOT_FOUND`.
- **Handler Logic**:
  ```javascript
  try {
    const draft = await store.updateNeed({ id: needId, name, quantity, unit, note });
    sendJson(res, 200, { draft });
  } catch (err) {
    if (err.message.includes("پیدا نشد")) return sendError(res, 404, "NOT_FOUND", err.message);
    return sendError(res, 400, "VALIDATION_ERROR", err.message);
  }
  ```

#### 4. `POST /api/draft/needs/:needId/resolve`
- **Semantics**: Links an unresolved need to a concrete catalog reference (Requirement R2 / Feature F8).
- **URL Parameter**: `needId` (extracted via regex `/^\/api\/draft\/needs\/([^/]+)\/resolve$/`).
- **Validation**:
  - `reference`: Must be an object with non-empty `title`.
  - `genericCode` and `brandCode`: **Must strictly preserve leading zeroes as strings** (`"00001"`, `"08234"`). Numeric coercion (`1`, `8234`) is an invariant violation.
  - Non-existent `needId`: returns `404 Not Found`.
- **Handler Logic**:
  ```javascript
  const { reference } = body;
  if (!reference || !reference.title || !reference.title.trim()) {
    return sendError(res, 400, "VALIDATION_ERROR", "عنوان کالای مرجع لازم است.");
  }
  const cleanRef = {
    title: reference.title.trim(),
    genericCode: reference.genericCode != null ? String(reference.genericCode).trim() : "",
    brandCode: reference.brandCode != null ? String(reference.brandCode).trim() : "",
    dosageForm: reference.dosageForm != null ? String(reference.dosageForm).trim() : "",
    strength: reference.strength != null ? String(reference.strength).trim() : "",
  };
  const draft = await store.resolveNeed({ id: needId, reference: cleanRef });
  sendJson(res, 200, { draft });
  ```

#### 5. `POST /api/draft/revert`
- **Semantics**: Reverts a previously recorded event by appending a compensating `event_reverted` event (Requirement R4 / Feature F12). Past history is never truncated.
- **Validation**:
  - `eventId`: Must be a non-empty string. Missing or empty returns `400 Bad Request`.
  - Non-existent `eventId`: Returns `404 Not Found`.
- **Handler Logic**:
  ```javascript
  const { eventId } = body;
  if (!eventId || typeof eventId !== "string" || !eventId.trim()) {
    return sendError(res, 400, "VALIDATION_ERROR", "شناسه رخداد الزامی است.");
  }
  try {
    const draft = await store.revertEvent({ eventId: eventId.trim() });
    sendJson(res, 200, { draft });
  } catch (err) {
    if (err.message.includes("پیدا نشد")) return sendError(res, 404, "NOT_FOUND", err.message);
    return sendError(res, 400, "REVERT_ERROR", err.message);
  }
  ```

#### 6. `GET /api/catalog/search`
- **Semantics**: Matches unstructured pharmacist text against medicine catalog references (Feature F8).
- **Query Parameters**:
  - `q`: Search string (e.g. `?q=قرص+۵۰۰` or `?q=00001`).
  - `limit`: Optional integer (default 20, max 100).
- **Handler Logic**:
  - If `src/catalog-resolver.js` is available: delegates to `catalogResolver.searchCatalog(q, { limit })`.
  - Fallback: delegates to `adapter.searchGoods({ query: q, limit })`.
  - Preserves leading zeros on `genericCode` and `brandCode` in all output records.
- **Output Schema**:
  ```json
  {
    "results": [
      {
        "genericCode": "00001",
        "brandCode": "00001",
        "title": "Amoxicillin 500mg Capsule",
        "persianTitle": "آموکسی سیلین ۵۰۰ میلی گرم",
        "dosageForm": "کپسول",
        "strength": "۵۰۰ میلی‌گرم",
        "score": 100
      }
    ]
  }
  ```

#### 7. `POST /api/stock/check`
- **Semantics**: Preliminary advisory stock availability check using `QanoonAdapter` (Feature F1 & F3).
- **Request Body**: `{ genericCode?, brandCode?, goodId?, warehouseId = "main", requestedCount = 1 }`.
- **Handler Logic**:
  ```javascript
  const stock = await adapter.checkStock({
    genericCode: body.genericCode,
    brandCode: body.brandCode,
    goodId: body.goodId,
    warehouseId: body.warehouseId || "main",
    requestedCount: Number(body.requestedCount || body.quantity || 1),
  });
  sendJson(res, 200, stock);
  ```

#### 8. `POST /api/orders/export-batch`
- **Semantics**: Inspects current draft, compiles discrepancies (unresolved needs, out-of-stock items), and outputs an export-ready batch payload (Feature F11).
- **Request Body**: `{ draftId?, warehouseId? }`.
- **Handler Logic**:
  ```javascript
  const draft = await store.getDraft();
  const discrepancies = [];
  const exportItems = [];

  for (const item of draft.items) {
    if (item.status === "needs_completion" || !item.resolvedReference) {
      discrepancies.push(`قلم "${item.freeTextName}" تعیین تکلیف نشده است (فاقد کالای مرجع).`);
    } else {
      // Advisory stock check for resolved items
      const stock = await adapter.checkStock({
        genericCode: item.resolvedReference.genericCode,
        brandCode: item.resolvedReference.brandCode,
        requestedCount: item.quantity,
        warehouseId: body.warehouseId || "main",
      });
      if (!stock.inStock) {
        discrepancies.push(
          `کسری موجودی برای ${item.resolvedReference.title}: موجود ${stock.availableCount}، درخواستی ${item.quantity}`
        );
      }
      exportItems.push({
        needId: item.id,
        title: item.resolvedReference.title,
        genericCode: item.resolvedReference.genericCode,
        brandCode: item.resolvedReference.brandCode,
        quantity: item.quantity,
        unit: item.unit,
        note: item.note,
        status: item.status,
      });
    }
  }

  const batch = {
    draftId: draft.id || "current-order-draft",
    exportedAt: new Date().toISOString(),
    totalItems: draft.items.length,
    resolvedItems: exportItems.length,
    status: discrepancies.length === 0 ? "READY" : "HAS_DISCREPANCIES",
    items: exportItems,
  };

  sendJson(res, 200, { batch, discrepancies });
  ```
- **Test Alignment**: `test/e2e/tier1-feature-coverage.test.js:304-309` verifies that exporting a draft containing ambiguous items returns `200 OK` with `discrepancies.length > 0`.

---

## 4. Safe Request Body Parsing & Error Handling Strategy

### 4.1 Body Parsing Guard Function (`readJsonBody`)
Because Node.js `node:http` does not include automatic body parsing, a dedicated helper must read incoming streams safely:

```javascript
export async function readJsonBody(request, { maxBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytesReceived = 0;

    request.setEncoding("utf8");

    request.on("data", (chunk) => {
      bytesReceived += Buffer.byteLength(chunk);
      if (bytesReceived > maxBytes) {
        const err = new Error("Payload Too Large");
        err.statusCode = 413;
        err.code = "PAYLOAD_TOO_LARGE";
        request.destroy();
        reject(err);
        return;
      }
      body += chunk;
    });

    request.on("end", () => {
      const trimmed = body.trim();
      if (!trimmed) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null) {
          const err = new Error("Request body must be a JSON object");
          err.statusCode = 400;
          err.code = "INVALID_JSON";
          reject(err);
          return;
        }
        resolve(parsed);
      } catch (parseError) {
        const err = new Error(`Malformed JSON: ${parseError.message}`);
        err.statusCode = 400;
        err.code = "INVALID_JSON";
        reject(err);
      }
    });

    request.on("error", (err) => reject(err));
  });
}
```

### 4.2 Security & Robustness Invariants
1. **Memory Exhaustion Guard**: Any request payload exceeding 1MB is rejected immediately with `413 Payload Too Large` and the socket destroyed.
2. **Malformed JSON Handling**: Syntax errors trigger `400 Bad Request` with structured error details. Unhandled errors must never bring down the Node.js event loop (`T2_14: Malformed JSON payload handling on server`).
3. **Empty Body Resiliency**: Endpoints like `POST /api/orders/export-batch` sent with an empty body resolve gracefully to `{}` rather than throwing syntax errors on empty strings.
4. **Standardized Error Envelope**: Consistent error schema across all REST endpoints:
   ```json
   {
     "error": {
       "code": "VALIDATION_ERROR" | "NOT_FOUND" | "INVALID_JSON" | "SERVER_ERROR",
       "message": "Human-readable description"
     }
   }
   ```

---

## 5. Non-Regression Architecture for `/mcp` and UI Resources

### 5.1 Stream Isolation Principle
The most critical architectural hazard in dual-protocol servers is **premature stream consumption**.
- `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` manages its own chunked streaming, Server-Sent Events (SSE), and JSON-RPC dispatching directly on `request` and `response`.
- If a generic middleware or body reader reads the `request` stream before `/mcp` handling, the MCP transport will hang indefinitely or fail.

**Architectural Invariant**:
- URL path inspection (`url.pathname`) occurs **prior to any body reading**.
- If `url.pathname === "/mcp"`, the raw `request` and `response` objects are passed directly to `transport.handleRequest(request, response)`.
- `readJsonBody()` is invoked **exclusively** within matched REST route handlers for mutating methods (`POST`, `PATCH`).

### 5.2 UI Resource Delivery
1. **MCP Resource (`ui://panelph/order-desk.html`)**:
   - Registered in `createPanelServer()`:
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
   - Must remain 100% untouched to ensure ChatGPT Apps SDK client compatibility (`tier1-feature-coverage.test.js:154-168`).
2. **Web Browser UI Endpoint**:
   - `GET /order-desk.html` serves `widgetHtml` with `Content-Type: text/html; charset=utf-8`.
   - `GET /` serves `200 PanelPH MCP App` (preserving baseline health checks).

### 5.3 Shared State Coherence
Both `/mcp` tools and `/api/*` REST endpoints must share the same `store` instance (`createOrderDraftStore(statePath)`).
- When a pharmacist adds an item via the MCP ChatGPT interface, it is instantly visible via `GET /api/draft`.
- When an item is resolved via `POST /api/draft/needs/:needId/resolve`, the MCP tool `get_order_draft` immediately reflects the `ready_for_review` status.
- This coherence is directly validated by `tier3-cross-feature.test.js:193-214` (`T3_05: Cross-protocol state coherence between MCP API and persistent disk storage`).

---

## 6. Implementation Blueprint for `src/server.js`

### 6.1 Clean Router Dispatch Pattern
```
httpServer requestListener(request, response):
├── 1. URL & Origin Validation:
│   └── !request.url -> 400 Bad Request
│   └── url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`)
├── 2. Global CORS Preflight Handler:
│   └── request.method === "OPTIONS":
│       ├── url.pathname === "/mcp" -> 204 with MCP CORS headers
│       ├── url.pathname.startsWith("/api/") -> 204 with REST CORS headers
│       └── else -> 404 Not Found
├── 3. Static & Health Routes:
│   ├── GET / -> 200 "PanelPH MCP App"
│   └── GET /order-desk.html -> 200 HTML widget
├── 4. MCP Protocol Handler:
│   └── url.pathname === "/mcp" && ["POST", "GET", "DELETE"].has(request.method):
│       └── Delegate directly to StreamableHTTPServerTransport
├── 5. REST API Dispatcher (/api/*):
│   ├── GET /api/draft -> handleGetDraft
│   ├── POST /api/draft/needs -> handleAddNeed
│   ├── PATCH /api/draft/needs/:needId -> handleUpdateNeed
│   ├── POST /api/draft/needs/:needId/resolve -> handleResolveNeed
│   ├── POST /api/draft/revert -> handleRevertEvent
│   ├── GET /api/catalog/search -> handleCatalogSearch
│   ├── POST /api/stock/check -> handleStockCheck
│   ├── POST /api/orders/export-batch -> handleExportBatch
│   └── Unmatched /api/* -> 404 Not Found
└── 6. Fallback:
    └── 404 Not Found
```

### 6.2 Modular Export Signature
To support seamless testing across unit, integration, and E2E suites:
```javascript
export function startServer({
  port = Number(process.env.PORT ?? 8787),
  statePath = process.env.PANELPH_STATE_PATH ?? join(rootDirectory, "state", "order-draft.json"),
  store = null,
  adapter = null,
  catalogResolver = null,
} = {})
```
- Defaults instantiate `store = createOrderDraftStore(statePath)`.
- Defaults instantiate `adapter = createQanoonAdapter({ mockMode: true })`.
- Defaults instantiate `catalogResolver` (wrapping `adapter.searchGoods` or `src/catalog-resolver.js`).

---

## 7. Recommended Integration Test Plan (`test/server-rest.test.js`)

When Milestone 2 Worker implements these endpoints, a dedicated test file `test/server-rest.test.js` should be created containing tests for:
1. `GET /api/draft`: Verifies 200 and initial empty draft structure.
2. `POST /api/draft/needs`: Verifies 201 Created, `Location` header, and payload validation.
3. `PATCH /api/draft/needs/:needId`: Verifies 200 OK update, 404 on missing ID, and 400 on invalid values.
4. `POST /api/draft/needs/:needId/resolve`: Verifies 200 OK resolution and **strict string preservation of leading zeroes** on `genericCode: "00001"`.
5. `POST /api/draft/revert`: Verifies 200 OK compensating revert and 404 on non-existent event ID.
6. `GET /api/catalog/search?q=...`: Verifies 200 OK results with leading zero string preservation.
7. `POST /api/stock/check`: Verifies 200 OK stock check using mock adapter fixtures.
8. `POST /api/orders/export-batch`: Verifies 200 OK batch export with discrepancy detection for unresolved items.
9. Malformed JSON handling: Verifies 400 Bad Request on invalid JSON strings without crashing.
10. CORS preflight verification: Verifies 204 on OPTIONS for all `/api/*` routes.
11. Full MCP & UI regression check: Verifies all existing unit tests in `test/server.test.js` and E2E tests in `test/e2e/tier1-feature-coverage.test.js` pass with 0 skips.

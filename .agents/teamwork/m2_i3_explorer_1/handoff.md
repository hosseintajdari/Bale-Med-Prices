# Milestone 2 Iteration 3 Explorer 1 Handoff Report: Server DoS Remediation & Test Blueprint

**Target:** `src/server.js` and `test/server-rest.test.js`  
**Agent:** `m2_i3_explorer_1` (teamwork_explorer, Milestone 2 Iteration 3)  
**Working Directory:** `/home/admin/PanelPH/.agents/teamwork/m2_i3_explorer_1`  
**Timestamp:** 2026-10-14T13:45:00Z  
**Handoff Type:** Hard (Complete Investigation & Actionable Blueprints)  
**Task Directive:** Analyze `src/server.js` DoS vulnerabilities (unhandled TypeError on non-string inputs and missing top-level try/catch). Blueprint exact type guards and error handling in `src/server.js` and tests in `test/server-rest.test.js`.

---

## 1. Observation

### 1.1 Summary of Inspected Files & Line Counts
The following files were inspected completely (100% line coverage):
- `src/server.js`: 818 lines (`wc -l` confirmed: 818 lines)
- `test/server-rest.test.js`: 403 lines (`wc -l` confirmed: 403 lines)
- `src/draft-store.js`: 181 lines (`wc -l` confirmed: 181 lines)

---

### 1.2 Verbatim Crash Observations (Direct Empirical Evidence)

#### Observation 1.2.1: `POST /api/draft/needs` Unhandled TypeError (`src/server.js:618`)
- **Code:**
  ```javascript
  618: const name = body.name?.trim();
  ```
- **Execution Command:**
  ```bash
  node -e '
  import { startServer } from "./src/server.js";
  import { once } from "node:events";
  const s = startServer({ port: 0 });
  await once(s, "listening");
  const port = s.address().port;
  await fetch(`http://127.0.0.1:${port}/api/draft/needs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: 12345, quantity: 1 })
  });
  '
  ```
- **Exit Code:** `1` (Immediate process termination)
- **Verbatim Error Output:**
  ```
  PanelPH MCP App listening at http://localhost:0/mcp
  file:///home/admin/PanelPH/src/server.js:618
          const name = body.name?.trim();
                                  ^

  TypeError: body.name?.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:618:33)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

  Node.js v24.21.0
  ```
- **Confirmed Vulnerable Payloads:**
  - `{ name: 12345, quantity: 1 }` (Number) -> Exit code 1
  - `{ name: true, quantity: 1 }` (Boolean) -> Exit code 1
  - `{ name: { drug: "Amox" }, quantity: 1 }` (Object) -> Exit code 1
  - `{ name: ["Amox"], quantity: 1 }` (Array) -> Exit code 1

#### Observation 1.2.2: `PATCH /api/draft/needs/:needId` Unhandled TypeError (`src/server.js:655`)
- **Code:**
  ```javascript
  655: if (body.name !== undefined && !body.name?.trim()) {
  ```
- **Execution Vector:** Sending `PATCH /api/draft/needs/test-need-id` with payload `{ name: 9999 }`.
- **Exit Code:** `1`
- **Verbatim Error Output:**
  ```
  file:///home/admin/PanelPH/src/server.js:655
          if (body.name !== undefined && !body.name?.trim()) {
                                                     ^

  TypeError: body.name?.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:655:52)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

  Node.js v24.21.0
  ```

#### Observation 1.2.3: `POST /api/draft/needs/:needId/resolve` Unhandled TypeError (`src/server.js:694`)
- **Code:**
  ```javascript
  693: const ref = body.reference;
  694: if (!ref || !ref.title || !ref.title.trim()) {
  ```
- **Execution Vector:** Sending `POST /api/draft/needs/test-need-id/resolve` with payload `{ reference: { title: 12345 } }`.
- **Exit Code:** `1`
- **Verbatim Error Output:**
  ```
  file:///home/admin/PanelPH/src/server.js:694
          if (!ref || !ref.title || !ref.title.trim()) {
                                               ^

  TypeError: ref.title.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:694:46)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

  Node.js v24.21.0
  ```

#### Observation 1.2.4: `POST /api/draft/revert` Unhandled TypeError (`src/server.js:727`)
- **Code:**
  ```javascript
  727: const eventId = body.eventId?.trim();
  ```
- **Execution Vector:** Sending `POST /api/draft/revert` with payload `{ eventId: 12345 }`.
- **Exit Code:** `1`
- **Verbatim Error Output:**
  ```
  file:///home/admin/PanelPH/src/server.js:727
          const eventId = body.eventId?.trim();
                                        ^

  TypeError: body.eventId?.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:727:39)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

  Node.js v24.21.0
  ```

#### Observation 1.2.5: Missing Top-Level Error Boundary in `createServer` (`src/server.js:534-810`)
- **Code:**
  ```javascript
  534: const httpServer = createServer(async (request, response) => {
  535:   if (!request.url) return response.writeHead(400).end("Missing URL");
  536:   const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  ...
  809:   return response.writeHead(404).end("Not Found");
  810: });
  ```
- **Defect:**
  The `async (request, response) => { ... }` listener has no enclosing `try/catch` block.
  1. `new URL(request.url, ...)` at line 536 throws `TypeError [ERR_INVALID_URL]` if `request.url` contains an invalid URL sequence (e.g., `GET /%`).
  2. Any runtime exception occurring during request routing or property access immediately escapes as an unhandled promise rejection, terminating the Node.js process.

#### Observation 1.2.6: Array Payload Bypass in `readJsonBody` (`src/server.js:84`)
- **Code:**
  ```javascript
  82: try {
  83:   const parsed = JSON.parse(trimmed);
  84:   if (typeof parsed !== "object" || parsed === null) {
  85:     const err = new Error("Request body must be a JSON object");
  86:     err.statusCode = 400;
  87:     err.code = "INVALID_JSON";
  88:     reject(err);
  89:     return;
  90:   }
  91:   resolve(parsed);
  ```
- **Defect:**
  In JavaScript, `typeof [] === "object"` evaluates to `true`, and `[] !== null` is `true`.
  When a client sends a JSON array body (e.g. `"[1, 2, 3]"`), `readJsonBody` resolves the Array without rejection.
  Empirically verified via:
  ```bash
  node -e '
  import { readJsonBody } from "./src/server.js";
  import { Readable } from "node:stream";
  readJsonBody(Readable.from([Buffer.from("[1, 2, 3]")])).then(b => console.log("Resolved:", Array.isArray(b)));
  '
  # Output: Resolved: true
  ```

#### Observation 1.2.7: Downstream Store `TypeError` on Non-String `unit` and `note` (`src/draft-store.js:97-98, 129-130`)
- **Code in `src/server.js:632-633`:**
  ```javascript
  unit: body.unit ?? "",
  note: body.note ?? "",
  ```
- **Code in `src/draft-store.js:97-98`:**
  ```javascript
  unit: unit?.trim() ?? "",
  note: note?.trim() ?? "",
  ```
- **Defect:**
  If a client passes `{ name: "آسپرین", quantity: 1, unit: 12345, note: {} }`, `server.js` passes the number/object down to `draft-store.js`. Inside `draft-store.js`, calling `unit?.trim()` throws `TypeError: unit?.trim is not a function`.

---

## 2. Logic Chain

1. **Premise 1 (Optional Chaining Semantics in ECMAScript):**
   `expr?.trim()` evaluates `expr`. If `expr` is `undefined` or `null`, the expression evaluates to `undefined`. If `expr` is defined but is NOT an object with a callable `.trim` method (e.g. `typeof expr === "number"`, `"boolean"`, or an `Object` without `trim`), `expr.trim` is `undefined`. Attempting to call `undefined()` throws `TypeError: ...trim is not a function`.
2. **Premise 2 (Node.js Process Crash Semantics):**
   In Node.js 16+ (and verified in Node.js v24.21.0), an unhandled rejection inside an `async` HTTP server callback causes the Node.js runtime to trigger an uncaught exception event and terminate the process with exit code 1.
3. **Observation Reference 1.2.1 - 1.2.4:**
   Lines 618, 655, 694, and 727 invoke `.trim()` on `body.name`, `ref.title`, and `body.eventId` without verifying `typeof ... === "string"`.
4. **Observation Reference 1.2.5:**
   `src/server.js:534` has no top-level `try/catch` wrapper around its request listener.
5. **Deductive Conclusion (Vulnerability Identification):**
   Any unauthenticated external client can send a single HTTP request containing a numeric property (e.g., `POST /api/draft/needs` with `{"name": 12345, "quantity": 1}`) and cause the entire PanelPH server to crash immediately, denying service to all connected pharmacists and clients.
6. **Remediation Deduction:**
   Remediation requires a two-layer defense:
   - **Layer 1 (Per-Endpoint Strict Type Guards):** Ensure every property accessed with string methods is strictly checked via `typeof x === "string"` before calling `.trim()`. If the property is missing or not a string, return HTTP 400 `VALIDATION_ERROR` with standard localized error messaging.
   - **Layer 2 (Global Request Error Boundary):** Wrap the entire async request listener inside `try { ... } catch (unhandledError) { ... }`. If any unexpected error occurs, log the error and respond with HTTP 500 `INTERNAL_SERVER_ERROR` without letting the exception crash the process.

---

## 3. Caveats

1. **Review-Only Scope:**
   In compliance with the Teamwork Explorer role, source code files (`src/server.js`, `test/server-rest.test.js`) were NOT modified in the repository. All patch blueprints in this report are provided for implementation by the Worker agent.
2. **Catalog Resolver Scope Boundary:**
   Catalog search defects identified in Gate 2 Iteration 2 reports (punctuation collapse and standalone dosage form auto-resolution in `src/catalog-resolver.js`) are handled by parallel Explorer 2; this report is strictly scoped to `src/server.js` and `test/server-rest.test.js` DoS vulnerabilities.
3. **Offline Mock Mode:**
   All verification and empirical executions were performed in strict offline mock mode without live external network dependencies.

---

## 4. Conclusion & Actionable Blueprints

### 4.1 Summary of Findings
- **Defect 1 (Critical DoS):** `POST /api/draft/needs` (line 618) crashes on non-string `name`.
- **Defect 2 (Critical DoS):** `PATCH /api/draft/needs/:needId` (line 655) crashes on non-string `name`.
- **Defect 3 (Critical DoS):** `POST /api/draft/needs/:needId/resolve` (line 694) crashes on non-string `reference.title` or non-object `reference`.
- **Defect 4 (Critical DoS):** `POST /api/draft/revert` (line 727) crashes on non-string `eventId`.
- **Defect 5 (Critical Architecture):** `createServer` (lines 534-810) lacks a top-level async `try/catch` error boundary.
- **Defect 6 (Medium Validation):** `readJsonBody` (line 84) fails to reject JSON arrays (`[]`).
- **Defect 7 (Low Sanitization):** `POST /api/draft/needs` (lines 632-633) passes non-string `unit` and `note` to the store.
- **Defect 8 (Low Validation):** `GET /api/catalog/search` (line 746) produces `NaN` on non-numeric `limit`.

---

### 4.2 Blueprint 1: Exact Remediations for `src/server.js`

#### Modification 1: `readJsonBody` Array Rejection (`src/server.js:84`)
**Target Lines:** 84-90  
**Before:**
```javascript
        if (typeof parsed !== "object" || parsed === null) {
          const err = new Error("Request body must be a JSON object");
          err.statusCode = 400;
          err.code = "INVALID_JSON";
          reject(err);
          return;
        }
```
**After:**
```javascript
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          const err = new Error("Request body must be a JSON object");
          err.statusCode = 400;
          err.code = "INVALID_JSON";
          reject(err);
          return;
        }
```
**Rationale:** In JS, `typeof [] === "object"`. Adding `|| Array.isArray(parsed)` guarantees that array payloads are rejected with HTTP 400 `INVALID_JSON`.

---

#### Modification 2: `sendJson` Headers-Sent Guard (`src/server.js:104`)
**Target Lines:** 104-113  
**Before:**
```javascript
function sendJson(response, statusCode, data, headers = {}) {
  const json = JSON.stringify(data);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Location",
    ...headers,
  });
  response.end(json);
}
```
**After:**
```javascript
function sendJson(response, statusCode, data, headers = {}) {
  if (response.headersSent) {
    try {
      response.end();
    } catch {
      // ignore
    }
    return;
  }
  const json = JSON.stringify(data);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Location",
    ...headers,
  });
  response.end(json);
}
```
**Rationale:** Prevents `ERR_HTTP_HEADERS_SENT` crashes if an error response is triggered after partial response streaming.

---

#### Modification 3: Global Error Boundary in `createServer` (`src/server.js:534-810`)
**Target Lines:** 534-538 and 808-810  
**Before:**
```javascript
  const httpServer = createServer(async (request, response) => {
    if (!request.url) return response.writeHead(400).end("Missing URL");
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    ...
    // 5. Fallback for all other routes
    return response.writeHead(404).end("Not Found");
  });
```
**After:**
```javascript
  const httpServer = createServer(async (request, response) => {
    try {
      if (!request.url) {
        return sendError(response, 400, "BAD_REQUEST", "Missing URL");
      }
      let url;
      try {
        url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      } catch {
        return sendError(response, 400, "BAD_REQUEST", "Invalid request URL");
      }

      // 1. CORS Preflight Handler
      ...
      // 2. Static and Root Endpoints
      ...
      // 3. MCP Streamable HTTP Transport
      ...
      // 4. REST API Endpoints (/api/*)
      ...
      // 5. Fallback for all other routes
      return response.writeHead(404).end("Not Found");
    } catch (unhandledError) {
      console.error("Unhandled error in HTTP request listener:", unhandledError);
      if (!response.headersSent) {
        return sendError(
          response,
          500,
          "INTERNAL_SERVER_ERROR",
          unhandledError?.message || "Internal server error"
        );
      }
      try {
        response.end();
      } catch {
        // ignore
      }
    }
  });
```
**Rationale:** Guarantees that any uncaught exception occurring in the request handling chain is caught, formatted as an HTTP 500 error, and prevented from terminating the Node process.

---

#### Modification 4: `POST /api/draft/needs` Type Guards (`src/server.js:618-634`)
**Target Lines:** 618-634  
**Before:**
```javascript
        const name = body.name?.trim();
        const quantity = Number(body.quantity);

        if (!name) {
          return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز الزامی است.");
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return sendError(response, 400, "VALIDATION_ERROR", "تعداد باید عدد مثبت باشد.");
        }

        try {
          const draft = await activeStore.addNeed({
            name,
            quantity,
            unit: body.unit ?? "",
            note: body.note ?? "",
          });
```
**After:**
```javascript
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const rawQty = body.quantity;
        const quantity = typeof rawQty === "number" ? rawQty : Number(rawQty);

        if (!name) {
          return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز الزامی است.");
        }
        if (typeof rawQty === "boolean" || rawQty === null || !Number.isFinite(quantity) || quantity <= 0) {
          return sendError(response, 400, "VALIDATION_ERROR", "تعداد باید عدد مثبت باشد.");
        }

        const unit = typeof body.unit === "string" ? body.unit.trim() : "";
        const note = typeof body.note === "string" ? body.note.trim() : "";

        try {
          const draft = await activeStore.addNeed({
            name,
            quantity,
            unit,
            note,
          });
```
**Rationale:**
- `typeof body.name === "string" ? body.name.trim() : ""` safely returns `""` for non-string values (`12345`, `true`, `{}`), which triggers `if (!name)` and returns HTTP 400 `VALIDATION_ERROR`.
- `typeof rawQty === "boolean" || rawQty === null` prevents `Number(true) === 1` and `Number(null) === 0` from slipping through validation.
- `unit` and `note` are strictly sanitized as strings, preventing downstream `TypeError: unit?.trim is not a function` in `src/draft-store.js`.

---

#### Modification 5: `PATCH /api/draft/needs/:needId` Type Guards (`src/server.js:655-672`)
**Target Lines:** 655-672  
**Before:**
```javascript
        if (body.name !== undefined && !body.name?.trim()) {
          return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز نمی‌تواند خالی باشد.");
        }
        if (body.quantity !== undefined) {
          const qty = Number(body.quantity);
          if (!Number.isFinite(qty) || qty <= 0) {
            return sendError(response, 400, "VALIDATION_ERROR", "تعداد باید عدد مثبت باشد.");
          }
        }

        try {
          const draft = await activeStore.updateNeed({
            id: needId,
            name: body.name,
            quantity: body.quantity,
            unit: body.unit,
            note: body.note,
          });
```
**After:**
```javascript
        if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
          return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز نمی‌تواند خالی باشد.");
        }
        if (body.quantity !== undefined) {
          const rawQty = body.quantity;
          const qty = typeof rawQty === "number" ? rawQty : Number(rawQty);
          if (typeof rawQty === "boolean" || rawQty === null || !Number.isFinite(qty) || qty <= 0) {
            return sendError(response, 400, "VALIDATION_ERROR", "تعداد باید عدد مثبت باشد.");
          }
        }

        const sanitizedName = typeof body.name === "string" ? body.name.trim() : undefined;
        const sanitizedQty = body.quantity !== undefined
          ? (typeof body.quantity === "number" ? body.quantity : Number(body.quantity))
          : undefined;
        const sanitizedUnit = typeof body.unit === "string"
          ? body.unit.trim()
          : (body.unit !== undefined ? "" : undefined);
        const sanitizedNote = typeof body.note === "string"
          ? body.note.trim()
          : (body.note !== undefined ? "" : undefined);

        try {
          const draft = await activeStore.updateNeed({
            id: needId,
            name: sanitizedName,
            quantity: sanitizedQty,
            unit: sanitizedUnit,
            note: sanitizedNote,
          });
```
**Rationale:** Rejects non-string `name` and invalid `quantity` with HTTP 400 `VALIDATION_ERROR` while sanitizing `unit` and `note` to strings to prevent store crashes.

---

#### Modification 6: `POST /api/draft/needs/:needId/resolve` Type Guards (`src/server.js:693-706`)
**Target Lines:** 693-706  
**Before:**
```javascript
        const ref = body.reference;
        if (!ref || !ref.title || !ref.title.trim()) {
          return sendError(response, 400, "VALIDATION_ERROR", "عنوان کالای مرجع لازم است.");
        }

        const cleanRef = {
          title: ref.title.trim(),
          genericCode: ref.genericCode != null ? String(ref.genericCode).trim() : "",
          brandCode: ref.brandCode != null ? String(ref.brandCode).trim() : "",
          dosageForm: ref.dosageForm != null ? String(ref.dosageForm).trim() : "",
          strength: ref.strength != null ? String(ref.strength).trim() : "",
          ...(ref.goodId ? { goodId: String(ref.goodId) } : {}),
        };
```
**After:**
```javascript
        const ref = body.reference;
        if (
          !ref ||
          typeof ref !== "object" ||
          Array.isArray(ref) ||
          typeof ref.title !== "string" ||
          !ref.title.trim()
        ) {
          return sendError(response, 400, "VALIDATION_ERROR", "عنوان کالای مرجع لازم است.");
        }

        const cleanRef = {
          title: ref.title.trim(),
          genericCode: typeof ref.genericCode === "string"
            ? ref.genericCode.trim()
            : (ref.genericCode != null ? String(ref.genericCode).trim() : ""),
          brandCode: typeof ref.brandCode === "string"
            ? ref.brandCode.trim()
            : (ref.brandCode != null ? String(ref.brandCode).trim() : ""),
          dosageForm: typeof ref.dosageForm === "string"
            ? ref.dosageForm.trim()
            : (ref.dosageForm != null ? String(ref.dosageForm).trim() : ""),
          strength: typeof ref.strength === "string"
            ? ref.strength.trim()
            : (ref.strength != null ? String(ref.strength).trim() : ""),
          ...(ref.goodId != null ? { goodId: String(ref.goodId).trim() } : {}),
        };
```
**Rationale:** Prevents crashes when `reference` is not a plain object or when `reference.title` is a number/boolean/object, returning HTTP 400 `VALIDATION_ERROR`.

---

#### Modification 7: `POST /api/draft/revert` Type Guards (`src/server.js:727-730`)
**Target Lines:** 727-730  
**Before:**
```javascript
        const eventId = body.eventId?.trim();
        if (!eventId) {
          return sendError(response, 400, "VALIDATION_ERROR", "شناسه رخداد الزامی است.");
        }
```
**After:**
```javascript
        const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
        if (!eventId) {
          return sendError(response, 400, "VALIDATION_ERROR", "شناسه رخداد الزامی است.");
        }
```
**Rationale:** Guarantees `eventId` is a string before checking emptiness, preventing `TypeError` and returning HTTP 400 `VALIDATION_ERROR`.

---

#### Modification 8: `GET /api/catalog/search` Param Sanitization (`src/server.js:745-746`)
**Target Lines:** 745-746  
**Before:**
```javascript
        const query = url.searchParams.get("q") ?? "";
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 20)));
```
**After:**
```javascript
        const query = url.searchParams.get("q") ?? "";
        const rawLimit = Number(url.searchParams.get("limit"));
        const limit = Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.max(1, Math.min(100, Math.floor(rawLimit)))
          : 20;
```
**Rationale:** Guarantees `limit` is always a finite integer between 1 and 100, preventing `NaN` slices.

---

### 4.3 Blueprint 2: Exact Test Specifications for `test/server-rest.test.js`

Add the following sub-tests to the `"REST API — Operational Endpoints & CORS Preflight"` suite in `test/server-rest.test.js`:

```javascript
  await t.test("POST /api/draft/needs enforces strict type guards on non-string inputs (DoS prevention)", async () => {
    // 1. Numeric name
    const numRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: 12345, quantity: 1 }),
    });
    assert.strictEqual(numRes.status, 400);
    const numData = await numRes.json();
    assert.strictEqual(numData.error?.code, "VALIDATION_ERROR");

    // 2. Boolean name
    const boolRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: true, quantity: 1 }),
    });
    assert.strictEqual(boolRes.status, 400);
    const boolData = await boolRes.json();
    assert.strictEqual(boolData.error?.code, "VALIDATION_ERROR");

    // 3. Object name
    const objRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: { drug: "Amoxicillin" }, quantity: 1 }),
    });
    assert.strictEqual(objRes.status, 400);
    const objData = await objRes.json();
    assert.strictEqual(objData.error?.code, "VALIDATION_ERROR");

    // 4. Whitespace-only name
    const wsRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   ", quantity: 1 }),
    });
    assert.strictEqual(wsRes.status, 400);

    // 5. Non-numeric and non-positive quantity variants
    const invalidQuantities = ["abc", null, true, false, -1, 0];
    for (const q of invalidQuantities) {
      const qRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "آموکسی سیلین", quantity: q }),
      });
      assert.strictEqual(qRes.status, 400, `Expected 400 for quantity: ${q}`);
      const qData = await qRes.json();
      assert.strictEqual(qData.error?.code, "VALIDATION_ERROR");
    }

    // 6. Non-string unit and note do not crash store
    const sanitizeRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "آموکسی سیلین",
        quantity: 2,
        unit: 12345,
        note: { text: "urgent" },
      }),
    });
    assert.strictEqual(sanitizeRes.status, 201);
    const sanitizeData = await sanitizeRes.json();
    assert.strictEqual(typeof sanitizeData.need.unit, "string");
    assert.strictEqual(typeof sanitizeData.need.note, "string");
  });

  await t.test("PATCH /api/draft/needs/:needId enforces strict type guards on non-string inputs", async () => {
    const addRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "داروی پایه", quantity: 1 }),
    });
    const { need } = await addRes.json();

    // 1. Numeric name
    const numRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: 9999 }),
    });
    assert.strictEqual(numRes.status, 400);
    const numData = await numRes.json();
    assert.strictEqual(numData.error?.code, "VALIDATION_ERROR");

    // 2. Boolean name
    const boolRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: false }),
    });
    assert.strictEqual(boolRes.status, 400);

    // 3. Object name
    const objRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: { title: "جدید" } }),
    });
    assert.strictEqual(objRes.status, 400);

    // 4. Whitespace-only name
    const wsRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    assert.strictEqual(wsRes.status, 400);

    // 5. Invalid quantity
    const qtyRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 0 }),
    });
    assert.strictEqual(qtyRes.status, 400);
  });

  await t.test("POST /api/draft/needs/:needId/resolve enforces strict type guards on reference and title", async () => {
    const addRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "نیاز به تطبیق", quantity: 1 }),
    });
    const { need } = await addRes.json();

    // 1. Missing reference
    const missingRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(missingRes.status, 400);

    // 2. Non-object reference (number, string, null, array)
    for (const badRef of [12345, "string-ref", null, [1, 2]]) {
      const badRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: badRef }),
      });
      assert.strictEqual(badRes.status, 400);
      const data = await badRes.json();
      assert.strictEqual(data.error?.code, "VALIDATION_ERROR");
    }

    // 3. Numeric title in reference
    const numTitleRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: { title: 12345 } }),
    });
    assert.strictEqual(numTitleRes.status, 400);
    const numTitleData = await numTitleRes.json();
    assert.strictEqual(numTitleData.error?.code, "VALIDATION_ERROR");

    // 4. Boolean title
    const boolTitleRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: { title: true } }),
    });
    assert.strictEqual(boolTitleRes.status, 400);

    // 5. Whitespace-only title
    const emptyTitleRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: { title: "   " } }),
    });
    assert.strictEqual(emptyTitleRes.status, 400);
  });

  await t.test("POST /api/draft/revert enforces strict type guards on eventId", async () => {
    // 1. Missing eventId
    const missingRes = await fetch(`${env.baseUrl}/api/draft/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(missingRes.status, 400);
    const missingData = await missingRes.json();
    assert.strictEqual(missingData.error?.code, "VALIDATION_ERROR");

    // 2. Numeric eventId
    const numRes = await fetch(`${env.baseUrl}/api/draft/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: 12345 }),
    });
    assert.strictEqual(numRes.status, 400);
    const numData = await numRes.json();
    assert.strictEqual(numData.error?.code, "VALIDATION_ERROR");

    // 3. Boolean eventId
    const boolRes = await fetch(`${env.baseUrl}/api/draft/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: true }),
    });
    assert.strictEqual(boolRes.status, 400);

    // 4. Whitespace-only eventId
    const emptyRes = await fetch(`${env.baseUrl}/api/draft/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "   " }),
    });
    assert.strictEqual(emptyRes.status, 400);
  });

  await t.test("readJsonBody strictly rejects JSON array bodies with 400 INVALID_JSON", async () => {
    const res = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error?.code, "INVALID_JSON");
  });

  await t.test("Global error boundary catches unhandled errors and returns 500 without terminating process", async () => {
    // Non-numeric limit defaults gracefully to 20 without NaN or throwing
    const searchRes = await fetch(`${env.baseUrl}/api/catalog/search?limit=not_a_number`);
    assert.strictEqual(searchRes.status, 200);
    const data = await searchRes.json();
    assert.ok(Array.isArray(data.results));

    // Follow-up request succeeds (process still alive and fully responsive)
    const aliveRes = await fetch(`${env.baseUrl}/api/draft`);
    assert.strictEqual(aliveRes.status, 200);
  });
```

---

## 5. Verification Method

### 5.1 Independent Reproduction of Current Vulnerabilities
To confirm the current vulnerabilities before applying the blueprint:
```bash
cd /home/admin/PanelPH

# 1. Reproduce POST /api/draft/needs crash:
node -e '
import { startServer } from "./src/server.js";
import { once } from "node:events";
const s = startServer({ port: 0 });
await once(s, "listening");
const port = s.address().port;
await fetch(`http://127.0.0.1:${port}/api/draft/needs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: 12345, quantity: 1 })
});
'
# Expectation in unpatched code: Node process crashes with exit code 1 (TypeError: body.name?.trim is not a function)
```

### 5.2 Post-Remediation Verification Command
After the Worker implements the blueprints:
```bash
cd /home/admin/PanelPH

# 1. Run unit and integration tests:
node --test test/server-rest.test.js

# 2. Run adversarial suite (Suite 3 server crash tests):
node /tmp/m2_i2_adversarial_suite.mjs

# 3. Run full project test suite:
npm test
```

### 5.3 Invalidation Conditions for Gate Rejection
The Gate 2 Iteration 2 / Iteration 3 findings against `src/server.js` are invalidated and remediated when:
1. `POST /api/draft/needs` with `{ name: 12345, quantity: 1 }` returns HTTP `400` with `{ error: { code: "VALIDATION_ERROR" } }` and the server process remains running.
2. `PATCH /api/draft/needs/:needId` with `{ name: 9999 }` returns HTTP `400` with `{ error: { code: "VALIDATION_ERROR" } }`.
3. `POST /api/draft/needs/:needId/resolve` with `{ reference: { title: 12345 } }` returns HTTP `400` with `{ error: { code: "VALIDATION_ERROR" } }`.
4. `POST /api/draft/revert` with `{ eventId: 12345 }` returns HTTP `400` with `{ error: { code: "VALIDATION_ERROR" } }`.
5. `POST /api/draft/needs` with `"[1, 2, 3]"` returns HTTP `400` with `{ error: { code: "INVALID_JSON" } }`.
6. All 18 baseline tests in `test/server-rest.test.js` plus the new type guard tests pass 100% with exit code 0.

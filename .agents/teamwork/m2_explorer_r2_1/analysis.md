# Comprehensive Analysis: Server Input Type Guards & Top-Level Error Boundary

- **Target File:** `/home/admin/PanelPH/src/server.js`
- **Investigator:** `m2_explorer_r2_1` (Milestone 2 Explorer, Iteration 2)
- **Status:** Complete & Verified
- **Date:** 2026-10-14

---

## 1. Executive Summary

Empirical fuzzing and adversarial stress testing conducted by Challenger 1 (`/tmp/m2-adversarial-test.mjs`) revealed **5 critical process crash / Denial-of-Service (DoS) vulnerabilities** in `src/server.js`. When clients submit non-string values (numbers, booleans, arrays, or objects) for fields expecting strings (`body.name`, `body.name` on PATCH, `ref.title`, `body.eventId`), the server attempts to invoke `.trim()` on a non-string prototype (`Number.prototype.trim` or `Boolean.prototype.trim`). Because these method invocations occur outside of any `try/catch` block within the asynchronous request handler of `http.createServer`, Node.js emits an `UnhandledPromiseRejection` and terminates the entire runtime process (`exit code 1`). A single unauthenticated request will take down the HTTP server for all concurrent users and drop all ongoing sessions.

This analysis provides:
1. Exact root-cause traces and line citations for all 5 crash points and secondary non-string vectors (`body.rawText`, `body.note`, `body.unit`, `body.genericCode`, `body.brandCode`, `body.uniqueId`, JSON arrays).
2. Architectural comparison between **implicit type coercion** versus **strict 400 VALIDATION_ERROR rejection**.
3. Concrete implementation specifications for 4 reusable type guard helpers (`isNonEmptyString`, `safeTrim`, `isPositiveNumber`, `isPlainObject`).
4. A bulletproof top-level error boundary wrapping `http.createServer` that guarantees uniform `500 INTERNAL_SERVER_ERROR` or `400 BAD_REQUEST` JSON envelopes without crashing the Node.js event loop.
5. Exact line-by-line before/after replacement chunks ready for the M2 Worker.

---

## 2. Root Cause & Vulnerability Breakdown

### 2.1 Vulnerability 1: TypeError on `body.name` in `POST /api/draft/needs`
- **Location:** `/home/admin/PanelPH/src/server.js:618`
- **Observed Code:**
  ```javascript
  const name = body.name?.trim();
  const quantity = Number(body.quantity);

  if (!name) {
    return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز الزامی است.");
  }
  ```
- **Mechanism of Failure:**
  In JavaScript, optional chaining `obj?.prop` only guards against `null` and `undefined`. When `body.name` is a primitive number (e.g., `12345`), boolean (`true`), object (`{}`), or array (`[]`), `body.name` is neither `null` nor `undefined`. The expression evaluates `(12345).trim()`, which resolves to `undefined()` and synchronously throws:
  `TypeError: body.name?.trim is not a function`
- **Blast Radius:**
  Line 618 is located immediately after `readJsonBody(request)` and **before** the inner `try { ... } catch (err)` block starting at line 629. It is therefore unhandled. The async promise returned to `http.createServer` rejects, causing Node.js to abort the process.
- **Related Field (`body.rawText`):**
  Per `PROJECT.md` line 64, drafts accept free-text item names as either `name` or `rawText`. If a client supplies `body.rawText` instead of `body.name`, `body.name` evaluates to `undefined`, which currently bypasses the crash but fails with 400 even if valid `rawText` was provided. Supporting both aliases under a unified non-empty string guard is required.

---

### 2.2 Vulnerability 2: TypeError on `body.name` in `PATCH /api/draft/needs/:needId`
- **Location:** `/home/admin/PanelPH/src/server.js:655`
- **Observed Code:**
  ```javascript
  if (body.name !== undefined && !body.name?.trim()) {
    return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز نمی‌تواند خالی باشد.");
  }
  ```
- **Mechanism of Failure:**
  The condition `body.name !== undefined` succeeds when `body.name` is `9999` or `false`. Next, `!body.name?.trim()` is evaluated. Just as in Vulnerability 1, `(9999).trim` is undefined, throwing `TypeError: body.name?.trim is not a function`.
- **Blast Radius:**
  Line 655 is outside the `try/catch` block that begins at line 665. The process terminates immediately.

---

### 2.3 Vulnerability 3: TypeError on `ref.title` in `POST /api/draft/needs/:needId/resolve`
- **Location:** `/home/admin/PanelPH/src/server.js:694` & `src/server.js:699`
- **Observed Code:**
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
- **Mechanism of Failure:**
  If a client sends `{ "reference": { "title": 12345 } }` or `{ "reference": { "title": true } }`, `!ref` is false and `!ref.title` is false (truthy). The runtime proceeds to evaluate `!ref.title.trim()`, throwing `TypeError: ref.title.trim is not a function`.
  Furthermore, if `ref` itself is not an object (e.g., `body.reference = "some-string"` or `null`), property access like `ref.title` behaves unexpectedly, and line 699 executes `ref.title.trim()` unconditionally.
- **Blast Radius:**
  Lines 694 and 699 are situated outside the `try/catch` at line 707. Immediate process termination occurs.

---

### 2.4 Vulnerability 4: TypeError on `body.eventId` in `POST /api/draft/revert`
- **Location:** `/home/admin/PanelPH/src/server.js:727`
- **Observed Code:**
  ```javascript
  const eventId = body.eventId?.trim();
  if (!eventId) {
    return sendError(response, 400, "VALIDATION_ERROR", "شناسه رخداد الزامی است.");
  }
  ```
- **Mechanism of Failure:**
  When `body.eventId` is a number (e.g., `12345`) or boolean, `(12345)?.trim()` invokes `undefined()`, throwing `TypeError: body.eventId?.trim is not a function`.
- **Blast Radius:**
  Line 727 is outside the `try/catch` at line 732. Process terminates immediately.

---

### 2.5 Vulnerability 5: Complete Absence of Top-Level Error Boundary in `createServer`
- **Location:** `/home/admin/PanelPH/src/server.js:534-810`
- **Observed Code:**
  ```javascript
  const httpServer = createServer(async (request, response) => {
    if (!request.url) return response.writeHead(400).end("Missing URL");
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    // ... all route handlers ...
    return response.writeHead(404).end("Not Found");
  });
  ```
- **Mechanism of Failure:**
  In Node.js `http.createServer(async (req, res) => { ... })`, the HTTP listener callback is an `async` function. The Node.js HTTP parser invokes this callback as a listener but attaches **no unhandled promise rejection handler** to the returned promise. Any exception thrown synchronously or via an unhandled promise rejection inside the callback causes the promise to reject into the void. Node.js 16+ defaults `unhandledRejection` to `mode=throw`, resulting in process termination with exit code 1.
- **Blast Radius:**
  Any unexpected runtime exception (malformed URL parsing, unexpected JSON structure, unexpected downstream driver error) instantly kills the server process.

---

### 2.6 Secondary Vulnerabilities & Non-String Surface Analysis

| Parameter / Field | Endpoint / Function | Current Handling | Vulnerability / Defect | Remediation |
|---|---|---|---|---|
| `body.note`, `body.unit` | `POST /api/draft/needs` (lines 632-633) | `unit: body.unit ?? "", note: body.note ?? ""` | If passed as numbers (`unit: 100`), passed down to `draft-store.js:97` which calls `unit?.trim()`, throwing `TypeError: unit?.trim is not a function` inside store. | Validate that if present and non-null, `typeof === "string"`, or apply `safeTrim(body.unit)` / `safeTrim(body.note)`. |
| `body.unit`, `body.note` | `PATCH /api/draft/needs/:id` (lines 668-671) | `unit: body.unit, note: body.note` passed raw | Passed to `draft-store.js:129` which calls `unit?.trim()`, throwing `TypeError` in store. | Apply `safeTrim` or validate string type before forwarding. |
| `body.uniqueId` | `POST /api/orders/export-batch` (line 791) | `uniqueId: body.uniqueId` passed raw to `runExportBatch` | If passed as number `12345`, `qanoon-adapter.js:436` checks `typeof uniqueId !== "string"` and throws `QanoonValidationError`. Caught as 500 `EXPORT_ERROR` rather than 400. | Validate `isNonEmptyString(body.uniqueId)` if provided; reject invalid types with 400 `VALIDATION_ERROR`. |
| `body.genericCode`, `body.brandCode` | `POST /api/draft/needs/:id/resolve` (lines 700-701) | `String(ref.genericCode).trim()` | If passed as object `{}` becomes `"[object Object]"`. If passed as number `08234`, leading zeros were lost at client JSON serialization. | Use `normalizeCodeString` to preserve string representation and reject objects. |
| `body.requestedCount` | `POST /api/stock/check` (line 770) | `Number(body.requestedCount || body.quantity || 1)` | If negative or string `"abc"`, results in `NaN` or negative count. | Validate `isPositiveNumber(...)` with 400 `VALIDATION_ERROR`. |
| Top-level JSON Array `[...]` | `readJsonBody` (line 84) | `if (typeof parsed !== "object" || parsed === null)` | In JS, `typeof [] === "object"`. Arrays pass `readJsonBody` without rejection. | Add `|| Array.isArray(parsed)` to reject arrays as `INVALID_JSON`. |
| `new URL(...)` | `createServer` (line 536) | `new URL(request.url, ...)` unshielded | Invalid characters or malformed percent-encoding can throw `TypeError: Invalid URL`. | Shield URL construction inside top-level error boundary and return 400 `BAD_REQUEST`. |

---

## 3. Design Tradeoffs: Coercion vs 400 Validation Rejection

When handling non-string inputs in REST APIs, two architectural approaches are possible:

### Approach A: Permissive Coercion
Convert non-string values into strings via `String(val).trim()` or fallback to empty string `""`.
- *Pros:* Never crashes.
- *Cons:* Masked client bugs. A client sending `{"name": 12345}` receives an item named `"12345"`. A client sending `{"name": false}` stores `"false"`. Furthermore, for Iranian national pharmaceutical codes (`genericCode: 00001`), numeric coercion discards leading zeros (`1`), corrupting medical data contracts.

### Approach B: Strict Type-Guarding with 400 Rejection (Recommended Standard)
Verify that required text fields are strictly valid non-empty strings. If a client transmits a number, boolean, array, or whitespace-only string for a text property, return `400 Bad Request` with code `VALIDATION_ERROR` and an informative Persian error message.
- *Pros:*
  1. Conforms strictly to REST and OpenAPI / JSON Schema contracts.
  2. Preserves data integrity — never corrupts pharmacy records or codes.
  3. Perfectly satisfies adversarial test cases `ADV-3.1` through `ADV-3.5` which assert HTTP status `400`.
  4. Compatible with MCP tool schemas (which use `z.string().min(1)`).
- *Cons:* Requires precise error checking in handler code before accessing properties.

**Conclusion:** Use **Strict Type-Guarding with 400 Rejection** for all required and optional client-provided text fields, combined with `safeTrim` as a defensive coercion fallback only when formatting values for downstream storage.

---

## 4. Recommended Type Guard Helpers

Add the following lightweight, highly-optimized type guard functions at the module level in `src/server.js`:

```javascript
/**
 * Type guard verifying if value is a non-empty string after trimming.
 * Rejects numbers, booleans, objects, arrays, null, undefined, and empty/whitespace strings.
 *
 * @param {unknown} val
 * @returns {val is string}
 */
export function isNonEmptyString(val) {
  return typeof val === "string" && val.trim().length > 0;
}

/**
 * Safely trims a string or returns a fallback default string.
 * Prevents TypeError when called on non-string primitives or objects.
 *
 * @param {unknown} val
 * @param {string} [fallback=""]
 * @returns {string}
 */
export function safeTrim(val, fallback = "") {
  return typeof val === "string" ? val.trim() : fallback;
}

/**
 * Checks whether value is a positive finite number.
 * Accepts numbers or non-empty numeric strings (e.g. 1.5, "2").
 * Strictly rejects booleans (prevents Number(true) === 1 trap), null, undefined, arrays, and NaN/Infinity.
 *
 * @param {unknown} val
 * @returns {boolean}
 */
export function isPositiveNumber(val) {
  if (typeof val === "boolean" || val === null || val === undefined) return false;
  if (typeof val === "number") {
    return Number.isFinite(val) && val > 0;
  }
  if (typeof val === "string" && val.trim().length > 0) {
    const num = Number(val);
    return Number.isFinite(num) && num > 0;
  }
  return false;
}

/**
 * Validates that an input is a non-null, non-array plain object.
 *
 * @param {unknown} val
 * @returns {val is Record<string, unknown>}
 */
export function isPlainObject(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
```

---

## 5. Exact Code Proposals & Replacement Chunks

### 5.1 Replacement Chunk 1: `readJsonBody` Array Rejection
- **Target File:** `/home/admin/PanelPH/src/server.js`
- **Lines:** 82-90
- **Existing Code:**
  ```javascript
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null) {
          const err = new Error("Request body must be a JSON object");
          err.statusCode = 400;
          err.code = "INVALID_JSON";
          reject(err);
          return;
        }
  ```
- **Proposed Code:**
  ```javascript
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          const err = new Error("Request body must be a JSON object");
          err.statusCode = 400;
          err.code = "INVALID_JSON";
          reject(err);
          return;
        }
  ```

---

### 5.2 Replacement Chunk 2: Top-Level Error Boundary in `createServer`
- **Target File:** `/home/admin/PanelPH/src/server.js`
- **Lines:** 534-810
- **Existing Code:**
  ```javascript
  const httpServer = createServer(async (request, response) => {
    if (!request.url) return response.writeHead(400).end("Missing URL");
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    // ... routes ...
    return response.writeHead(404).end("Not Found");
  });
  ```
- **Proposed Structure:**
  ```javascript
  const httpServer = createServer(async (request, response) => {
    try {
      if (!request.url) return response.writeHead(400).end("Missing URL");
      let url;
      try {
        url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      } catch (urlErr) {
        if (!response.headersSent) {
          response.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          response.end(JSON.stringify({
            error: {
              code: "BAD_REQUEST",
              message: `Invalid request URL: ${urlErr.message}`,
            },
          }));
        }
        return;
      }

      // 1. CORS Preflight Handler
      // 2. Static and Root Endpoints
      // 3. MCP Streamable HTTP Transport
      // 4. REST API Endpoints (/api/*)
      // 5. Fallback for all other routes
      return response.writeHead(404).end("Not Found");

    } catch (fatalError) {
      console.error("Top-level HTTP error boundary caught unhandled exception:", fatalError);
      if (!response.headersSent) {
        const statusCode = fatalError.statusCode || 500;
        const errorCode = fatalError.code || "INTERNAL_SERVER_ERROR";
        const errorMessage = fatalError.message || "Internal server error";

        response.writeHead(statusCode, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        response.end(JSON.stringify({
          error: {
            code: errorCode,
            message: errorMessage,
          },
        }));
      } else if (!response.writableEnded) {
        response.end();
      }
    }
  });
  ```

---

### 5.3 Replacement Chunk 3: `POST /api/draft/needs`
- **Target File:** `/home/admin/PanelPH/src/server.js`
- **Lines:** 617-641
- **Existing Code:**
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
          const need = draft.items[draft.items.length - 1];
          return sendJson(response, 201, { draft, need }, {
            Location: `/api/draft/needs/${need.id}`,
          });
        } catch (err) {
          return sendError(response, 400, "VALIDATION_ERROR", err.message);
        }
  ```
- **Proposed Code:**
  ```javascript
        const rawName = body.name !== undefined ? body.name : body.rawText;
        if (!isNonEmptyString(rawName)) {
          return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز الزامی است.");
        }
        const name = rawName.trim();

        if (body.quantity === undefined || !isPositiveNumber(body.quantity)) {
          return sendError(response, 400, "VALIDATION_ERROR", "تعداد باید عدد مثبت باشد.");
        }
        const quantity = Number(body.quantity);

        if (body.unit !== undefined && body.unit !== null && typeof body.unit !== "string") {
          return sendError(response, 400, "VALIDATION_ERROR", "واحد باید یک رشته متنی باشد.");
        }
        if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
          return sendError(response, 400, "VALIDATION_ERROR", "یادداشت باید یک رشته متنی باشد.");
        }

        try {
          const draft = await activeStore.addNeed({
            name,
            quantity,
            unit: safeTrim(body.unit),
            note: safeTrim(body.note),
          });
          const need = draft.items[draft.items.length - 1];
          return sendJson(response, 201, { draft, need }, {
            Location: `/api/draft/needs/${need.id}`,
          });
        } catch (err) {
          return sendError(response, 400, "VALIDATION_ERROR", err.message);
        }
  ```

---

### 5.4 Replacement Chunk 4: `PATCH /api/draft/needs/:needId`
- **Target File:** `/home/admin/PanelPH/src/server.js`
- **Lines:** 654-673
- **Existing Code:**
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
          return sendJson(response, 200, { draft });
  ```
- **Proposed Code:**
  ```javascript
        const rawName = body.name !== undefined ? body.name : body.rawText;
        if (rawName !== undefined) {
          if (!isNonEmptyString(rawName)) {
            return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز نمی‌تواند خالی باشد.");
          }
        }
        if (body.quantity !== undefined) {
          if (!isPositiveNumber(body.quantity)) {
            return sendError(response, 400, "VALIDATION_ERROR", "تعداد باید عدد مثبت باشد.");
          }
        }
        if (body.unit !== undefined && body.unit !== null && typeof body.unit !== "string") {
          return sendError(response, 400, "VALIDATION_ERROR", "واحد باید یک رشته متنی باشد.");
        }
        if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
          return sendError(response, 400, "VALIDATION_ERROR", "یادداشت باید یک رشته متنی باشد.");
        }

        try {
          const draft = await activeStore.updateNeed({
            id: needId,
            name: rawName !== undefined ? rawName.trim() : undefined,
            quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
            unit: body.unit !== undefined ? safeTrim(body.unit) : undefined,
            note: body.note !== undefined ? safeTrim(body.note) : undefined,
          });
          return sendJson(response, 200, { draft });
  ```

---

### 5.5 Replacement Chunk 5: `POST /api/draft/needs/:needId/resolve`
- **Target File:** `/home/admin/PanelPH/src/server.js`
- **Lines:** 693-706
- **Existing Code:**
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
- **Proposed Code:**
  ```javascript
        const ref = body.reference;
        if (!isPlainObject(ref)) {
          return sendError(response, 400, "VALIDATION_ERROR", "مشخصات کالای مرجع نامعتبر است.");
        }
        if (!isNonEmptyString(ref.title)) {
          return sendError(response, 400, "VALIDATION_ERROR", "عنوان کالای مرجع لازم است.");
        }

        const cleanRef = {
          title: ref.title.trim(),
          genericCode: ref.genericCode != null ? normalizeCodeString(ref.genericCode) : "",
          brandCode: ref.brandCode != null ? normalizeCodeString(ref.brandCode) : "",
          dosageForm: ref.dosageForm != null ? safeTrim(ref.dosageForm) : "",
          strength: ref.strength != null ? safeTrim(ref.strength) : "",
          ...(ref.goodId ? { goodId: String(ref.goodId).trim() } : {}),
        };
  ```

---

### 5.6 Replacement Chunk 6: `POST /api/draft/revert`
- **Target File:** `/home/admin/PanelPH/src/server.js`
- **Lines:** 727-731
- **Existing Code:**
  ```javascript
        const eventId = body.eventId?.trim();
        if (!eventId) {
          return sendError(response, 400, "VALIDATION_ERROR", "شناسه رخداد الزامی است.");
        }
  ```
- **Proposed Code:**
  ```javascript
        if (!isNonEmptyString(body.eventId)) {
          return sendError(response, 400, "VALIDATION_ERROR", "شناسه رخداد الزامی است.");
        }
        const eventId = body.eventId.trim();
  ```

---

### 5.7 Replacement Chunk 7: `POST /api/orders/export-batch` & `POST /api/stock/check`
- **Target File:** `/home/admin/PanelPH/src/server.js`
- **Stock Check Validation:**
  ```javascript
        const rawRequested = body.requestedCount ?? body.quantity ?? 1;
        if (!isPositiveNumber(rawRequested)) {
          return sendError(response, 400, "VALIDATION_ERROR", "تعداد درخواستی باید عدد مثبت باشد.");
        }
        const requestedCount = Number(rawRequested);
  ```
- **Export Batch Validation:**
  ```javascript
        if (body.uniqueId !== undefined && body.uniqueId !== null) {
          if (!isNonEmptyString(body.uniqueId)) {
            return sendError(response, 400, "VALIDATION_ERROR", "شناسه یکتای سفارش (uniqueId) باید یک رشته معتبر باشد.");
          }
        }
        if (body.roundingRule !== undefined && body.roundingRule !== null) {
          if (!["round", "ceil", "floor"].includes(body.roundingRule)) {
            return sendError(response, 400, "VALIDATION_ERROR", "قاعده گرد کردن باید یکی از موارد round، ceil یا floor باشد.");
          }
        }
  ```

---

## 6. Verification Plan & Test Strategy

### 6.1 Unit & Integration Regression
Run the complete baseline test suite to ensure no regressions:
```bash
npm test
# Must return exit code 0 and 113+ passing tests
```

### 6.2 Adversarial Fuzzing Suite
Run the isolated adversarial runner:
```bash
node /tmp/m2-adversarial-test.mjs
# Must pass all 46/46 scenarios, including:
# - ADV-3.1: POST /api/draft/needs with numeric name -> 400 PASS
# - ADV-3.2: POST /api/draft/needs with boolean name -> 400 PASS
# - ADV-3.3: PATCH /api/draft/needs/:id with numeric name -> 400 PASS
# - ADV-3.4: POST /api/draft/needs/:id/resolve with numeric title -> 400 PASS
# - ADV-3.5: POST /api/draft/revert with numeric eventId -> 400 PASS
```

### 6.3 Dedicated New Unit Tests (`test/server-rest.test.js`)
Add regression assertions directly to `test/server-rest.test.js` checking:
1. Non-string `name` (`12345`, `true`, `{}`, `[]`) returns `400 VALIDATION_ERROR`.
2. Non-string `unit` and `note` return `400 VALIDATION_ERROR`.
3. Non-string `reference.title` returns `400 VALIDATION_ERROR`.
4. Non-string `eventId` returns `400 VALIDATION_ERROR`.
5. Top-level array payload `[1, 2, 3]` returns `400 INVALID_JSON`.
6. Server process remains responsive after all fuzzing payloads without restart.

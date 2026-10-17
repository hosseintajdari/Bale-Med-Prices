# Challenge Report: Milestone 2 REST API & Batch Export Verification

**Target Repository:** `/home/admin/PanelPH`  
**Reviewer:** `m2_challenger_1` (Empirical Challenger)  
**Date:** 2026-10-14  
**Verdict:** **REQUEST_CHANGES**  

---

## Challenge Summary

**Overall risk assessment**: **HIGH**

While the core functional requirements of Milestone 2 (CORS preflight handling, batch export discrepancy detection, TTAC divergence warnings, 24-hour idempotency caching, and concurrency mutex queuing) were empirically verified to be robust, an adversarial parameter fuzzing audit uncovered **5 critical process crash / Denial-of-Service (DoS) vulnerabilities** in `src/server.js`.

Specifically, non-string JSON payloads (such as numbers or booleans for text fields) cause unhandled `TypeError` exceptions (`.trim is not a function`) that are not caught by any error handler, causing the Node.js runtime to terminate and crash the entire HTTP server.

---

## Challenges

### [High] Challenge 1: Unhandled TypeError and Process Crash on Non-String `name` (`POST /api/draft/needs`)

- **Assumption challenged**: Assumed incoming JSON body always has a string value if `body.name` is present (`body.name?.trim()`).
- **Attack scenario**: An external client or automated script submits a JSON request with a numeric, boolean, or object value for `name`:
  ```json
  POST /api/draft/needs
  { "name": 12345, "quantity": 2 }
  ```
- **Blast radius**: Synchronous `TypeError: body.name?.trim is not a function` is thrown at `src/server.js:618`. Because there is no `try/catch` block enclosing line 618, nor an overarching `try/catch` in `http.createServer(async (request, response) => ...)`, Node.js unhandled rejection terminates the entire application process, dropping all active connections.
- **Empirical reproduction**:
  ```bash
  node /tmp/m2-adversarial-test.mjs
  # Result: ADV-3.1 -> FAIL (Process crashes with exit code 1)
  ```
  Verbatim stack trace:
  ```
  file:///home/admin/PanelPH/src/server.js:618
          const name = body.name?.trim();
                                  ^
  TypeError: body.name?.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:618:33)
  ```
- **Mitigation**:
  Type-check or safely convert before trimming:
  ```javascript
  const name = typeof body.name === "string" ? body.name.trim() : "";
  ```
  Additionally, enclose the entire HTTP request handler in a top-level `try/catch` block to guarantee 500 error responses instead of process crashes.

---

### [High] Challenge 2: Unhandled TypeError and Process Crash on Non-String `name` (`PATCH /api/draft/needs/:needId`)

- **Assumption challenged**: Assumed `body.name` on PATCH is a string if defined.
- **Attack scenario**:
  ```json
  PATCH /api/draft/needs/<needId>
  { "name": 9999 }
  ```
- **Blast radius**: Throws `TypeError: body.name?.trim is not a function` at `src/server.js:655`. The server process crashes immediately.
- **Empirical reproduction**:
  `ADV-3.3` -> FAIL (`hasTypeError: true`, server terminated).
- **Mitigation**:
  ```javascript
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز نمی‌تواند خالی باشد.");
    }
  }
  ```

---

### [High] Challenge 3: Unhandled TypeError and Process Crash on Non-String Reference Title (`POST /api/draft/needs/:needId/resolve`)

- **Assumption challenged**: Assumed `body.reference.title` is a string if present.
- **Attack scenario**:
  ```json
  POST /api/draft/needs/<needId>/resolve
  { "reference": { "title": 12345 } }
  ```
- **Blast radius**: Throws `TypeError: ref.title.trim is not a function` at `src/server.js:694`. The server process crashes immediately.
- **Empirical reproduction**:
  `ADV-3.4` -> FAIL (`hasTypeError: true`, server terminated).
- **Mitigation**:
  ```javascript
  if (!ref || typeof ref.title !== "string" || !ref.title.trim()) {
    return sendError(response, 400, "VALIDATION_ERROR", "عنوان کالای مرجع لازم است.");
  }
  ```

---

### [High] Challenge 4: Unhandled TypeError and Process Crash on Non-String `eventId` (`POST /api/draft/revert`)

- **Assumption challenged**: Assumed `body.eventId` is a string if present.
- **Attack scenario**:
  ```json
  POST /api/draft/revert
  { "eventId": 12345 }
  ```
- **Blast radius**: Throws `TypeError: body.eventId?.trim is not a function` at `src/server.js:727`. The server process crashes immediately.
- **Empirical reproduction**:
  `ADV-3.5` -> FAIL (`hasTypeError: true`, server terminated).
- **Mitigation**:
  ```javascript
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  ```

---

### [Medium] Challenge 5: Lack of Top-Level Exception Boundary on HTTP Server

- **Assumption challenged**: Assumed individual route handlers capture all runtime errors.
- **Attack scenario**: Any unexpected exception occurring within the async callback of `http.createServer(async (request, response) => { ... })` bubbles to the process level as an unhandled promise rejection.
- **Blast radius**: In Node.js 16+, unhandled promise rejections terminate the process with exit code 1. A single invalid request from an external client takes down the server for all users.
- **Mitigation**: Wrap lines 535-809 of `src/server.js` in a global `try { ... } catch (fatalError) { ... }` that sends a `500 INTERNAL_SERVER_ERROR` JSON response and logs the stack trace without crashing.

---

## Stress Test Results

46 empirical test scenarios were executed via `/tmp/m2-adversarial-test.mjs` against an active server instance.

| Test ID | Suite | Scenario Description | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|---|
| ADV-1.1 | Suite 1 | Truncated JSON on POST `/api/draft/needs` | 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.2 | Suite 1 | Garbage string on POST `/api/draft/needs` | 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.3 | Suite 1 | Primitive number as body | 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.4 | Suite 1 | Primitive string as body | 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.5 | Suite 1 | Primitive boolean as body | 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.6 | Suite 1 | Primitive null as body | 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.7 | Suite 1 | JSON Array as body | 400 Bad Request | 400 VALIDATION_ERROR | **PASS** |
| ADV-1.8 | Suite 1 | Empty body on POST `/api/draft/needs` | 400 VALIDATION_ERROR | 400 VALIDATION_ERROR | **PASS** |
| ADV-1.9 | Suite 1 | Malformed JSON on `/api/orders/export-batch` | 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.10 | Suite 1 | Malformed JSON on `/api/stock/check` | 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.11 | Suite 1 | Malformed JSON on `/api/draft/revert` | 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.12 | Suite 1 | Malformed JSON on `/api/draft/needs/:id/resolve`| 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.13 | Suite 1 | Malformed JSON on PATCH `/api/draft/needs/:id` | 400 INVALID_JSON | 400 INVALID_JSON | **PASS** |
| ADV-1.14 | Suite 1 | Oversized payload (>1MB) | 413 / Socket Close | Connection Reset | **PASS** |
| ADV-2.1 | Suite 2 | OPTIONS preflight `/api/draft` | 204 with CORS headers | 204 No Content | **PASS** |
| ADV-2.2 | Suite 2 | OPTIONS preflight `/api/draft/needs` | 204 with CORS headers | 204 No Content | **PASS** |
| ADV-2.3 | Suite 2 | OPTIONS preflight `/api/draft/needs/:id` | 204 with CORS headers | 204 No Content | **PASS** |
| ADV-2.4 | Suite 2 | OPTIONS preflight `/api/draft/needs/:id/resolve`| 204 with CORS headers | 204 No Content | **PASS** |
| ADV-2.5 | Suite 2 | OPTIONS preflight `/api/draft/revert` | 204 with CORS headers | 204 No Content | **PASS** |
| ADV-2.6 | Suite 2 | OPTIONS preflight `/api/catalog/search` | 204 with CORS headers | 204 No Content | **PASS** |
| ADV-2.7 | Suite 2 | OPTIONS preflight `/api/stock/check` | 204 with CORS headers | 204 No Content | **PASS** |
| ADV-2.8 | Suite 2 | OPTIONS preflight `/api/orders/export-batch` | 204 with CORS headers | 204 No Content | **PASS** |
| ADV-2.9 | Suite 2 | OPTIONS preflight `/mcp` | 204 with MCP session | 204 No Content | **PASS** |
| ADV-2.10 | Suite 2 | OPTIONS preflight on non-API path | 404 Not Found | 404 Not Found | **PASS** |
| ADV-3.1 | Suite 3 | POST `/api/draft/needs` with numeric name | 400 Bad Request | **Process Crash (TypeError)** | **FAIL** |
| ADV-3.2 | Suite 3 | POST `/api/draft/needs` with boolean name | 400 Bad Request | **Process Crash (TypeError)** | **FAIL** |
| ADV-3.3 | Suite 3 | PATCH `/api/draft/needs/:id` with numeric name | 400 Bad Request | **Process Crash (TypeError)** | **FAIL** |
| ADV-3.4 | Suite 3 | POST `/api/draft/needs/:id/resolve` numeric title | 400 Bad Request | **Process Crash (TypeError)** | **FAIL** |
| ADV-3.5 | Suite 3 | POST `/api/draft/revert` with numeric eventId | 400 Bad Request | **Process Crash (TypeError)** | **FAIL** |
| ADV-3.6 | Suite 3 | Negative and Zero quantity on `/api/draft/needs` | 400 VALIDATION_ERROR | 400 VALIDATION_ERROR | **PASS** |
| ADV-3.7 | Suite 3 | Non-numeric string quantity | 400 VALIDATION_ERROR | 400 VALIDATION_ERROR | **PASS** |
| ADV-3.8 | Suite 3 | Infinity quantity on `/api/draft/needs` | 400 VALIDATION_ERROR | 400 VALIDATION_ERROR | **PASS** |
| ADV-3.9 | Suite 3 | Fractional positive quantity (`0.5`) | 201 Created | 201 Created | **PASS** |
| ADV-3.10 | Suite 3 | Boundary limits on catalog search (`-10`, `99999`) | Clamped (1-100) | Clamped safely | **PASS** |
| ADV-4.1 | Suite 4 | GET `/api/nonexistent-route` | 404 JSON NOT_FOUND | 404 JSON NOT_FOUND | **PASS** |
| ADV-4.2 | Suite 4 | POST `/api/draft` (unsupported method) | 404 Not Found | 404 Not Found | **PASS** |
| ADV-4.3 | Suite 4 | GET `/api/orders/export-batch` (unsupported) | 404 Not Found | 404 Not Found | **PASS** |
| ADV-4.4 | Suite 4 | GET `/not-an-api` (unmatched route) | 404 Text Not Found | 404 Text Not Found | **PASS** |
| ADV-5.1 | Suite 5 | Empty draft export | `DISCREPANCIES_DETECTED` | `DISCREPANCIES_DETECTED` | **PASS** |
| ADV-5.2 | Suite 5 | Draft with 3 unresolved items | 3 item discrepancies | 3 compiled in list | **PASS** |
| ADV-5.3 | Suite 5 | Zero-stock item (`g-1006`) | Blocking stock shortage | Blocking discrepancy | **PASS** |
| ADV-5.4 | Suite 5 | Quantity exceeding stock (`g-1004`, qty 50 > 2) | Blocking stock shortage | Blocking discrepancy | **PASS** |
| ADV-5.5 | Suite 5 | TTAC divergence (>10,000 Rial on `g-1004`) | Advisory warning + SUBMITTED | Warning compiled + SUBMITTED | **PASS** |
| ADV-5.6 | Suite 5 | Replay identical `uniqueId` | `status: "CACHED"` | `status: "CACHED"`, same ID | **PASS** |
| ADV-5.7 | Suite 5 | Combined draft (unresolved + stock + TTAC) | All 3 categories compiled | All 3 compiled, blocked | **PASS** |
| ADV-6.1 | Suite 6 | High-concurrency burst (25 parallel needs) | All 25 added without loss | 25 items, 25 events | **PASS** |

---

## Verified Robust Capabilities

Despite the input type crash vulnerabilities noted above, the following subsystems exhibited exceptional resilience:
1. **Batch Export Discrepancy Engine**:
   - Accurately distinguished between **blocking discrepancies** (unresolved items, zero-stock, insufficient inventory) and **advisory warnings** (TTAC price divergence > 10,000 Rials).
   - In advisory-only scenarios (ADV-5.5), batch creation succeeded (`status: "SUBMITTED"`), while properly forwarding the pricing warnings to the response payload.
   - In mixed scenarios (ADV-5.7), all three distinct classes of discrepancies were compiled together and the export was blocked.
2. **Idempotency Engine**:
   - Retrying `/api/orders/export-batch` with an identical `uniqueId` instantly returned `status: "CACHED"` with `isIdempotentReplay: true` and the original `batchId`.
3. **CORS Preflight Matrix**:
   - 100% of the 9 operational REST endpoints and the `/mcp` endpoint returned `204 No Content` with appropriate `Access-Control-Allow-Origin` and `Access-Control-Allow-Methods`.
4. **Concurrency & Mutex Integrity**:
   - 25 concurrent requests executed in parallel without any lost events, corrupted order items, or race conditions.

---

## Unchallenged Areas

- **Disk I/O failure injection**: File system write errors or permission denials on `state/order-draft.json` during high load were not tested (deferred to Milestone 3 event sourcing track).
- **Live Qanoon Network Transport**: Live network timeouts and SSL degradation were not tested; testing was conducted in offline mock fixture mode per architectural guidelines.

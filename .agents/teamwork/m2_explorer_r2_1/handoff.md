# Handoff Report: Server Input Type Guards & Top-Level Error Boundary

- **Sender:** `m2_explorer_r2_1`
- **Recipient:** Orchestrator (`ba9cb93f-aa16-41f9-a7c1-f88d790936d4`) / M2 Worker
- **Task:** Remediation Analysis for TypeError crashes and missing HTTP error boundary in `src/server.js`
- **Working Directory:** `/home/admin/PanelPH/.agents/teamwork/m2_explorer_r2_1`
- **Target File:** `/home/admin/PanelPH/src/server.js`
- **Handoff Type:** Hard (Analysis Complete)

---

## 1. Observation

Direct code inspections and empirical execution revealed the following concrete evidence:

1. **Reproduction Output (ADV-3.1 to ADV-3.5):**
   Executing `node /tmp/m2-adversarial-test.mjs` against `src/server.js` produced 5 failing test scenarios with unhandled process crashes:
   ```
   ✘ [ADV-3.1] Suite 3: POST /api/draft/needs with numeric name crashes with unhandled TypeError -> FAIL
   ✘ [ADV-3.2] Suite 3: POST /api/draft/needs with boolean name crashes with unhandled TypeError -> FAIL
   ✘ [ADV-3.3] Suite 3: PATCH /api/draft/needs/:id with numeric name crashes server -> FAIL
   ✘ [ADV-3.4] Suite 3: POST /api/draft/needs/:id/resolve with numeric title crashes server -> FAIL
   ✘ [ADV-3.5] Suite 3: POST /api/draft/revert with numeric eventId crashes server -> FAIL
   ```
   Verbatim child process crash stack trace:
   ```
   file:///home/admin/PanelPH/src/server.js:618
           const name = body.name?.trim();
                                   ^
   TypeError: body.name?.trim is not a function
       at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:618:33)
   ```

2. **Source Code Inspection (`src/server.js`):**
   - **Line 618:** `const name = body.name?.trim();` inside `POST /api/draft/needs`. Optional chaining `?.` only checks for `null`/`undefined`. When `body.name` is a number (`12345`), boolean (`true`), object, or array, `body.name?.trim` evaluates `(12345).trim` which is `undefined`, and `()` throws synchronous `TypeError`. Line 618 is outside any `try/catch` block.
   - **Line 655:** `if (body.name !== undefined && !body.name?.trim())` inside `PATCH /api/draft/needs/:needId`. Non-string `body.name` executes `body.name?.trim()` outside any `try/catch` block, throwing `TypeError`.
   - **Line 694:** `if (!ref || !ref.title || !ref.title.trim())` inside `POST /api/draft/needs/:needId/resolve`. When `ref.title` is a number or boolean, `ref.title` is truthy, executing `ref.title.trim()` outside any `try/catch` block, throwing `TypeError`. Line 699 also calls `ref.title.trim()` unconditionally.
   - **Line 727:** `const eventId = body.eventId?.trim();` inside `POST /api/draft/revert`. Non-string `body.eventId` executes `.trim()` outside any `try/catch` block, throwing `TypeError`.
   - **Lines 534-810:** `const httpServer = createServer(async (request, response) => { ... })`. There is no overarching `try/catch` block enclosing the request listener callback. Any exception thrown in an async HTTP listener in Node.js 16+ becomes an `UnhandledPromiseRejection`, terminating the Node.js process (`exit code 1`).
   - **Line 84 (`readJsonBody`):** `if (typeof parsed !== "object" || parsed === null)` allows JSON arrays (`typeof [] === "object"`) to pass through without being recognized as invalid object bodies.

3. **Baseline Test Suite Execution:**
   Command `npm test` exited with code 0:
   `ℹ tests 113, ℹ pass 113, ℹ fail 0, duration_ms ~3879ms`.

---

## 2. Logic Chain

1. From **Observation 1 & 2**, `body.name?.trim()`, `ref.title.trim()`, and `body.eventId?.trim()` assume that non-nullish values are strings.
2. In JavaScript, primitive numbers (`123`), booleans (`true`), arrays (`[]`), and plain objects (`{}`) do not possess a `trim()` method on their prototype chain.
3. Therefore, passing non-string values causes a synchronous `TypeError: ...trim is not a function`.
4. Because lines 618, 655, 694, and 727 reside outside the local `try { ... } catch` blocks (which only enclose store calls), the error propagates to the top-level callback of `http.createServer`.
5. From **Observation 2 (Lines 534-810)**, the async request handler has no outer error boundary. In Node.js, an unhandled rejection in an async HTTP server listener triggers an `UnhandledPromiseRejection` fatal event, killing the process with exit code 1.
6. This creates a high-severity Denial-of-Service vulnerability: any client sending a single malformed JSON payload crashes the server for all users.
7. To resolve this completely, two coordinated defenses are required:
   - **Type Guard Layer:** Validate incoming parameters before calling string methods. Required string fields must be checked with `isNonEmptyString(val)`. Optional text fields must be sanitized with `safeTrim(val)`. Numeric quantities must be verified with `isPositiveNumber(val)` (which also prevents the `Number(true) === 1` coercion vulnerability). Invalid inputs must return HTTP `400 VALIDATION_ERROR` with descriptive Persian error messages, conforming to API contracts and test expectations.
   - **Top-Level Error Boundary:** Wrap the entire listener body of `createServer` in `try { ... } catch (fatalError) { ... }`. If any unanticipated exception escapes local handling, the boundary intercepts it, logs the stack trace, and writes a uniform `500 INTERNAL_SERVER_ERROR` (or `400 BAD_REQUEST` for URL parse failures) JSON envelope, leaving the process healthy and responsive.

---

## 3. Caveats

1. **Scope Boundary:** This investigation is strictly read-only per the explorer mandate. No direct edits were committed to `src/server.js`.
2. **Catalog Resolver Separation:** Alef variant normalization (`[آأإٱ]` -> `ا`) and dosage form alias over-matching are addressed in parallel by `m2_explorer_r2_2`. Non-string item properties in catalog data and trailing slash URL normalization are addressed by `m2_explorer_r2_3`.
3. **Draft Store Exception Propagation:** While `src/draft-store.js` also contains calls to `.trim()` (e.g. lines 86, 97, 98, 118), those calls are executed inside store methods that are already shielded by inner route `try/catch` blocks in `server.js`. Sanitizing inputs at the HTTP boundary prevents invalid values from ever reaching `draft-store.js`.

---

## 4. Conclusion

The process crash vulnerabilities in `src/server.js` are fully understood, empirically reproducible, and easily remediated.

**Concrete Recommendations for M2 Worker:**
1. Export 4 type guard functions in `src/server.js`:
   - `isNonEmptyString(val)`: returns `typeof val === "string" && val.trim().length > 0`
   - `safeTrim(val, fallback = "")`: returns `typeof val === "string" ? val.trim() : fallback`
   - `isPositiveNumber(val)`: checks finite positive number while explicitly rejecting booleans (`val === true`), null, and NaN.
   - `isPlainObject(val)`: checks `typeof val === "object" && val !== null && !Array.isArray(val)`.
2. In `readJsonBody`: Add `|| Array.isArray(parsed)` to reject array bodies as `400 INVALID_JSON`.
3. In `POST /api/draft/needs`:
   - Extract `rawName = body.name !== undefined ? body.name : body.rawText`.
   - Validate with `if (!isNonEmptyString(rawName)) return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز الزامی است.");`.
   - Validate `isPositiveNumber(body.quantity)` returning 400 `"تعداد باید عدد مثبت باشد."`.
   - Validate optional `body.unit` and `body.note` with `typeof === "string"` or `safeTrim`.
4. In `PATCH /api/draft/needs/:needId`:
   - If `body.name` / `body.rawText` is present: validate with `isNonEmptyString`.
   - If `body.quantity` is present: validate with `isPositiveNumber`.
   - Validate optional `unit` and `note` before calling `updateNeed`.
5. In `POST /api/draft/needs/:needId/resolve`:
   - Validate `if (!isPlainObject(ref))` returning 400.
   - Validate `if (!isNonEmptyString(ref.title))` returning 400 `"عنوان کالای مرجع لازم است."`.
   - Format `cleanRef` using `normalizeCodeString` for `genericCode` and `brandCode`, and `safeTrim` for `dosageForm` and `strength`.
6. In `POST /api/draft/revert`:
   - Validate `if (!isNonEmptyString(body.eventId)) return sendError(response, 400, "VALIDATION_ERROR", "شناسه رخداد الزامی است.");`.
7. In `POST /api/stock/check` & `POST /api/orders/export-batch`:
   - Validate `requestedCount` with `isPositiveNumber`.
   - Validate `uniqueId` with `isNonEmptyString` if supplied.
   - Validate `roundingRule` against `["round", "ceil", "floor"]`.
8. In `http.createServer`:
   - Enclose the entire request listener body in a `try { ... } catch (fatalError)` boundary that writes a `500 INTERNAL_SERVER_ERROR` JSON response (shielded by `!response.headersSent`).
   - Catch `new URL()` parse errors and respond with `400 BAD_REQUEST`.

Detailed code diffs and replacement chunks are documented in `/home/admin/PanelPH/.agents/teamwork/m2_explorer_r2_1/analysis.md`.

---

## 5. Verification Method

To independently verify the implementation:

1. **Verify Baseline Test Suite:**
   ```bash
   cd /home/admin/PanelPH
   npm test
   ```
   *Expected:* Exit code 0, all 113+ tests pass.

2. **Verify Adversarial Stress Suite:**
   ```bash
   node /tmp/m2-adversarial-test.mjs
   ```
   *Expected:* Exit code 0, 46/46 passed (0 failures). Specifically, `ADV-3.1`, `ADV-3.2`, `ADV-3.3`, `ADV-3.4`, and `ADV-3.5` must transition from `FAIL` to `PASS`.

3. **Verify Process Liveness Under Fault Injection:**
   Send a numeric payload to `POST /api/draft/needs` and verify that the server returns `400` and immediately responds to a subsequent `GET /api/draft`:
   ```bash
   curl -s -X POST http://localhost:8787/api/draft/needs \
     -H "Content-Type: application/json" \
     -d '{"name": 12345, "quantity": 1}'
   # Expect: {"error":{"code":"VALIDATION_ERROR","message":"نام نیاز الزامی است."}}
   
   curl -s http://localhost:8787/api/draft
   # Expect: 200 OK with draft payload (server process did not die)
   ```
4. **Invalidation Conditions:**
   - Any test scenario in `/tmp/m2-adversarial-test.mjs` exits with ECONNRESET or child exit code 1.
   - `npm test` fails any existing test.
   - Any non-string payload produces a 500 status code instead of a 400 validation error.

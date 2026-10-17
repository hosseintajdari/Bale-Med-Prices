# Handoff Report: Milestone 2 Adversarial Verification

**Target Repository:** `/home/admin/PanelPH`  
**Agent:** `m2_challenger_1` (Empirical Challenger)  
**Working Directory:** `/home/admin/PanelPH/.agents/teamwork/m2_challenger_1`  
**Timestamp:** 2026-10-14T10:35:00Z  
**Verdict:** **REQUEST_CHANGES**  

---

## 1. Observation

1. **Baseline Test Suite Execution:**
   - Command: `npm test` (or `node --test`) in `/home/admin/PanelPH`.
   - Result: 113 tests passed, 0 failed, duration ~4960ms, exit code 0.
   - Verbatim output:
     ```
     ℹ tests 113
     ℹ suites 0
     ℹ pass 113
     ℹ fail 0
     ℹ duration_ms 4960.108516
     ```

2. **Empirical Stress Testing Execution (`/tmp/m2-adversarial-test.mjs`):**
   - Executed 46 adversarial scenarios covering 6 distinct testing suites against active server instances:
     - Total Scenarios: 46
     - Passed: 41
     - Failed: 5 (active process crash vulnerabilities)
   - Verbatim summary output:
     ```
     === ADVERSARIAL STRESS TEST SUMMARY ===
     Total Scenarios: 46
     Passed: 41
     Failed / Flagged Vulnerabilities: 5
     ```

3. **Verbatim Crash Observations & Error Traces:**
   - **Observation 3.1 (`src/server.js:618` - `POST /api/draft/needs`):**
     Payload: `{"name": 12345, "quantity": 2}`
     Node runtime crash trace:
     ```
     file:///home/admin/PanelPH/src/server.js:618
             const name = body.name?.trim();
                                     ^
     TypeError: body.name?.trim is not a function
         at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:618:33)
         at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
     Node.js v24.21.0
     ```
     Exit code: Process terminated immediately with code 1, dropping all HTTP connections.
   - **Observation 3.2 (`src/server.js:655` - `PATCH /api/draft/needs/:needId`):**
     Payload: `{"name": 9999}`
     Trace: `TypeError: body.name?.trim is not a function` at `src/server.js:655:35`.
     Exit code: Process terminated immediately with code 1.
   - **Observation 3.3 (`src/server.js:694` - `POST /api/draft/needs/:needId/resolve`):**
     Payload: `{"reference": {"title": 12345}}`
     Trace: `TypeError: ref.title.trim is not a function` at `src/server.js:694:38`.
     Exit code: Process terminated immediately with code 1.
   - **Observation 3.4 (`src/server.js:727` - `POST /api/draft/revert`):**
     Payload: `{"eventId": 12345}`
     Trace: `TypeError: body.eventId?.trim is not a function` at `src/server.js:727:36`.
     Exit code: Process terminated immediately with code 1.
   - **Observation 3.5 (`src/server.js:534-810` - Global HTTP Server Scope):**
     The `http.createServer(async (request, response) => { ... })` handler does not have an overarching `try/catch` wrapper. Any uncaught rejection within the async handler terminates the Node.js process.

4. **Verified Functional Capabilities (Passing Tests):**
   - **Batch Export Discrepancy Detection (Suite 5):**
     - Empty draft: returns `200` with `success: false`, `status: "DISCREPANCIES_DETECTED"`, and `پیش‌نویس سفارش خالی است...`.
     - 3 unresolved items: compiles 3 distinct unresolved item messages with IDs.
     - Zero stock (`g-1006`): compiles `کسری موجودی برای Out of Stock Item: درخواستی 1، موجود 0` and blocks export.
     - Shortage (`g-1004` requested 50, stock 2): compiles shortage discrepancy and blocks export.
     - TTAC divergence warning (>10,000 Rial on `g-1004`): compiles `هشدار قیمت برای Cough Syrup 120ml: Price divergence: TTAC price (135000) differs from Qanoon price (110000) by more than 10,000 Rials.` into `discrepancies` while permitting successful export (`status: "SUBMITTED"`, `success: true`).
     - Idempotent replay: Replaying identical `uniqueId` returns `status: "CACHED"` with `isIdempotentReplay: true`.
     - Multi-discrepancy draft: Compiles unresolved, stock shortage, and TTAC warning simultaneously into `discrepancies`.
   - **CORS Preflight (Suite 2):**
     - All 9 operational REST endpoints and `/mcp` return `204 No Content` with `Access-Control-Allow-Origin: *`.
   - **Concurrency (Suite 6):**
     - Burst of 25 parallel POST `/api/draft/needs` requests handled serially by the mutex without data corruption or dropped items.

---

## 2. Logic Chain

1. Per `ORIGINAL_REQUEST.md` (R2) and `PROJECT.md` (F9, F11), the backend operational server must provide robust REST endpoints and batch export discrepancy handling.
2. An adversarial review requires testing boundary conditions, invalid types, and malformed inputs to surface failure modes that cause downtime or state corruption.
3. In JavaScript, optional chaining `obj.prop?.method()` checks whether `obj.prop` is `null` or `undefined`. If `obj.prop` is a number (e.g. `12345`), `obj.prop` is neither null nor undefined, but `(12345).trim` is `undefined`. Invoking it (`(12345).trim()`) causes the runtime to throw `TypeError: ...trim is not a function`.
4. In `src/server.js`, lines 618, 655, 694, and 727 invoke `.trim()` on properties of `body` or `body.reference` assuming they are strings.
5. In Node.js 16+, unhandled rejections in async HTTP request handlers terminate the Node process.
6. Observations 3.1 through 3.4 empirically demonstrate that an external client sending a numeric value for `name`, `title`, or `eventId` causes the HTTP server to crash immediately, resulting in a Denial of Service.
7. Furthermore, Observation 3.5 demonstrates that `src/server.js` lacks an overarching `try/catch` error boundary around the request handler, compounding the severity of unhandled exceptions.
8. Therefore, while core business logic (discrepancies, pricing, idempotency, CORS) is implemented correctly, the implementation cannot be approved until these crash vulnerabilities are remediated.

---

## 3. Caveats

- **No Caveats.**
- All testing was executed offline using the built-in mock database fixtures (`fixtures/qanoon-mock-data.json`) and temporary file state directories (`/tmp/panelph-adv-m2-*`).
- No live network requests were made to remote servers.
- Implementation source code in `src/` was strictly not modified, in accordance with the review-only constraint.

---

## 4. Conclusion

**VERDICT: REQUEST_CHANGES**

Milestone 2 cannot be approved in its current state due to high-severity process crash / Denial-of-Service vulnerabilities triggered by non-string JSON parameter types on 4 REST endpoints (`POST /api/draft/needs`, `PATCH /api/draft/needs/:needId`, `POST /api/draft/needs/:needId/resolve`, and `POST /api/draft/revert`).

### Required Changes for `m2_worker`:
1. **Type Guards on Input Strings (`src/server.js`):**
   - Line 618: `const name = typeof body.name === "string" ? body.name.trim() : "";`
   - Line 655: `if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) { return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز نمی‌تواند خالی باشد."); }`
   - Line 694: `if (!ref || typeof ref.title !== "string" || !ref.title.trim()) { return sendError(response, 400, "VALIDATION_ERROR", "عنوان کالای مرجع لازم است."); }`
   - Line 727: `const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";`
2. **Global HTTP Request Error Boundary (`src/server.js:534-810`):**
   - Wrap the entire async request listener body in `try { ... } catch (err) { sendError(response, 500, "INTERNAL_SERVER_ERROR", err.message); }` to guarantee that unexpected errors never crash the Node.js process.

---

## 5. Verification Method

To independently reproduce the findings and verify remediation:

1. **Run Full Test Suite Baseline:**
   ```bash
   npm test
   ```
   *Expected:* 113 passed, 0 failed, exit code 0.

2. **Run Empirical Adversarial Test Harness:**
   ```bash
   node /tmp/m2-adversarial-test.mjs
   ```
   *Current Result:* 41 passed, 5 failed with `TypeError: ...trim is not a function`.
   *Post-Fix Invalidation Condition:* 46 passed, 0 failed, exit code 0.

3. **Inspect Detailed Challenge Report:**
   ```bash
   cat /home/admin/PanelPH/.agents/teamwork/m2_challenger_1/challenge_report.md
   ```

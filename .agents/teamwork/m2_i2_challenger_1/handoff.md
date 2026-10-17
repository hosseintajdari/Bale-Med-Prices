# Handoff Report: Milestone 2 Iteration 2 Adversarial Assessment

**Target:** `src/catalog-resolver.js` and `src/server.js`  
**Agent:** `m2_i2_challenger_1` (Empirical Challenger)  
**Working Directory:** `/home/admin/PanelPH/.agents/teamwork/m2_i2_challenger_1`  
**Timestamp:** 2026-10-14T13:31:00Z  
**Verdict:** **`REQUEST_CHANGES`**  

---

## 1. Observation

### 1.1 Baseline Test Suite Status
Executing the standard test suite `npm test` (or `node --test`):
- **Command:** `npm test`
- **Exit Code:** 0
- **Verbatim Output Summary:**
  ```
  PanelPH MCP App listening at http://localhost:0/mcp
  ✔ serves MCP initialization through the local endpoint (764.77277ms)
  ℹ tests 118
  ℹ suites 0
  ℹ pass 118
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 4613.525077
  ```
The baseline unit and integration tests pass 100%.

---

### 1.2 Adversarial Test Suite Execution (`/tmp/m2_i2_adversarial_suite.mjs`)
- **Command:** `node /tmp/m2_i2_adversarial_suite.mjs`
- **Exit Code:** 1
- **Verbatim Output Summary:**
  ```
  Total Adversarial Scenarios: 28
  Passed:                      16
  Failed / Vulnerabilities:    12
  OVERALL VERDICT: REQUEST_CHANGES
  ```

---

### 1.3 Confirmed High-Severity Process Crash / Denial-of-Service in `src/server.js`

Direct empirical execution of isolated child server processes receiving non-string JSON payloads:

#### Observation 1.3.1: `POST /api/draft/needs` (`src/server.js:618`)
- **Payload:** `{"name": 12345, "quantity": 1}`
- **Exit Code:** 1 (process terminated immediately)
- **Verbatim Error Trace:**
  ```
  file:///home/admin/PanelPH/src/server.js:618
          const name = body.name?.trim();
                                  ^

  TypeError: body.name?.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:618:33)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

  Node.js v24.21.0
  ```
- Also verified to crash with `{ "name": true }` and `{ "name": { "drug": "Amox" } }`.

#### Observation 1.3.2: `PATCH /api/draft/needs/:needId` (`src/server.js:655`)
- **Payload:** `{"name": 9999}`
- **Exit Code:** 1 (process terminated immediately)
- **Verbatim Error Trace:**
  ```
  file:///home/admin/PanelPH/src/server.js:655
          if (body.name !== undefined && !body.name?.trim()) {
                                                     ^

  TypeError: body.name?.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:655:52)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

  Node.js v24.21.0
  ```

#### Observation 1.3.3: `POST /api/draft/needs/:needId/resolve` (`src/server.js:694`)
- **Payload:** `{"reference": {"title": 12345}}`
- **Exit Code:** 1 (process terminated immediately)
- **Verbatim Error Trace:**
  ```
  file:///home/admin/PanelPH/src/server.js:694
          if (!ref || !ref.title || !ref.title.trim()) {
                                               ^

  TypeError: ref.title.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:694:46)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

  Node.js v24.21.0
  ```

#### Observation 1.3.4: `POST /api/draft/revert` (`src/server.js:727`)
- **Payload:** `{"eventId": 12345}`
- **Exit Code:** 1 (process terminated immediately)
- **Verbatim Error Trace:**
  ```
  file:///home/admin/PanelPH/src/server.js:727
          const eventId = body.eventId?.trim();
                                        ^

  TypeError: body.eventId?.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:727:39)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

  Node.js v24.21.0
  ```

#### Observation 1.3.5: Missing Global Try/Catch on `http.createServer` (`src/server.js:534-810`)
Inspection of `src/server.js` line 534 shows:
```javascript
const httpServer = createServer(async (request, response) => {
  if (!request.url) return response.writeHead(400).end("Missing URL");
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
```
The async request callback is not wrapped in a global `try/catch` block. Any uncaught exception thrown during routing or validation becomes an unhandled rejection, aborting all active connections and killing the Node process.

---

### 1.4 Confirmed False-Positive Resolution for Isolated Units, Dosages, and Statuses in `src/catalog-resolver.js`

Direct execution of isolated clinical queries against `searchCatalog` and `resolveItem`:
- **Command:**
  ```bash
  node -e '
  import { resolveItem, searchCatalog } from "./src/catalog-resolver.js";
  for (const q of ["mg", "ml", "واحد", "ویال", "شربت", "ناموجود", "۵۰۰ میلی گرم"]) {
    const res = resolveItem(q);
    const hits = searchCatalog(q);
    console.log(`Q: "${q}" -> hits: ${hits.length}, suggested: "${res.suggestedReference?.title}" (score: ${hits[0]?.score})`);
  }'
  ```
- **Exit Code:** 0
- **Verbatim Stdout:**
  ```
  Q: "mg" -> hits: 2, suggested: "Acetaminophen 325mg Tablet" (score: 0.52)
  Q: "ml" -> hits: 1, suggested: "Cough Syrup 120ml" (score: 0.54)
  Q: "واحد" -> hits: 1, suggested: "Vitamin D3 1000IU Capsule" (score: 0.55)
  Q: "ویال" -> hits: 1, suggested: "Educational Sample Vial" (score: 0.55)
  Q: "شربت" -> hits: 2, suggested: "Cough Syrup 120ml" (score: 0.9)
  Q: "ناموجود" -> hits: 1, suggested: "Out of Stock Item" (score: 0.62)
  Q: "۵۰۰ میلی گرم" -> hits: 1, suggested: "Amoxicillin 500mg Capsule" (score: 0.64)
  ```

Inspection of `src/catalog-resolver.js` reveals the root causes:
1. **Tier 3 Prefix Matching (`src/catalog-resolver.js:298`):**
   ```javascript
   if (normTitle.startsWith(normQuery) || normPersianTitle.startsWith(normQuery)) return 0.90;
   ```
   Because `Cough Syrup 120ml` has `persianTitle: "شربت سرفه ۱۲۰ میلی‌لیتر"`, querying the isolated dosage form `"شربت"` satisfies `.startsWith("شربت")` and yields an inflated score of 0.90 without checking if the query consists only of generic dosage/stop tokens.
2. **Tier 5 Substring Containment (`src/catalog-resolver.js:350-354`):**
   ```javascript
   if (normTitle.includes(normQuery) || normPersianTitle.includes(normQuery)) {
     const lenRatio = Math.min(1, normQuery.length / Math.max(normTitle.length, 1));
     const subScore = 0.50 + 0.30 * lenRatio;
     return Math.round(subScore * 100) / 100;
   }
   ```
   Because `Acetaminophen 325mg Tablet` contains `"mg"`, `Cough Syrup 120ml` contains `"ml"`, `Vitamin D3 1000IU Capsule` contains `"واحد"`, and `Amoxicillin 500mg Capsule` contains `"500 میلی گرم"`, any query containing solely a generic unit or dosage triggers Tier 5, yielding scores > 0.50 (above `minScore = 0.15`).
3. **Drawer Auto-Suggestion Trigger (`src/catalog-resolver.js:492`):**
   ```javascript
   if (topMatch.score >= 0.40) {
     return {
       resolved: false,
       confidence: "medium",
       isAmbiguous: true,
       bestMatch: topMatch,
       candidates: candidateList,
       suggestedReference,
     };
   }
   ```
   Scores >= 0.40 populate `suggestedReference`, meaning typing `"mg"` falsely suggests Acetaminophen, and typing `"۵۰۰ میلی گرم"` falsely suggests Amoxicillin.

---

### 1.5 Confirmed Robust Capabilities (Passing Checks)

1. **Diacritics & Normalization:**
   - Arabic diacritics (`[\u064B-\u065F\u0670]`, harakat) are cleanly stripped.
   - All 5 Alef variants (`اموکسی`, `آموکسی`, `أموکسی`, `إموکسی`, `ٱموکسی`) resolve to `Amoxicillin 500mg Capsule` (`00001`).
   - Yeh variants (`ی`, `ي`, `ى`) resolve to `Diphenhydramine`.
   - ZWNJ (`\u200c`) normalizes cleanly.
2. **Leading Zero Preservation:**
   - Codes `"00001"`, `"08234"`, `"00025"`, `"04210"`, `"00115"`, `"00999"` are strictly preserved as strings across both `searchCatalog` and REST `GET /api/catalog/search?q=00001`.
   - Persian numeral codes (`"۰۰۰۰۱"`, `"۰۸۲۳۴"`) transliterate while strictly preserving leading zero strings (`"00001"`, `"08234"`).
3. **Compound Clinical Queries:**
   - `"ویال سفتریاکسون ۱ گرم"` correctly rejects `Educational Sample Vial` (`g-1007`).
   - `"شربت کتوتیفن"` correctly rejects `Cough Syrup` (`g-1004`) and `Diphenhydramine` (`g-1002-diphen`).
   - `"سفتریاکسون ناموجود"` correctly rejects `Out of Stock Item` (`g-1006`).
4. **Fuzzing & Payload Safety:**
   - 100,000 character queries complete in 244ms without ReDoS or event loop hangs.
   - Malformed JSON is rejected with 400 `INVALID_JSON`.
   - JSON array bodies are rejected with 400 `INVALID_JSON`.
   - Payload > 1MB is rejected with 413 `PAYLOAD_TOO_LARGE`.
   - CORS OPTIONS returns 204 with `Access-Control-Allow-Origin: *`.

---

## 2. Logic Chain

1. **Premise 1 (`ORIGINAL_REQUEST.md` R2, `PROJECT.md` F9):** The backend operational server must expose stable, production-grade REST endpoints.
2. **Premise 2 (JavaScript Optional Chaining Semantics):** In JS, `obj.val?.trim()` checks whether `obj.val` is null or undefined. If `obj.val` is a number (e.g., `12345`), boolean (`true`), or object (`{}`), `(12345).trim` is `undefined`, and invoking `(12345).trim()` throws `TypeError: ...trim is not a function`.
3. **Observation Reference 1.3:** In `src/server.js`, lines 618, 655, 694, and 727 invoke `.trim()` on `body.name`, `ref.title`, and `body.eventId` without checking `typeof ... === "string"`.
4. **Premise 3 (Node.js Process Crash Semantics):** In Node.js 16+, an unhandled exception inside an `http.createServer(async ...)` listener terminates the process unless wrapped in a `try/catch`.
5. **Observation Reference 1.3.5:** `src/server.js:534` lacks a `try/catch` wrapper. As directly shown by isolated process tests (Observation 1.3.1 - 1.3.4), an external HTTP request with `{ "name": 12345 }` causes the Node server process to terminate with exit code 1, taking down the entire service.
6. **Premise 4 (`DISPATCH.md` Task Requirement 2):** Edge-case testing requires: *"Rejection of false positives when queries contain isolated units, dosages, or inventory statuses."*
7. **Observation Reference 1.4:** When queries are isolated units (`"mg"`, `"ml"`, `"واحد"`), isolated dosages (`"۵۰۰ میلی گرم"`), or isolated statuses (`"ناموجود"`), Tier 3 and Tier 5 substring matching in `src/catalog-resolver.js` returns catalog items with scores 0.52 - 0.90, causing `resolveItem` to output false-positive ambiguity drawer suggestions.
8. **Deductive Conclusion:** Milestone 2 Iteration 2 cannot be approved while these two critical defects (Denial of Service crash on REST endpoints and false-positive resolution on isolated units/dosages/statuses) remain present.

---

## 3. Caveats

- **No Caveats.**
- All tests were executed strictly offline using built-in mock fixtures and isolated temporary states (`/tmp/panelph-adv-*`).
- Implementation files in `src/` were NOT modified, adhering strictly to the Review-Only constraint.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

Milestone 2 Iteration 2 demonstrates substantial progress in diacritics normalization, leading zero preservation, and compound formulation filtering. However, approval is blocked pending remediation of two concrete issues:

### Actionable Remediation Requirements for `m2_worker`:

#### 1. Fix Process Crash / Type Guards in `src/server.js`:
- **Line 618 (`POST /api/draft/needs`):**
  ```javascript
  const name = typeof body.name === "string" ? body.name.trim() : "";
  ```
- **Line 655 (`PATCH /api/draft/needs/:needId`):**
  ```javascript
  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
    return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز نمی‌تواند خالی باشد.");
  }
  ```
- **Line 694 (`POST /api/draft/needs/:needId/resolve`):**
  ```javascript
  if (!ref || typeof ref.title !== "string" || !ref.title.trim()) {
    return sendError(response, 400, "VALIDATION_ERROR", "عنوان کالای مرجع لازم است.");
  }
  ```
- **Line 727 (`POST /api/draft/revert`):**
  ```javascript
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  ```
- **Global Error Boundary (`src/server.js:534-810`):**
  Wrap the entire async request listener body in `try { ... } catch (err) { sendError(response, 500, "INTERNAL_SERVER_ERROR", err.message); }`.

#### 2. Guard Isolated Units, Dosages, and Statuses in `src/catalog-resolver.js`:
- In `scoreCandidate(query, candidate)`:
  - If all tokens of `normQuery` belong to `GENERIC_MEASURE_OR_STOP_TOKENS` or match `/^\d+$/`, the query is an isolated unit, dosage, or status and must immediately return `0`.
  - In Tier 3 (`normTitle.startsWith(normQuery)`), do not grant 0.90 if `GENERIC_MEASURE_OR_STOP_TOKENS.has(normQuery)`.
  - In Tier 5 (`normTitle.includes(normQuery)`), do not grant substring score if `normQuery` consists only of generic tokens or if `normQuery.length < 3`.

---

## 5. Verification Method

To independently reproduce the failures and verify fixes:

1. **Run Full Adversarial Test Suite:**
   ```bash
   node /tmp/m2_i2_adversarial_suite.mjs
   ```
   - **Current Output:** 16 PASS, 12 FAIL, exit code 1.
   - **Remediation Invalidation Criterion:** All 28 scenarios must PASS, exit code 0.

2. **Run Individual REST Crash Reproducer:**
   ```bash
   node -e '
   import { startServer } from "./src/server.js";
   import { once } from "node:events";
   const s = startServer({ port: 0 });
   await once(s, "listening");
   const p = s.address().port;
   fetch(`http://127.0.0.1:${p}/api/draft/needs`, {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ name: 12345, quantity: 1 })
   }).then(r => console.log("Status:", r.status)).catch(e => console.error("Crash:", e.message));
   '
   ```
   - **Current Output:** Crashes Node runtime with `TypeError: body.name?.trim is not a function`.
   - **Remediation Invalidation Criterion:** Returns HTTP 400 without crashing.

3. **Run Isolated Units False-Positive Reproducer:**
   ```bash
   node -e '
   import { resolveItem, searchCatalog } from "./src/catalog-resolver.js";
   const r = resolveItem("mg");
   if (r.suggestedReference) {
     console.error("FAIL: Suggested reference returned for isolated unit:", r.suggestedReference.title);
     process.exit(1);
   } else {
     console.log("PASS: Isolated unit rejected.");
   }'
   ```
   - **Current Output:** Exits with code 1 (`FAIL: Suggested reference returned for isolated unit: Acetaminophen 325mg Tablet`).
   - **Remediation Invalidation Criterion:** Exits with code 0 (`PASS: Isolated unit rejected`).

4. **Run Project Baseline Test Suite:**
   ```bash
   npm test
   ```
   - Must remain 100% passing (118/118 tests).

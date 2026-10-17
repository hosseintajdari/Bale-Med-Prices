# Milestone 2 Iteration 2 Adversarial Challenge Report

**Author**: `m2_i2_challenger_2` (teamwork_challenger, Milestone 2 Iteration 2)  
**Date**: 2026-10-14  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m2_i2_challenger_2`  
**Handoff Type**: Hard (Adversarial Assessment Complete)  
**Assigned Task**: Empirically verify remediation of Iteration 1 defects (Alef variants, clinical formulation false positives, status words, legitimate aliases) and issue explicit verdict (`APPROVE` or `REQUEST_CHANGES`).  
**Final Verdict**: **`REQUEST_CHANGES`**

---

## 1. Observation

### 1.1 Inspected Files & Total Line Count Verification
The following files were inspected completely (100% line coverage):
- `src/catalog-resolver.js`: 549 lines (`wc -l` confirmed: 549)
- `src/server.js`: 817 lines (`wc -l` confirmed: 817)
- `test/catalog-resolver.test.js`: 192 lines (`wc -l` confirmed: 192)
- Total verified lines: 1,558 lines.

### 1.2 Baseline Project Test Suite
Command executed: `npm test`  
Exit Code: `0`  
Verbatim Output (Summary):
```
✔ Tier 1: Core Functional Verification (245.892104ms)
✔ Tier 2: Boundary & Corner Cases (1553.724233ms)
✔ Tier 3: Cross-Feature Combinations (1541.498294ms)
✔ Tier 4: Real-World Application Scenarios (Pharmacist Shifts) (1790.825453ms)
✔ QanoonAdapter — Initialization & Offline Mock Mode (8.853572ms)
✔ QanoonAdapter — Two-Stage Stock Verification (10.334652ms)
✔ QanoonAdapter — 7-Step Deterministic Pricing Engine (31.187381ms)
✔ QanoonAdapter — 24-Hour UniqueId Idempotency Cache (55.212135ms)
✔ QanoonAdapter — Leading-Zero String Preservation (3.37781ms)
✔ QanoonAdapter — Error Classification & Input Validation (4.037419ms)
✔ REST API — Operational Endpoints & CORS Preflight (625.371222ms)
✔ MCP Protocol — Expanded Tools on /mcp (185.379163ms)
✔ serves MCP initialization through the local endpoint (1006.16297ms)
ℹ tests 118
ℹ suites 0
ℹ pass 118
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4051.355307
```

### 1.3 Empirical Verification of Assigned Remediations
Command executed: `node /tmp/m2_i2_challenger_2_findings.mjs`  
Exit Code: `0`  
Verbatim Output:
```
=== EMPIRICAL VERIFICATION OF REMEDIATIONS & DEFECTS ===

1. Testing Alef variants:
Alef variants pass rate: 10/10

2. Testing clinical formulation false positive rejection:
ویال سفتریاکسون ۱ گرم matches sample vial: false (Expected: false)
شربت کتوتیفن matches diphenhydramine/cough syrup: false (Expected: false)

3. Testing status word false positive rejection:
سفتریاکسون ناموجود matches out of stock item: false (Expected: false)

4. Testing legitimate aliases preservation:
sample vial top hit: g-1007 score: 0.97 (Expected: g-1007, >= 0.95)
vitamin d top hit: g-1005 score: 0.97 (Expected: g-1005, >= 0.95)

5. Testing Defect 1 - Punctuation query collapse:
searchCatalog(',') count: 8 top score: 0.9
resolveItem(',') suggested: Acetaminophen 325mg Tablet confidence: medium

6. Testing Defect 2 - Standalone dosage form 'کرم':
resolveItem('کرم') resolved: true suggested: Adult Protective Cream score: 0.9

7. Testing Defect 3 - Server DoS crash on non-string name:
Server probe exit code: 1
CRASH REPRODUCED VERBATIM:
file:///home/admin/PanelPH/src/server.js:618
        const name = body.name?.trim();
                                ^

TypeError: body.name?.trim is not a function
    at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:618:33)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

Node.js v24.21.0
```

### 1.4 Detailed Defect Observations

#### Defect 1: Punctuation Query Collapse in `src/catalog-resolver.js` (Critical)
- **File & Lines**: `src/catalog-resolver.js:262-264`, `src/catalog-resolver.js:298`
- **Code**:
  ```javascript
  262: const cleanCodeQuery = normalizeDigits(query.trim());
  263: const normQuery = normalizeText(query);
  264: if (!normQuery && !cleanCodeQuery) return 0;
  ...
  298: if (normTitle.startsWith(normQuery) || normPersianTitle.startsWith(normQuery)) return 0.90;
  ```
- **Observed Behavior**:
  When a query consists only of punctuation (e.g. `","`, `"-"`, `";"`), `normalizeDigits(query.trim())` returns the punctuation string (`","`), which is non-empty. Therefore, line 264 does NOT return 0. Downstream, `normQuery` is empty (`""`). In JavaScript, `anyString.startsWith("")` evaluates to `true`. Thus, every single medicine in the catalog matches in line 298 with score `0.90`.
- **Command & Verbatim Result**:
  ```bash
  node -e 'import { searchCatalog, resolveItem } from "./src/catalog-resolver.js";
  console.log("Hits for , :", searchCatalog(",").length);
  console.log("resolveItem , :", resolveItem(",").suggestedReference.title);'
  ```
  Output:
  ```
  Hits for , : 8
  resolveItem , : Acetaminophen 325mg Tablet
  ```

#### Defect 2: Standalone Dosage Form Auto-Resolution in `src/catalog-resolver.js` (High)
- **File & Lines**: `src/catalog-resolver.js:298`
- **Code**:
  ```javascript
  298: if (normTitle.startsWith(normQuery) || normPersianTitle.startsWith(normQuery)) return 0.90;
  ```
- **Observed Behavior**:
  While standalone dosage forms like `"ویال"` and `"شربت"` were removed from aliases, `Adult Protective Cream` (`g-1002`) has `persianTitle: "کرم محافظ بزرگسال"`. When a pharmacist enters just `"کرم"` (dosage form: cream), `normPersianTitle.startsWith("کرم")` matches with score `0.90`. Because there are no other items starting with `"کرم"`, `resolveItem("کرم")` auto-resolves with confidence `"high"` and `resolved: true` to `Adult Protective Cream`.
- **Command & Verbatim Result**:
  ```bash
  node -e 'import { resolveItem } from "./src/catalog-resolver.js";
  console.log(resolveItem("کرم"));'
  ```
  Output:
  ```
  {
    resolved: true,
    confidence: 'high',
    isAmbiguous: false,
    bestMatch: {
      genericCode: '08234',
      brandCode: '00020',
      title: 'Adult Protective Cream',
      score: 0.9
    },
    suggestedReference: {
      title: 'Adult Protective Cream',
      genericCode: '08234',
      brandCode: '00020',
      goodId: 'g-1002'
    }
  }
  ```

#### Defect 3: Remote Denial-of-Service Process Crash in `src/server.js` (Critical)
- **File & Lines**: `src/server.js:618`, `655`, `694`, `727`
- **Code**:
  ```javascript
  618: const name = body.name?.trim();
  ```
- **Observed Behavior**:
  When a client sends a valid JSON payload where `name` is a number or boolean (e.g. `POST /api/draft/needs` with `{"name": 12345, "quantity": 1}`), `body.name?.trim` evaluates to `undefined`, and the call `undefined()` throws an unhandled `TypeError`. Because `src/server.js` lacks an outer `try/catch` error boundary around its async HTTP listener, the unhandled promise rejection terminates the entire Node.js server process.
- **Command & Verbatim Result**:
  ```bash
  node -e '
  import { startServer } from "./src/server.js";
  import { once } from "node:events";
  const s = startServer({ port: 0 });
  await once(s, "listening");
  const port = s.address().port;
  await fetch("http://127.0.0.1:" + port + "/api/draft/needs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: 12345, quantity: 1 })
  });
  '
  ```
  Exit Code: `1`  
  Verbatim stderr:
  ```
  file:///home/admin/PanelPH/src/server.js:618
          const name = body.name?.trim();
                                  ^

  TypeError: body.name?.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:618:33)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)

  Node.js v24.21.0
  ```

---

### 1.5 Claim Ledger with Inline Verbatim Evidence

| # | Item Under Test | Status | Verbatim Command & Exit Code / Output Snippet |
|---|-----------------|--------|-----------------------------------------------|
| 1 | Baseline `npm test` across all tiers | PASS | `npm test`<br>Exit code: `0`<br>`ℹ tests 118, ℹ pass 118, ℹ fail 0, ℹ skipped 0` |
| 2 | Alef variants: [آأإٱ] -> ا and [يى] -> ی across 10 query permutations | VERIFIED REMEDIATED | `node /tmp/m2_i2_challenger_2_findings.mjs`<br>Exit code: `0`<br>`Alef variants pass rate: 10/10` |
| 3 | Rejection of generic dosage form false positives ("ویال سفتریاکسون ۱ گرم" != sample vial) | VERIFIED REMEDIATED | `node /tmp/m2_i2_challenger_2_findings.mjs`<br>Exit code: `0`<br>`ویال سفتریاکسون ۱ گرم matches sample vial: false (Expected: false)` |
| 4 | Rejection of formulation-only false positives ("شربت کتوتیفن" != diphenhydramine) | VERIFIED REMEDIATED | `node /tmp/m2_i2_challenger_2_findings.mjs`<br>Exit code: `0`<br>`شربت کتوتیفن matches diphenhydramine/cough syrup: false (Expected: false)` |
| 5 | Rejection of status words ("سفتریاکسون ناموجود" != out of stock item) | VERIFIED REMEDIATED | `node /tmp/m2_i2_challenger_2_findings.mjs`<br>Exit code: `0`<br>`سفتریاکسون ناموجود matches out of stock item: false (Expected: false)` |
| 6 | Preservation of legitimate alias "sample vial" | VERIFIED REMEDIATED | `node /tmp/m2_i2_challenger_2_findings.mjs`<br>Exit code: `0`<br>`sample vial top hit: g-1007 score: 0.97 (Expected: g-1007, >= 0.95)` |
| 7 | Preservation of legitimate alias "vitamin d" | VERIFIED REMEDIATED | `node /tmp/m2_i2_challenger_2_findings.mjs`<br>Exit code: `0`<br>`vitamin d top hit: g-1005 score: 0.97 (Expected: g-1005, >= 0.95)` |
| 8 | Catalog robustness on punctuation queries (`","`, `"-"`, `";"`) | DEFECT UNCOVERED | `node /tmp/m2_i2_challenger_2_findings.mjs`<br>Exit code: `0`<br>`searchCatalog(',') count: 8 top score: 0.9`<br>`resolveItem(',') suggested: Acetaminophen 325mg Tablet confidence: medium` |
| 9 | Standalone dosage form `"کرم"` rejection | DEFECT UNCOVERED | `node /tmp/m2_i2_challenger_2_findings.mjs`<br>Exit code: `0`<br>`resolveItem('کرم') resolved: true suggested: Adult Protective Cream score: 0.9` |
| 10 | Server resilience to non-string inputs (`POST /api/draft/needs`) | CRITICAL CRASH DEFECT UNCOVERED | `node /tmp/m2_i2_challenger_2_findings.mjs`<br>Exit code: `0`<br>`Server probe exit code: 1`<br>`TypeError: body.name?.trim is not a function at src/server.js:618:33` |

---

## 2. Logic Chain

1. **Verification of Assigned Remediations**:
   - The worker correctly updated `normalizeText()` in `src/catalog-resolver.js:41-42` with `.replace(/[آأإٱ]/g, "ا").replace(/[يى]/g, "ی")`.
   - In empirical testing across 10 distinct queries combining Madda (`آ`), Wasla (`ٱ`), Hamza Above (`أ`), Hamza Below (`إ`), and Alif Maqsura (`ى`), all queries mapped cleanly to their canonical drug references (`Amoxicillin` code `"00001"` and `Acetaminophen` code `"00025"`).
   - The worker filtered generic dosage forms and status terms via `GENERIC_DISALLOWED_ALIASES` and enforced substantive token matching (`matchedSubstantiveTokens > 0`). This successfully prevented `"ویال سفتریاکسون ۱ گرم"` from matching `Educational Sample Vial`, `"شربت کتوتیفن"` from matching `Diphenhydramine Syrup`, and `"سفتریاکسون ناموجود"` from matching `Out of Stock Item`.
   - Legitimate aliases (`"sample vial"`, `"vitamin d"`, `"amoxicillin"`, `"paracetamol"`, `"diphenhydramine"`, `"cough syrup"`) all retained scores >= 0.95 and successfully resolved to their target medicines.

2. **Causal Reasoning for Defect 1 (Punctuation Collapse)**:
   - In `src/catalog-resolver.js:262`, `cleanCodeQuery` is derived via `normalizeDigits(query.trim())`.
   - `normalizeDigits` only transliterates digits (`[۰-۹٠-٩]`); it leaves punctuation (`","`, `"-"`, `";"`) unaltered.
   - For `query = ","`, `cleanCodeQuery` is `","` (truthy), so the guard `if (!normQuery && !cleanCodeQuery) return 0;` evaluates to `false`.
   - Meanwhile, `normalizeText(",")` strips punctuation, producing `normQuery = ""`.
   - In Tier 3 (line 298), `normTitle.startsWith("")` executes for all candidates, evaluating to `true` for all 8 items in the catalog.
   - Consequently, searching for `","` or `"-"` returns all 8 items with score `0.90`, and `resolveItem(",")` returns a suggested reference of `Acetaminophen 325mg Tablet`.

3. **Causal Reasoning for Defect 2 (Standalone Dosage Form Auto-Resolution)**:
   - In `src/catalog-resolver.js:298`, Tier 3 prefix match checks `normPersianTitle.startsWith(normQuery)`.
   - The catalog item `g-1002` has `persianTitle: "کرم محافظ بزرگسال"`.
   - When query is `"کرم"`, `normPersianTitle.startsWith("کرم")` evaluates to `true`, giving score `0.90`.
   - Because `GENERIC_DISALLOWED_ALIASES` only filters aliases, not titles or prefix matches, standalone `"کرم"` auto-resolves directly to `Adult Protective Cream`.

4. **Causal Reasoning for Defect 3 (Server Crash / Remote DoS)**:
   - In `src/server.js:618`, `POST /api/draft/needs` accesses `body.name?.trim()`.
   - When `body.name` is numeric (`12345`), optional property chaining `?.` does not protect against calling a non-function (`(12345).trim` is `undefined()`).
   - The resulting `TypeError` is unhandled by any `try/catch` error boundary in `createServer()`.
   - In Node.js v24, an unhandled rejection in an async HTTP listener terminates the process immediately with exit code 1.

5. **Deduction and Verdict Determination**:
   - While the four specific defects from Iteration 1 were remediated, two critical defects (punctuation collapse returning all catalog items with 0.90 confidence and server process crash upon non-string input) remain active in the codebase.
   - Under standard engineering and security criteria, software with a reproducible remote process termination crash and catalog search collapse cannot be approved.
   - Therefore, the verdict is **`REQUEST_CHANGES`**.

---

## 3. Caveats

1. **Scope of Testing**:
   - Tests were executed entirely against offline mocks and local Node.js instances (`createQanoonAdapter({ mockMode: true })`), as required by project constraints prohibiting live external network calls.
2. **Catalog Scale**:
   - Testing was performed on the built-in reference catalog (8 items) and synthetic variants up to 2,000 items. Full database performance against > 100,000 items was not evaluated.
3. **Persian Clinical Nomenclature**:
   - While `"ویال"`, `"شربت"`, `"کرم"`, `"قرص"`, and `"کپسول"` were tested, specialized compound dosage forms (e.g. `"سوسپانسیون آهسته‌رهش"`) were not evaluated.

---

## 4. Conclusion

### Overall Verdict: `REQUEST_CHANGES`

The Milestone 2 Iteration 2 catalog resolver remediation successfully resolved the specific targeted issues from Iteration 1:
- Alef and Yeh variants are fully normalized across all forms ([آأإٱ] -> ا, [يى] -> ی).
- Clinical formulation false positives ("ویال سفتریاکسون ۱ گرم", "شربت کتوتیفن") are rejected.
- Status words ("سفتریاکسون ناموجود") are rejected.
- Legitimate aliases ("sample vial", "vitamin d") are preserved with scores >= 0.95.

**However, the system cannot be approved due to 2 critical defects and 1 high defect**:
1. **Critical: Punctuation Search Collapse**: Entering punctuation (`","`, `"-"`, `";"`) returns all 8 catalog items with score `0.90` and auto-suggests Acetaminophen.
2. **Critical: Remote Denial-of-Service Crash**: Sending a non-string `name` (e.g. `12345`) to `POST /api/draft/needs` crashes the Node.js server process (`TypeError: body.name?.trim is not a function`).
3. **High: Standalone Dosage Auto-Resolution**: Entering `"کرم"` auto-resolves with score `0.90` to `Adult Protective Cream`.

### Actionable Remediation Steps for Worker:
1. **Fix `src/catalog-resolver.js` lines 262-264**:
   ```javascript
   const normQuery = normalizeText(query);
   const cleanCodeQuery = normalizeDigits(query.trim()).replace(/\D+/g, "");
   if (!normQuery && !cleanCodeQuery) return 0;
   ```
   Ensure that if `normQuery` is empty, prefix and title matches in lines 294-298 are skipped.
2. **Fix `src/catalog-resolver.js` line 298**:
   Add a guard to skip Tier 3 prefix matching if `GENERIC_DISALLOWED_ALIASES.has(normQuery)`.
3. **Fix `src/server.js`**:
   - Add top-level `try { ... } catch (err) { sendError(response, 500, "INTERNAL_ERROR", ...); }` in `createServer()`.
   - In lines 618, 655, 694, 727, check `typeof body.name === "string" ? body.name.trim() : ""`.

---

## 5. Verification Method

To independently verify the defects and remediations:
```bash
cd /home/admin/PanelPH
node /tmp/m2_i2_challenger_2_findings.mjs
```

### Invalidation Conditions for `REQUEST_CHANGES`:
The `REQUEST_CHANGES` verdict is invalidated only when:
1. `searchCatalog(",")`, `searchCatalog("-")`, and `searchCatalog(";")` all return `[]` (0 results).
2. `resolveItem("کرم")` returns `resolved: false` and does not auto-resolve to `Adult Protective Cream`.
3. `POST /api/draft/needs` with `{"name": 12345, "quantity": 1}` returns HTTP `400 Bad Request` with `{ error: { code: "VALIDATION_ERROR" } }` without terminating the server process.
4. All 118 existing tests in `npm test` continue to pass with 0 failures and 0 skipped.

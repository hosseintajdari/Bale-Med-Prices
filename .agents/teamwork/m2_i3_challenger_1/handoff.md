# Handoff Report: Milestone 2 Iteration 3 Adversarial Assessment

**Target:** `src/server.js` and `src/catalog-resolver.js`  
**Agent:** `m2_i3_challenger_1` (Empirical Challenger)  
**Working Directory:** `/home/admin/PanelPH/.agents/teamwork/m2_i3_challenger_1`  
**Timestamp:** 2026-10-14T14:06:40Z  
**Verdict:** **`REQUEST_CHANGES`**  

---

## 1. Observation

### 1.1 Baseline Core Test Suite
- **Command:** `npm test`
- **Working Directory:** `/home/admin/PanelPH`
- **Exit Code:** `0`
- **Verbatim Summary:**
  ```
  ℹ tests 127
  ℹ suites 0
  ℹ pass 127
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 4143.055391
  ```

### 1.2 Gate Adversarial Test Suite (`/tmp/m2_i2_adversarial_suite.mjs`)
- **Command:** `node /tmp/m2_i2_adversarial_suite.mjs`
- **Working Directory:** `/home/admin/PanelPH`
- **Exit Code:** `0`
- **Verbatim Summary:**
  ```
  ===============================================================
                       FINAL VERDICT TALLY                       
  ===============================================================
  Total Adversarial Scenarios: 28
  Passed:                      28
  Failed / Vulnerabilities:    0

  OVERALL VERDICT: APPROVE
  ```

### 1.3 Peer Challenger Test Suite (`/tmp/adversarial_challenger_2.mjs`)
- **Command:** `node /tmp/adversarial_challenger_2.mjs`
- **Working Directory:** `/home/admin/PanelPH`
- **Exit Code:** `0`
- **Verbatim Summary:**
  ```
  ================================================================================
  SUMMARY: 95 passed, 0 failed out of 95 assertions.
  ================================================================================

  ALL ADVERSARIAL CHALLENGES EMPIRICALLY PASSED!
  ```

---

### 1.4 Verification of Process Crash Vectors (Iteration 2 Defect 1)
Direct execution of 53 payload combinations against isolated child HTTP server processes across all endpoints:
- `POST /api/draft/needs`:
  - Payloads: `{"name": 12345}`, `{"name": true}`, `{"name": false}`, `{"name": null}`, `{"name": {}}`, `{"name": []}`, `{"name": "   "}`, `{"name": "ok", "quantity": "invalid"}`, `{"name": "ok", "quantity": -1}`, `{"name": "ok", "quantity": 0}`, `{"name": "ok", "unit": {}}`, `{"name": "ok", "note": []}`, `{}`
  - Non-object bodies: `"null"`, `"[]"`, `"123"`, `"\"string\""`
- `PATCH /api/draft/needs/:id`:
  - Payloads: `{"name": 12345}`, `{"name": true}`, `{"name": false}`, `{"name": null}`, `{"name": {}}`, `{"name": []}`, `{"quantity": -5}`, `{"quantity": "abc"}`
- `POST /api/draft/needs/:id/resolve`:
  - Payloads: `{"reference": 12345}`, `{"reference": true}`, `{"reference": null}`, `{"reference": "title"}`, `{"reference": []}`, `{"reference": {}}`, `{"reference": {"title": 12345}}`, `{"reference": {"title": true}}`, `{"reference": {"title": null}}`, `{"reference": {"title": {}}}`, `{"reference": {"title": []}}`, `{"reference": {"title": ""}}`, `{"reference": {"title": "   "}}`, `{"reference": {"title": "ok", "genericCode": {}}}`
- `POST /api/draft/revert`:
  - Payloads: `{"eventId": 12345}`, `{"eventId": true}`, `{"eventId": false}`, `{"eventId": null}`, `{"eventId": {}}`, `{"eventId": []}`, `{"eventId": ""}`, `{"eventId": "   "}`
- `POST /api/stock/check` & `POST /api/orders/export-batch`:
  - Malformed bodies, non-string identifiers, negative quantities.

**Empirical Result:**
- **Crash Rate:** `0 / 53` (Server child process remained alive, exit code `null`).
- **HTTP Responses:** Safely returned HTTP 400 `VALIDATION_ERROR` or `INVALID_JSON` (or 404 for missing IDs) without throwing unhandled exceptions.
- **Root Cause Fix Verified:** `src/server.js:534-815` contains global `try/catch` error boundary, and lines 619, 656, 695, and 728 enforce strict `typeof ... === "string"` guards.

---

### 1.5 Verification of Isolated Units and Status Queries
- **Command:**
  ```bash
  node -e '
  import { searchCatalog, resolveItem } from "./src/catalog-resolver.js";
  for (const q of ["mg", "ml", "واحد", "g", "iu", "mcg", "درصد", "ناموجود", "موجود", "out of stock", "ویال", "شربت", "کرم", "قرص", "کپسول"]) {
    const hits = searchCatalog(q);
    const res = resolveItem(q);
    if (hits.length > 0 || res.suggestedReference) {
      console.error(`FAIL: ${q}`);
      process.exit(1);
    }
  }
  console.log("ALL_ISOLATED_TERMS_REJECTED");
  '
  ```
- **Exit Code:** `0`
- **Stdout:** `ALL_ISOLATED_TERMS_REJECTED`
- **Result:** Isolated units, standalone status terms, and standalone dosage forms are cleanly rejected with 0 hits and null suggested reference.

---

### 1.6 Confirmed High-Severity False-Positive Auto-Resolution on Compact Dosages & Bare Numeric Values (New Empirical Finding)

Direct empirical execution of compact dosage notations and bare numeric values:
- **Command:**
  ```bash
  node -e '
  import { searchCatalog, resolveItem } from "./src/catalog-resolver.js";
  const queries = ["500mg", "325mg", "120ml", "1000iu", "500", "325", "120", "1000"];
  for (const q of queries) {
    const hits = searchCatalog(q);
    const res = resolveItem(q);
    console.log(`${q.padEnd(10)} | hits: ${hits.length} | top: ${(hits[0]?.title || "-").padEnd(30)} | score: ${hits[0]?.score || 0} | resolved: ${res.resolved} | suggested: ${res.suggestedReference?.title || "-"}`);
  }'
  ```
- **Exit Code:** `0`
- **Verbatim Stdout:**
  ```
  500mg      | hits: 1 | top: Amoxicillin 500mg Capsule      | score: 0.88 | resolved: true | suggested: Amoxicillin 500mg Capsule
  325mg      | hits: 1 | top: Acetaminophen 325mg Tablet     | score: 0.88 | resolved: true | suggested: Acetaminophen 325mg Tablet
  120ml      | hits: 1 | top: Cough Syrup 120ml              | score: 0.88 | resolved: true | suggested: Cough Syrup 120ml
  1000iu     | hits: 1 | top: Vitamin D3 1000IU Capsule      | score: 0.88 | resolved: true | suggested: Vitamin D3 1000IU Capsule
  500        | hits: 1 | top: Amoxicillin 500mg Capsule      | score: 0.54 | resolved: false | suggested: Amoxicillin 500mg Capsule
  325        | hits: 1 | top: Acetaminophen 325mg Tablet     | score: 0.53 | resolved: false | suggested: Acetaminophen 325mg Tablet
  120        | hits: 1 | top: Cough Syrup 120ml              | score: 0.55 | resolved: false | suggested: Cough Syrup 120ml
  1000       | hits: 1 | top: Vitamin D3 1000IU Capsule      | score: 0.55 | resolved: false | suggested: Vitamin D3 1000IU Capsule
  ```

#### Detailed Failure Mechanics in `src/catalog-resolver.js`:

1. **Failure 1: Compact Dosages (`500mg`, `325mg`, `120ml`, `1000iu`) Bypass the Dosage Filter**
   - In `src/catalog-resolver.js:337-345`, the filter for dosage queries is implemented as:
     ```javascript
     const hasDigitToken = queryTokens.some((t) => /^\d+$/.test(t));
     const hasDosageToken = queryTokens.some((t) => DOSAGE_MEASURE_TOKENS.has(t));
     const allTokensAreDosageOrDigit = queryTokens.length > 0 && queryTokens.every(
       (t) => /^\d+$/.test(t) || DOSAGE_MEASURE_TOKENS.has(t)
     );
     if (hasDigitToken && hasDosageToken && allTokensAreDosageOrDigit) {
       return 0;
     }
     ```
   - For spaced dosages (e.g., `"500 mg"` or `"۵۰۰ میلی گرم"`), `queryTokens` contains `["500", "mg"]`. This satisfies `hasDigitToken` and `hasDosageToken`, returning `0`.
   - However, for standard compact English dosages (e.g., `"500mg"`, `"325mg"`, `"120ml"`, `"1000iu"`), `normalizeText` does NOT separate digits from letters. Thus, `queryTokens` is `["500mg"]`.
   - `queryTokens[0]` is neither `/^\d+$/` nor in `DOSAGE_MEASURE_TOKENS`.
   - The candidate catalog item `Amoxicillin 500mg Capsule` (`g-1001`) contains the exact token `"500mg"` in its English title.
   - In Tier 4 multi-token scoring (`lines 357-404`), `matchedTokens = 1`, `queryTokens.length = 1`, `overlapRatio = 1.0`, and `strengthDigits` matches `"500"`, adding an attribute boost of `0.08`.
   - Total score: `1.0 * 0.80 + 0.08 = 0.88`.
   - In `resolveItem` (`line 556`), because `0.88 >= autoThreshold (0.85)` and there is no runner-up, the system returns:
     ```json
     {
       "resolved": true,
       "confidence": "high",
       "isAmbiguous": false,
       "suggestedReference": { "title": "Amoxicillin 500mg Capsule", "genericCode": "00001" }
     }
     ```
   - **Clinical Impact:** Typing a pure dosage (`"500mg"`) into the pharmacy interface or REST endpoint automatically resolves to Amoxicillin without requiring pharmacist confirmation or ambiguity resolution.

2. **Failure 2: Bare Numeric Values (`500`, `325`, `120`, `1000`) Match Medicine Titles via Tier 5 Substring**
   - For pure numeric inputs like `"500"`, `candidate.persianTitle` is `"آموکسی سیلین ۵۰۰ میلی گرم"`, which normalizes to `"اموکسی سیلین 500 میلی گرم"`.
   - In Tier 5 Substring Containment (`src/catalog-resolver.js:407-415`):
     ```javascript
     if (
       normQuery.length >= 3 &&
       !GENERIC_MEASURE_OR_STOP_TOKENS.has(normQuery) &&
       (normTitle.includes(normQuery) || normPersianTitle.includes(normQuery))
     ) {
       const lenRatio = Math.min(1, normQuery.length / Math.max(normTitle.length, 1));
       const subScore = 0.50 + 0.30 * lenRatio;
       return Math.round(subScore * 100) / 100;
     }
     ```
   - `"500"` has `length = 3 >= 3`, is not in `GENERIC_MEASURE_OR_STOP_TOKENS`, and satisfies `.includes("500")`.
   - Substring score computed is `0.54`.
   - In `resolveItem` (`line 577`), because `0.54 >= 0.40`, the system populates `suggestedReference: "Amoxicillin 500mg Capsule"`.
   - Generic code `"00001"` is the real code; `"500"` is merely the strength number. A pharmacist entering `"500"` is offered Amoxicillin as a suggested reference.

---

### 1.7 Dedicated Challenger Test Suite (`/tmp/m2_i3_challenger_1_suite.mjs`)
- **Command:** `node /tmp/m2_i3_challenger_1_suite.mjs`
- **Exit Code:** `1`
- **Verbatim Summary:**
  ```
  TOTAL: 11 | PASSED: 5 | FAILED: 6
  FAILURES:
   - Adversarial Dosage: Compact '500mg' must not auto-resolve to Amoxicillin => Query '500mg' auto-resolved (resolved: true) to Amoxicillin 500mg Capsule with score 0.88
   - Adversarial Dosage: Compact '325mg' must not auto-resolve to Acetaminophen => Query '325mg' auto-resolved (resolved: true) to Acetaminophen 325mg Tablet with score 0.88
   - Adversarial Dosage: Compact '120ml' must not auto-resolve to Cough Syrup => Query '120ml' auto-resolved (resolved: true) to Cough Syrup 120ml with score 0.88
   - Adversarial Dosage: Compact '1000iu' must not auto-resolve to Vitamin D => Query '1000iu' auto-resolved (resolved: true) to Vitamin D3 1000IU Capsule with score 0.88
   - Adversarial Query: Bare numeric '500' must not suggest Amoxicillin => Bare number '500' falsely suggested Amoxicillin 500mg Capsule
   - Adversarial Query: Bare numeric '325' must not suggest Acetaminophen => Bare number '325' falsely suggested Acetaminophen 325mg Tablet
  ```

---

## 2. Logic Chain

1. **Premise 1 (`DISPATCH.md` Item 3):** The challenger must "Verify isolated units, dosages, and status terms are rejected."
2. **Premise 2 (Domain Meaning of Dosage):** In medical and pharmacy practice, `"500mg"`, `"325mg"`, `"120ml"`, and `"1000iu"` are isolated dosages. They represent quantities of active ingredient or volume, not distinct pharmaceutical products.
3. **Observation Reference 1.6 & 1.7:** When `"500mg"` is passed to `resolveItem("500mg")`, it does not return `resolved: false` with 0 hits; instead, it returns `resolved: true`, `confidence: "high"`, `isAmbiguous: false`, and `suggestedReference: { title: "Amoxicillin 500mg Capsule", genericCode: "00001" }` with score `0.88`.
4. **Premise 3 (Clinical Safety & Batch Export Contract `PROJECT.md` F11):** An order item with `status: "ready_for_review"` and a non-null `resolvedReference` bypasses ambiguity barriers and is sent directly to stock check and Qanoon batch order creation. Auto-resolving `"500mg"` to Amoxicillin without requiring a drug name or pharmacist confirmation creates a risk of incorrect drug dispensing.
5. **Observation Reference 1.6.2:** Bare numeric queries (`"500"`, `"325"`, `"120"`, `"1000"`) that are neither generic codes nor brand codes match titles in Tier 5 substring containment, scoring `0.53 - 0.55` and populating `suggestedReference`.
6. **Deductive Conclusion:** The implementation has resolved the crash bugs and spaced-token filters, but it has not resolved isolated dosage rejection for compact notations and bare strength numbers. Under empirical verification criteria, Milestone 2 Iteration 3 must be marked `REQUEST_CHANGES` until this gap is patched.

---

## 3. Caveats

- **Scope Adherence:** Review-only constraints were strictly preserved. Neither `src/catalog-resolver.js` nor `src/server.js` was modified.
- **Verification Harnesses:** The empirical suite was placed at `/tmp/m2_i3_challenger_1_suite.mjs` and does not pollute the repository.
- **Acknowledgment of Substantial Progress:** The crash vectors (Iteration 2 Defect 1) and diacritics/harakat/Alef/Yeh normalizations are genuinely and thoroughly fixed. The remaining defect is isolated to `src/catalog-resolver.js` dosage tokenization and Tier 5 numeric substring filtering.

---

## 4. Conclusion

**Verdict: `REQUEST_CHANGES`**

While Milestone 2 Iteration 3 has fully resolved the HTTP server crash vulnerabilities and successfully passes the 28-scenario Iteration 2 gate suite and 127 core tests, empirical stress testing reveals that compact dosage notations (`500mg`, `325mg`, `120ml`, `1000iu`) bypass the dosage guard, score 0.88, and automatically resolve as high-confidence matches.

### Actionable Remediation for `m2_worker` in `src/catalog-resolver.js`:

#### 1. Expand Dosage Guard to Match Compact and Unspaced Dosages (`lines 337-345`):
Replace:
```javascript
  // Pure dosage queries containing only numbers and dosage units (e.g. "۵۰۰ میلی گرم", "500 mg")
  const hasDigitToken = queryTokens.some((t) => /^\d+$/.test(t));
  const hasDosageToken = queryTokens.some((t) => DOSAGE_MEASURE_TOKENS.has(t));
  const allTokensAreDosageOrDigit = queryTokens.length > 0 && queryTokens.every(
    (t) => /^\d+$/.test(t) || DOSAGE_MEASURE_TOKENS.has(t)
  );
  if (hasDigitToken && hasDosageToken && allTokensAreDosageOrDigit) {
    return 0;
  }
```
With:
```javascript
  // Pure dosage queries: spaced or compact (e.g. "۵۰۰ میلی گرم", "500 mg", "500mg", "325mg", "120ml", "1000iu", "۵۰۰میلی‌گرم")
  const COMPACT_DOSAGE_REGEX = /^\d+(?:\.\d+)?(?:mg|ml|g|iu|mcg|گرم|میلی|لیتر|واحد)$/i;
  const isDosageToken = (t) => /^\d+$/.test(t) || DOSAGE_MEASURE_TOKENS.has(t) || COMPACT_DOSAGE_REGEX.test(t);
  const hasDosageComponent = queryTokens.some((t) => DOSAGE_MEASURE_TOKENS.has(t) || COMPACT_DOSAGE_REGEX.test(t));
  
  if (hasDosageComponent && queryTokens.every(isDosageToken)) {
    return 0;
  }
```

#### 2. Prevent Bare Numbers from Matching Titles via Tier 5 Substring (`lines 407-415`):
In Tier 5 Substring Containment, disallow pure numeric queries from matching drug titles:
```javascript
  // 5. Substring Containment (Tier 5)
  if (
    normQuery.length >= 3 &&
    !/^\d+$/.test(normQuery) && // Prevent bare numeric strength values from substring matching titles
    !GENERIC_MEASURE_OR_STOP_TOKENS.has(normQuery) &&
    (normTitle.includes(normQuery) || normPersianTitle.includes(normQuery))
  ) {
    const lenRatio = Math.min(1, normQuery.length / Math.max(normTitle.length, 1));
    const subScore = 0.50 + 0.30 * lenRatio;
    return Math.round(subScore * 100) / 100;
  }
```
*(Note: Legitimate code lookups like `"00001"` or `"08234"` will continue to resolve via Tier 1 with score 1.0; only non-code bare numbers like `"500"` or `"325"` will be prevented from falsely substring-matching titles).*

---

## 5. Verification Method

To independently verify the failure and validate the subsequent fix:

1. **Execute Challenger 1 Reproducible Suite:**
   ```bash
   node /tmp/m2_i3_challenger_1_suite.mjs
   ```
   - **Current Output:** Fails 6 assertions with exit code 1 (`Query '500mg' auto-resolved (resolved: true) to Amoxicillin 500mg Capsule with score 0.88`).
   - **Remediation Invalidation Criterion:** All 11 assertions must pass with exit code 0.

2. **Verify Process Crash Vectors Remain Protected:**
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
   }).then(r => { console.log("Status:", r.status); s.close(); });
   '
   ```
   - Must output `Status: 400` without process crash.

3. **Verify Existing Suites Remain 100% Green:**
   ```bash
   npm test
   node /tmp/m2_i2_adversarial_suite.mjs
   node /tmp/adversarial_challenger_2.mjs
   ```
   - Must all exit with code 0.

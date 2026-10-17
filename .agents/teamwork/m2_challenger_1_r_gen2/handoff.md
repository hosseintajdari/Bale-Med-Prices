# Milestone 2 Adversarial Challenge Report: Catalog Resolver & Leading-Zero Preservation

**Agent**: `m2_challenger_1_r` (teamwork_preview_challenger, Generation 2)  
**Assigned Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m2_challenger_1_r_gen2`  
**Milestone**: M2 (Operational Backend & Catalog Resolution)  
**Date**: 2026-10-14  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

### 1.1 Baseline State & File Coverage
- Target File: `/home/admin/PanelPH/src/catalog-resolver.js`
- Total Lines: 507 lines confirmed via `wc -l /home/admin/PanelPH/src/catalog-resolver.js` (lines 1 to 507 inspected, 100% file coverage verified).
- Existing Test Suite: `npm test` runs 113 tests with 100% pass (0 failures, 0 skipped).
  - Terminal Output: `ℹ tests 113, ℹ pass 113, ℹ fail 0, ℹ skipped 0, ℹ duration_ms 4811.466078`.

### 1.2 Five Adversarial Test Suites Executed
An empirical adversarial test harness was authored and executed in `/tmp/m2-adversarial-catalog-resolver.js` (command: `node /tmp/m2-adversarial-catalog-resolver.js`):

1. **Suite 1: Leading Zero Parameter Sweep (10,000 variations)**
   - Sweep of 10,000 5-digit padded codes (`"00000"` through `"09999"`): 10,000/10,000 (100%) preserved as string, zero count intact, no numeric coercion.
   - Variable-length zero sweep (1 to 100 leading zeros): 100/100 preserved.
   - Synthetic zero-padded catalog (2,000 items, `genericCode: "000000"` to `"001999"`): 100 random code lookups all returned `typeof genericCode === "string"`, exact code preservation, score 1.0.
   - Status: **PASS (100% Robust)**.

2. **Suite 2: Persian and Arabic Numeral Sweeps (5,000 variations)**
   - 0-9 full character mapping: Persian (`۰۱۲۳۴۵۶۷۸۹`) and Arabic-Indic (`٠١٢٣٤٥٦٧٨٩`) 100% transliterated to ASCII (`0-9`).
   - 5-digit numeral sweep (5,000 codes): 100% transliterated without loss of leading zeroes (`"۰۰۰۰۱"` -> `"00001"`, `"٠٠٠٢٥"` -> `"00025"`).
   - Catalog search with Persian numerals (`"۰۰۰۰۱"`, `"۰۸۲۳۴"`, `"٠٠٠٢٥"`): all resolved to catalog codes with score 1.0.
   - Status: **PASS (100% Robust)**.

3. **Suite 3: Concurrency Bursts (250 synchronous & 200 asynchronous tasks)**
   - 250 sequential searches executed in 125.4ms (0.501ms per search). Determinism: 100% byte-for-byte identical across runs.
   - 200 concurrent tasks resolved via event loop (`Promise.all`) in 172.7ms. Zero race conditions, memory corruption, or thread-safety faults.
   - Status: **PASS (100% Robust)**.

4. **Suite 4: Ambiguity Score Boundary Conditions**
   - Boundary at `ambiguityMargin` (0.15):
     - `diff = 0.14`: `isAmbiguous: true`, `resolved: false`, `confidence: "medium"`.
     - `diff = 0.16`: `isAmbiguous: false`, `resolved: true`, `confidence: "high"`.
     - `diff = 0.15`: `isAmbiguous: false`, `resolved: true`.
   - Exact code match protection (`topMatch.score >= 0.999`):
     - `topMatch = 1.0`, `runnerUp = 0.85` (diff 0.15): `isAmbiguous: false`, resolves without ambiguity.
   - Dual exact code collision (two items sharing genericCode `"00001"`):
     - `topMatch = 1.0`, `runnerUp = 1.0`: `isAmbiguous: true`, correctly flags ambiguity for pharmacist brand selection.
   - Auto-threshold (`autoThreshold = 0.85`):
     - `score = 0.85`: `resolved: true`.
     - `score = 0.84`: `resolved: false`, `isAmbiguous: true`.
   - Status: **PASS (100% Robust)**.

5. **Suite 5: Fuzzing & Adversarial Edge Cases (CRITICAL DEFECTS UNCOVERED)**
   - Non-string & aberrant types (`null`, `undefined`, `123`, `true`, `{}`, `[]`, `NaN`): cleanly handled, returned empty array or none-confidence object.
   - Extreme string lengths (1KB, 10KB, 100KB): completed in < 310ms without ReDoS or buffer overflow.
   - Injection payloads (`.*`, `([a-z]+)+`, `' OR '1'='1`, `__proto__`): no crashes.
   - **FAILURE 1 (CRITICAL)**: Queries consisting of stripped characters (`","`, `"-"`, `"--"`, `"()"`, `"\u200c"`, `";"`, or diacritics) return ALL 8 items in the catalog with score `0.90`! On a single-item catalog, `resolveItem(",")` returns `resolved: true, confidence: "high", isAmbiguous: false`, auto-resolving a single comma to a medicine with score `0.99`!
   - **FAILURE 2 (HIGH)**: Catalog items with empty or whitespace aliases (`aliases: [""]`) cause ANY arbitrary query (e.g. `"xyzabc123"`) to match that item with score `0.65`.
   - **FAILURE 3 (MEDIUM)**: `normalizeText` does not strip Arabic/Persian Tatweel / Kashida (`ـ`, `\u0640`), causing search for stretched word `"آمـوکسی"` to return 0 results. It also does not normalize plain Alef (`ا`) to Madda (`آ`), causing search for `"اموکسی"` to return 0 results.

---

### 1.3 Verbatim Empirical Reproduction Output
Command executed: `node /tmp/m2-adversarial-repro.js` (exit code: 0)
```
=== ADVERSARIAL REPRODUCTION REPORT ===

1. Testing query with single comma ',':
- searchCatalog(",") returned 8 items.
- Top match: "Acetaminophen 325mg Tablet", score: 0.9
- resolveItem(","): resolved=false, isAmbiguous=true, confidence=medium
- resolveItem(",") bestMatch: "Acetaminophen 325mg Tablet" (score: 0.9)
- resolveItem(",") on single-item catalog: resolved=true, confidence=high, bestMatch="Amoxicillin 500mg Capsule"

2. Testing query with ZWNJ (\u200c) alone:
- searchCatalog("\u200c") returned 8 items with top score 0.9

3. Testing custom catalog item with empty alias:
- searchCatalog("some_totally_unrelated_query_xyz") matched: 1 item(s), score=0.65

4. Testing Tatweel / Kashida elongation (آمـوکسی):
- searchCatalog("آمـوکسی") returned: 0 item(s)

5. Testing plain Alef without Madda (اموکسی):
- searchCatalog("اموکسی") returned: 0 item(s)
```

---

### 1.4 Claim Ledger with Inline Verbatim Evidence

| Claim | Status | File:Line / Command & Verbatim Output |
|---|---|---|
| Leading zeroes are strictly preserved across 10,000 padded codes | VERIFIED | `node /tmp/m2-adversarial-catalog-resolver.js`<br>Exit code: 0<br>`✔ Large-scale 5-digit zero-padded sweep (10,000 codes) (32.87ms)` |
| Persian/Arabic numerals are 100% transliterated to ASCII digits | VERIFIED | `node /tmp/m2-adversarial-catalog-resolver.js`<br>Exit code: 0<br>`✔ 5-digit Persian and Arabic numeral sweep (5,000 variations) (15.13ms)` |
| Search queries are deterministic across 250 concurrent executions | VERIFIED | `node /tmp/m2-adversarial-catalog-resolver.js`<br>Exit code: 0<br>`✔ 250 synchronous/concurrent iterations completed in 125.4ms (0.501ms per search). Determinism: 100%` |
| Ambiguity boundary triggers at < 0.15 and passes at >= 0.15 | VERIFIED | `node /tmp/m2-adversarial-catalog-resolver.js`<br>Exit code: 0<br>`✔ Strict score boundary testing around ambiguityMargin (0.15) (0.31ms)` |
| Punctuation queries (`","`, `"-"`, `"\u200c"`) return all catalog items with score 0.90 | DEFECT VERIFIED | `node /tmp/m2-adversarial-repro.js`<br>Exit code: 0<br>`- searchCatalog(",") returned 8 items.`<br>`- Top match: "Acetaminophen 325mg Tablet", score: 0.9` |
| Single comma auto-resolves to medicine with 0.99 score on single-item catalog | DEFECT VERIFIED | `node /tmp/m2-adversarial-repro.js`<br>Exit code: 0<br>`- resolveItem(",") on single-item catalog: resolved=true, confidence=high, bestMatch="Amoxicillin 500mg Capsule"` |
| Empty alias in catalog item matches any query with 0.65 score | DEFECT VERIFIED | `node /tmp/m2-adversarial-repro.js`<br>Exit code: 0<br>`- searchCatalog("some_totally_unrelated_query_xyz") matched: 1 item(s), score=0.65` |
| Tatweel (`\u0640`) in Persian query causes 0 matches | DEFECT VERIFIED | `node /tmp/m2-adversarial-repro.js`<br>Exit code: 0<br>`- searchCatalog("آمـوکسی") returned: 0 item(s)` |

---

## 2. Logic Chain

1. **Root Cause of Defect 1 (Punctuation/Stripped Queries False Positive 0.90 - 0.99 Match)**:
   - In `src/catalog-resolver.js:245-285`:
     ```javascript
     export function scoreCandidate(query, candidate) {
       const cleanCodeQuery = normalizeDigits(query.trim());
       const normQuery = normalizeText(query);
       if (!normQuery && !cleanCodeQuery) return 0;
     ```
   - When a user inputs `","`, `"-"`, `"\u200c"` (ZWNJ alone, typed via Shift+Space on Persian keyboards), or punctuation:
     - `normalizeDigits(query.trim())` leaves `","` untouched, so `cleanCodeQuery = ","` (truthy).
     - `normalizeText(query)` strips the comma and collapses whitespace, resulting in `normQuery = ""` (falsy).
     - Because `cleanCodeQuery` is truthy, the guard `if (!normQuery && !cleanCodeQuery) return 0;` does NOT trigger.
     - Code matching (genericCode, barcode, goodId, brandCode) fails because `","` does not match any digits.
     - Execution then proceeds to text matching (`src/catalog-resolver.js:280-282`):
       ```javascript
       // 3. Title Starts With Query (Tier 3: 0.90)
       if (normTitle.startsWith(normQuery) || normPersianTitle.startsWith(normQuery)) return 0.90;
       ```
     - In JavaScript, for ANY string `s`, `s.startsWith("")` evaluates to `true`.
     - Because `normQuery` is `""`, `normTitle.startsWith("")` evaluates to `true` for EVERY item in the catalog.
     - Therefore, every candidate receives a score of `0.90` (and `0.99` if `candidate.persianTitle` was empty/undefined, because `"" === ""` evaluates to `true` on line 277).
     - In `resolveItem`, if there is a single-item catalog (or one item with score 0.99 and others 0.90), `score >= 0.85` triggers `resolved: true`, `confidence: "high"`, auto-resolving a comma to a real pharmaceutical product! This is a severe clinical safety hazard.

2. **Root Cause of Defect 2 (Empty Alias Matches Arbitrary Queries with 0.65 Score)**:
   - In `src/catalog-resolver.js:332-336`:
     ```javascript
     for (const alias of normAliases) {
       if (alias.includes(normQuery) || normQuery.includes(alias)) {
         return 0.65;
       }
     }
     ```
   - If an item in the catalog has an empty string alias (e.g. `aliases: [""]`), `alias` is `""`.
   - In JavaScript, for any non-empty string `q`, `q.includes("")` evaluates to `true`.
   - As a result, searching for completely random strings (e.g. `"some_totally_unrelated_query_xyz"`) triggers `normQuery.includes("") === true`, returning the item with a 0.65 score.

3. **Root Cause of Defect 3 (Missing Persian Tatweel & Alef Normalization)**:
   - In `src/catalog-resolver.js:42`:
     ```javascript
     s = s.replace(/[\u064B-\u065F\u0670]/g, "");
     ```
   - Tatweel / Kashida (`ـ`, `\u0640`) immediately precedes `\u064B` in Unicode. Because the range starts at `\u064B`, Tatweel is NOT stripped.
   - In Persian typing, pharmacists frequently elongate names (e.g. `آمـوکسی`). Because Tatweel remains in the string, exact and token matching fails completely.
   - Similarly, fast-typed Persian omits Madda (`آ` -> `ا`). Without normalising `آ` to `ا` (or maintaining bidirectional equivalence), `"اموکسی"` fails to match `"آموکسی سیلین"`.

---

## 3. Caveats

1. **Development Mock Fixtures**: The in-memory catalog currently contains 8 reference items. In full production with 50,000+ TTAC items, an indexed full-text search backend (e.g., SQLite FTS5) will be utilized.
2. **Persistence Boundary**: Concurrency was tested within a single Node.js process using `Promise.all` and asynchronous event loop ticks. File-level atomic locking (`.tmp` + rename) is governed by Milestone 3 (`src/draft-store.js`).

---

## 4. Conclusion & Required Changes

### Verdict: **REQUEST_CHANGES**

The core invariants of Milestone 2—specifically string preservation of leading zeroes on generic and brand codes (`"00001"`), Persian/Arabic numeral transliteration, and ambiguity boundary math—are robustly implemented and passed all 15,000+ adversarial sweep tests.

However, the catalog resolution engine has critical algorithmic vulnerabilities in its query and alias processing that must be remediated before production readiness:

### Required Remediation for `m2_worker`:

1. **Fix Empty `normQuery` Fallthrough in `scoreCandidate`**:
   - In `src/catalog-resolver.js`:
     If `normQuery` is empty (`normQuery.length === 0`), do NOT evaluate text matching rules (`normTitle.startsWith`, `normPersianTitle.startsWith`, `normTitle.includes`, alias matching).
     If `normQuery.length === 0` and `cleanCodeQuery` does not match any valid code (genericCode, barcode, goodId, brandCode), return `0` immediately:
     ```javascript
     // If normalized text is empty and cleanCodeQuery didn't match any code, return 0
     if (!normQuery) {
       return 0;
     }
     ```
   - Alternatively, at the top of `searchCatalog`:
     ```javascript
     const cleanCodeQuery = normalizeDigits(query.trim());
     const normQuery = normalizeText(query);
     if (!normQuery && !/^\d+$/.test(cleanCodeQuery)) {
       return [];
     }
     ```

2. **Filter Out Empty Strings from `normAliases`**:
   - In `scoreCandidate`:
     ```javascript
     const normAliases = (candidate.aliases || [])
       .map((a) => normalizeText(a))
       .filter((a) => a.length > 0);
     ```
     This prevents `normQuery.includes("")` from matching arbitrary queries.

3. **Add Tatweel (`\u0640`) and Alef Normalization to `normalizeText`**:
   - In `normalizeText`:
     ```javascript
     // Remove Arabic diacritics and Tatweel (\u0640)
     s = s.replace(/[\u0640\u064B-\u065F\u0670]/g, "");
     ```
   - Normalize Alef variants (`آ`, `أ`, `إ`, `ٱ` -> `ا`) to support natural Persian typing.

---

## 5. Verification Method

To independently reproduce the findings and verify future fixes:

1. **Run Master Adversarial Test Suite**:
   ```bash
   node /tmp/m2-adversarial-catalog-resolver.js
   ```
   - Prior to fix: Shows 1 failure (`Variation 'آمـــوکسی ســـیلین' failed`) and 18 high-confidence false matches for stripped queries.
   - Post-fix: Must achieve 17/17 PASS.

2. **Run Targeted Reproduction Script**:
   ```bash
   node /tmp/m2-adversarial-repro.js
   ```
   - Prior to fix:
     - `searchCatalog(",")` returns 8 items with score 0.9.
     - `resolveItem(",")` on single-item catalog returns `resolved: true, confidence: 'high'`.
     - `searchCatalog("some_totally_unrelated_query_xyz")` returns 1 item with score 0.65.
   - Post-fix:
     - `searchCatalog(",")` must return 0 items.
     - `resolveItem(",")` must return `resolved: false, confidence: 'none'`.
     - `searchCatalog("some_totally_unrelated_query_xyz")` must return 0 items.
     - `searchCatalog("آمـوکسی")` must return Amoxicillin (00001).

3. **Run Project Baseline Suite**:
   ```bash
   cd /home/admin/PanelPH && npm test
   ```
   - Must maintain 113 passing tests.

4. **Invalidation Conditions**:
   - If `searchCatalog(",")` returns any candidate with `score > 0`, Bug 1 is not resolved.
   - If `searchCatalog("xyz", { catalog: [{ aliases: [""] }] })` returns any match, Bug 2 is not resolved.
   - If `searchCatalog("00001")` returns a numeric `genericCode: 1`, leading-zero invariant has regressed.

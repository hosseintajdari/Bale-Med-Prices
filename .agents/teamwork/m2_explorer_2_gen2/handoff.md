# Handoff Report: Medicine Catalog Resolution Engine (`src/catalog-resolver.js`)

**Role:** `m2_explorer_2_gen2`  
**Milestone:** Milestone 2 (Operational Backend & MCP Tools)  
**Date:** 2026-10-14  
**Handoff Type:** Hard  

---

## 1. Observation

1. **`src/catalog-resolver.js` is currently absent:**
   - Command: `ls -la /home/admin/PanelPH/src`
   - Output: `adapters/`, `draft-store.js`, `server.js`.
   - Inspection of `test/e2e/test-helper.js` lines 47-49:
     ```javascript
     export async function isCatalogResolverAvailable() {
       return fileExists(join(projectRoot, "src", "catalog-resolver.js"));
     }
     ```
   - Verified that the resolver module must be created directly at `src/catalog-resolver.js`.

2. **Interface contract specified in `PROJECT.md` lines 58-62:**
   - Verbatim quote from `PROJECT.md`:
     ```markdown
     ### Catalog Resolver (`src/catalog-resolver.js`)
     - `searchCatalog(query: string)`:
       - Returns: `Array<{ genericCode: string, brandCode: string, title: string, dosageForm: string, strength: string, score: number }>`
     - Strings with leading zeros (`"00001"`, `"08234"`) are strictly preserved as strings.
     ```

3. **Leading zero preservation in existing tests:**
   - `test/e2e/tier1-feature-coverage.test.js` lines 66-93 (F8):
     ```javascript
     assert.strictEqual(
       draft.items[0].resolvedReference.genericCode,
       "00001",
       "Generic code must remain a string and preserve leading zeroes"
     );
     assert.strictEqual(
       draft.items[0].resolvedReference.brandCode,
       "00001",
       "Brand code must remain a string and preserve leading zeroes"
     );
     ```
   - `test/e2e/tier2-boundary-corner.test.js` lines 60-100 (T2_05):
     ```javascript
     const codes = ["00001", "08234", "00000", "00123"];
     ...
     assert.strictEqual(typeof resolvedItem.resolvedReference.genericCode, "string");
     assert.strictEqual(resolvedItem.resolvedReference.genericCode, code);
     assert.strictEqual(resolvedItem.resolvedReference.brandCode, code);
     ```

4. **Reference data and mock fixtures:**
   - `docs/REFERENCE-DATA.md` lines 9-10 & 21:
     - "کدهای ژنریک و برند باید متنی بمانند تا صفر ابتدایی از بین نرود."
     - "در مرحله داده نمونه، فقط یک زیرمجموعه ساختگی و کمینه با این فیلدها استفاده می شود: `genericCode`، `brandCode`، `title`، `dosageForm`، `strength` و `referenceDate`."
   - `fixtures/catalog.sample.json` lines 1-18:
     - 2 sample records with `"genericCode": "00001"` and `"genericCode": "14083"`.
   - `fixtures/qanoon-mock-data.json` lines 5-206:
     - 8 goods (`g-1001` through `g-1007`, `g1`) with codes `"00001"`, `"08234"`, `"00025"`, `"04210"`, `"00115"`, `"00999"`, `"14083"`.
   - `test/e2e/test-helper.js` lines 10-32 (`SAMPLE_DRUGS`):
     - Drugs with generic/brand codes `"00001"`, `"14083"`, `"08234"`.

5. **Current test baseline:**
   - Ran `npm test` (`node --test`).
   - Verbatim result: 85 tests total, 83 passed, 0 failed, 2 skipped (F9 and F11 skipped due to pending Milestone 2 REST endpoints and batch export).
   - Exit code: 0.

---

## 2. Logic Chain

1. **Step 1 (Catalog Resolver Role)**: From Observation 1 and 2, `src/catalog-resolver.js` is the missing component required by Milestone 2 (F8) to resolve unstructured text into structured medicine references (`genericCode`, `brandCode`, `title`, `dosageForm`, `strength`, `score`).
2. **Step 2 (Leading-Zero Invariant)**: From Observation 2, 3, and 4, `genericCode` and `brandCode` represent standardized 5-digit string codes (`"00001"`, `"08234"`). In JavaScript, integer conversion (`parseInt`, `Number`, `+code`, or `replace(/^0+/)`) truncates `"00001"` to `1`, breaking insurance claims, schema validation, and test assertions in F8 and T2_05. Therefore, code properties must be strictly handled as strings via `normalizeCodeString` and `String(code).trim()`.
3. **Step 3 (Digit Transliteration)**: Pharmacists often enter numbers via Persian keyboards (`۰ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹`). Parsing Persian digits via `parseInt(transliterated)` would corrupt `"۰۰۰۰۱"` to integer `1`. Instead, character-by-character string replacement (`PERSIAN_ARABIC_DIGIT_MAP`) preserves exact digit count and string format (`"۰۰۰۰۱"` -> `"00001"`).
4. **Step 4 (Scoring and Candidate Ranking)**: From Observation 2 and DISPATCH, `searchCatalog(query)` must rank candidates with a score in `[0.0, 1.0]`. Exact code match ranks highest (1.00), exact title/alias match ranks second (0.95-0.99), multi-token matches with matching dosage form and strength receive boosts (up to 0.92), and substring containment provides fallback scores.
5. **Step 5 (Disambiguation and resolveItem)**: In pharmacy operations, free-text need capture must not be blocked (R2.1). When resolving a need, `resolveItem(query, candidates)` evaluates the candidate distribution: if a clear single candidate exceeds `0.85`, it is marked `resolved: true`, `confidence: "high"`, `isAmbiguous: false`; if multiple candidates are closely scored (e.g., 500mg vs 250mg), it sets `isAmbiguous: true`, `confidence: "medium"`, allowing the pharmacist to select the intended item in the UI Ambiguity Drawer.
6. **Step 6 (Data Isolation and Test Reliability)**: From Observation 4 and 5, relying on network calls for catalog lookup is prohibited. By embedding `BUILTIN_REFERENCE_ITEMS` (combining `SAMPLE_DRUGS`, `catalog.sample.json`, and `qanoon-mock-data.json`) while supporting custom catalog injection via `options.catalog`, the engine runs 100% offline and passes all test tiers.

---

## 3. Caveats

1. **Scope Boundaries**: This investigation focused exclusively on the Medicine Catalog Resolution engine (`src/catalog-resolver.js`). REST routing in `src/server.js` is covered by `m2_explorer_1_gen2`, and Order Batch Export / Discrepancy Highlighting is covered by `m2_explorer_3_gen2`.
2. **Live Catalog Sync**: Real-world pharmacy catalogs contain tens of thousands of IRC/TTAC items. In this phase (integrity mode: development), in-memory indexing of built-in fixtures is sufficient and fast (<1ms per search). For full-scale production, an inverted index or SQLite full-text search (FTS5) would be recommended.
3. **Non-Blocking Rule**: Catalog resolution must remain advisory. `src/draft-store.js` allows free-text need addition without forcing catalog resolution.

---

## 4. Conclusion

The design for `src/catalog-resolver.js` is fully specified and ready for implementation by M2 Worker:
1. Export `searchCatalog(query, options)` returning an array of candidate objects with `genericCode`, `brandCode`, `title`, `dosageForm`, `strength`, `score`.
2. Export `resolveItem(query, candidates, options)` returning resolution metadata (`resolved`, `confidence`, `isAmbiguous`, `bestMatch`, `candidates`, `suggestedReference`).
3. Export `createCatalogResolver(options)` and `CatalogResolver` class for customizable catalog instances.
4. Enforce strict string preservation of codes with leading zeroes (`"00001"`, `"08234"`, `"00025"`, `"00115"`, `"00999"`) without numeric coercion.
5. Provide high-fidelity Persian/English normalization (transliterating `۰-۹`, normalizing Arabic characters, and stripping ZWNJ for tokenization).
6. Provide a dedicated unit test suite at `test/catalog-resolver.test.js` to guarantee 100% test coverage for leading-zero preservation and Persian matching.

---

## 5. Verification Method

1. **Inspect Design Documentation**:
   - Verify comprehensive analysis: `view_file /home/admin/PanelPH/.agents/teamwork/m2_explorer_2_gen2/analysis.md`
2. **Implementation Verification (for M2 Worker)**:
   - Create `src/catalog-resolver.js`.
   - Run `node -e 'import("./src/catalog-resolver.js").then(m => m.searchCatalog("00001")).then(console.log)'` and verify:
     - Output is an array of candidates.
     - `genericCode` is strictly `"00001"` (string type, `typeof === "string"`).
     - `score` is `1`.
   - Run `node -e 'import("./src/catalog-resolver.js").then(m => m.searchCatalog("۰۰۰۰۱")).then(console.log)'` and verify Persian numeral queries match `"00001"`.
   - Run `node -e 'import("./src/catalog-resolver.js").then(m => m.resolveItem("آموکسی ۵۰۰")).then(console.log)'` and verify candidate ranking.
3. **Test Suite Verification**:
   - Run `npm test` (`node --test`).
   - Verify all tests pass with exit code 0.

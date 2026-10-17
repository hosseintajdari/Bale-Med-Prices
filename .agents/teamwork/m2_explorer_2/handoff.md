# Handoff Report — Milestone 2 Catalog Resolver & Search Engine

**Agent:** `m2_explorer_2`  
**Working Directory:** `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2`  
**Date:** 2026-10-14  
**Handoff Type:** Hard (Milestone 2 Exploration Complete)

---

## 1. Observation

1. **Absence of `src/catalog-resolver.js`:**
   - Listing `src/` (`list_dir` at `/home/admin/PanelPH/src`) showed:
     `{"name":"adapters","isDir":true}`, `{"name":"draft-store.js","sizeBytes":"5834"}`, `{"name":"server.js","sizeBytes":"7401"}`.
     `src/catalog-resolver.js` does not exist yet.
   - `test/e2e/test-helper.js` (lines 47-49) provides:
     ```javascript
     export async function isCatalogResolverAvailable() {
       return fileExists(join(projectRoot, "src", "catalog-resolver.js"));
     }
     ```
     This check currently returns `false`.

2. **Catalog Contract in `PROJECT.md`:**
   - Lines 58-62 of `/home/admin/PanelPH/PROJECT.md`:
     ```markdown
     ### Catalog Resolver (`src/catalog-resolver.js`)
     - `searchCatalog(query: string)`:
       - Returns: `Array<{ genericCode: string, brandCode: string, title: string, dosageForm: string, strength: string, score: number }>`
     - Strings with leading zeros (`"00001"`, `"08234"`) are strictly preserved as strings.
     ```

3. **Leading Zero Preservation in Current Tests:**
   - In `/home/admin/PanelPH/test/e2e/tier2-boundary-corner.test.js` (lines 60-100, `T2_05`):
     ```javascript
     assert.strictEqual(typeof resolvedItem.resolvedReference.genericCode, "string");
     assert.strictEqual(resolvedItem.resolvedReference.genericCode, code);
     assert.strictEqual(resolvedItem.resolvedReference.brandCode, code);
     ```
   - Running `npm test` passed 83 tests and skipped 2:
     ```
     ✔ T2_05: String preservation of leading zeros across all codes (200.99795ms)
     ✔ QanoonAdapter — Leading-Zero String Preservation (3.335511ms)
     ℹ tests 85, pass 83, fail 0, skipped 2
     ```

4. **Reference Data & Decoupled Entry Invariants:**
   - `/home/admin/PanelPH/docs/REFERENCE-DATA.md` (lines 9-13):
     - *"کدهای ژنریک و برند باید متنی بمانند تا صفر ابتدایی از بین نرود."*
     - *"پیشنهاد همیشه نیازمند تأیید کاربر است و ثبت آزاد نیاز را مسدود نمی کند."*
   - `/home/admin/PanelPH/PRD.md` (lines 27-29):
     - *"ثبت اولیه هرگز کاربر را به انتخاب اجباری از کاتالوگ وابسته نمی کند."*
     - *"هر پیشنهاد تطبیق فقط پیشنهاد است و بدون تأیید کاربر قطعی نمی شود."*

5. **Naive Persian Matching Limitation:**
   - Runtime test in node:
     `node -e 'console.log("آموکسی سیلین ۵۰۰ میلی گرم".includes("آموکسی ۵۰۰"))'`
     Output: `false`.
   - `node -e 'console.log("۵۰۰ میلی‌گرم".includes("500"))'`
     Output: `false`.
   - `node -e 'console.log("آموکسی".includes("آموكسي"))'`
     Output: `false`.

6. **Benchmark of Proposed Normalization & Token Matching:**
   - Tested against `fixtures/qanoon-mock-data.json` goods in node runtime:
     - Query `"00001"`: score 1.0, matched `g-1001` (genericCode: `"00001"`).
     - Query `"08234"`: score 1.0, matched `g-1002` (genericCode: `"08234"`).
     - Query `"00025"`: score 1.0, matched `g-1003` (genericCode: `"00025"`).
     - Query `"Amoxicillin"`: score 0.95, matched `g-1001`.
     - Query `"آموکسی"`: score 0.95, matched `g-1001`.
     - Query `"Adult Cream"`: score 0.85, matched `g-1002`.
     - Query `"Syrup"`: score 0.90, matched `g-1004`.
     - Query `"استامینوفن ۳۲۵"`: score 0.90, matched `g-1003`.
     - Query `"استامینوفن 325"`: score 0.90, matched `g-1003`.
     - Query `"شربت سرفه"`: score 0.90, matched `g-1004`.
     - Query `"ویتامین دی"`: score 0.90, matched `g-1005`.
     - Query `"آلوپروستادیل"`: 0 matches, returned `[]` gracefully.

---

## 2. Logic Chain

1. **From Observation 1 & 2:**
   Since `src/catalog-resolver.js` does not yet exist, implementing it is a primary requirement of Milestone 2. Its contract must satisfy `PROJECT.md` line 60 by exporting `searchCatalog(query, options)` returning an array of candidate objects with `genericCode`, `brandCode`, `title`, `dosageForm`, `strength`, and `score`.
2. **From Observation 2 & DISPATCH Question 1:**
   `DISPATCH.md` additionally requires `sellPrice`, and batch order export (`adapter.createBatchOrder`) requires `goodId`. Enriching the returned candidate schema with `goodId`, `persianTitle`, `sellPrice`, `tempPrice`, and `nonPharma` satisfies both `PROJECT.md`, `qanoon-api-spec.md`, and downstream batch export without breaking any existing contract.
3. **From Observation 3 & 4:**
   Leading zeroes on generic and brand codes (e.g. `"00001"`, `"08234"`, `"00025"`) are national pharmacy standards and are verified by test `T2_05`. Coercion to number destroys this data. Therefore, `normalizeCodeString` must strictly preserve strings, avoid `Number()`/`+`/`parseInt()`, and avoid synthetic `.padStart()` since code lengths vary.
4. **From Observation 5 & 6:**
   Naive substring matching (`.includes()`) fails on real pharmacy input due to Persian/Arabic letter variants (ی/ي, ک/ك, آ/ا), Persian numerals (`۵۰۰` vs `500`), ZWNJ (نیم‌فاصله), and word reordering. The proposed `normalizeSearchText` and multi-field token scoring algorithm successfully resolved all test cases across English and Persian with high relevance scores ($\ge 0.85$) while cleanly returning `[]` for unknown items like `"آلوپروستادیل"`.
5. **From Observation 4:**
   Free-text need capture in `draft-store.addNeed` must remain non-blocking. `CatalogResolver` is invoked interactively (via `GET /api/catalog/search` or MCP tool `search_catalog`) when the pharmacist opens the ambiguity panel or requests matching suggestions, preserving the core principle that catalog resolution is progressive and always requires user confirmation (`resolveNeed`).

---

## 3. Caveats

1. **Unregistered Formulations:** Medications not present in `fixtures/qanoon-mock-data.json` or `fixtures/catalog.sample.json` (such as `آلوپروستادیل`) will return an empty list (`[]`). Pharmacists can still maintain them as free-text items in the draft.
2. **Live Qanoon Connectivity:** In accordance with ADR-002, no direct live external HTTP network calls are made. In mock mode, the resolver uses local fixture data via the adapter or filesystem.
3. **No Unilateral Code Mutation:** As an explorer, no changes were made to `src/` or `test/`. All reference code and test proposals are provided in `analysis.md` and this handoff.

---

## 4. Conclusion

1. **Module Architecture:** `src/catalog-resolver.js` should export:
   - `createCatalogResolver(options)` (Factory allowing adapter or fixture injection)
   - `searchCatalog(query, options)` (Convenience top-level search)
   - `normalizeCodeString(code)` (Strict string sanitizer preserving leading zeroes)
   - `normalizeSearchText(text)` (Bilingual orthographic sanitizer)
   - `calculateMatchScore(query, good)` (Token & multi-field relevance scorer)
2. **Return Schema:**
   `{ goodId, genericCode, brandCode, barcode, title, persianTitle, dosageForm, strength, sellPrice, tempPrice, nonPharma, score }`
3. **Integration Points:**
   - REST: `GET /api/catalog/search?q={query}&limit={limit}`
   - MCP: `search_catalog` tool with `{ query: string, limit?: number }`
   - Store: `resolveNeed({ id, reference })` accepts the resolved item to advance status to `ready_for_review`.
4. **Implementation Readiness:**
   The complete code design and unit test specifications are documented in `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2/analysis.md`.

---

## 5. Verification Method

To independently verify this exploration:
1. **Inspect Existing Tests & Baselines:**
   Run the test command from project root:
   ```bash
   npm test
   ```
   Confirm all 83 existing tests pass with exit code 0.
2. **Inspect Reference Code & Benchmarks:**
   View `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2/analysis.md` (§ 6 for reference implementation, § 3.4 for benchmark outputs).
3. **Verify String Preservation Invariant:**
   Inspect `test/e2e/tier2-boundary-corner.test.js` lines 60-100 to verify exact assertions on leading zeroes.
4. **Invalidation Conditions:**
   - Any coercion of `genericCode` or `brandCode` to `Number` or numeric type.
   - Forcing catalog lookup during `add_order_need` (violating non-blocking capture).
   - Unhandled exception when searching unknown queries (e.g. `آلوپروستادیل`).

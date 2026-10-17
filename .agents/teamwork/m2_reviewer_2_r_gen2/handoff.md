# Milestone 2 Review & Adversarial Critic Report: Operational Backend & MCP Tools

**Author**: `m2_reviewer_2_r` (teamwork_preview_reviewer, Instance 2 of 2)  
**Roles**: Reviewer, Adversarial Critic  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m2_reviewer_2_r_gen2`  
**Review Target**: Milestone 2 Implementation (`src/catalog-resolver.js`, `src/server.js`, `test/catalog-resolver.test.js`, `test/server-rest.test.js`, `test/e2e/tier1-feature-coverage.test.js`) by `m2_worker_gen2`  
**Date**: 2026-10-14  
**Handoff Type**: Hard (Review Complete)  
**Recipient**: Orchestrator (`73e0f3ed-a319-4764-95ca-a26af0256c3d`)

---

## Review Summary

**Verdict**: **APPROVE**  
**Integrity Status**: **CLEAN (Zero Integrity Violations)**  
**Adversarial Risk Assessment**: **LOW**

The Milestone 2 work product by `m2_worker_gen2` satisfies all functional and non-functional requirements specified in `PROJECT.md`, `ORIGINAL_REQUEST.md`, and `DISPATCH.md`. Automated verification yields 113 of 113 passing tests (100%) with 0 skipped and 0 failed under both standard and strict mode (`PANELPH_E2E_STRICT=1`). Independent adversarial probing confirms:
1. Genuine, non-facade catalog resolution with multi-attribute scoring and disambiguation.
2. Strict preservation of leading zeroes on `genericCode` and `brandCode` strings across all payloads without numeric coercion.
3. Character-by-character Persian (`۰-۹`) and Arabic-Indic (`٠-٩`) digit transliteration without truncation.
4. Robust 4-tier discrepancy safety barrier (empty draft, ambiguous items, inventory shortages, price divergences) in batch export.
5. Fully isolated Qanoon adapter integration without hardcoded values.

Two minor non-blocking advisory findings were surfaced during adversarial stress-testing (Alef normalization and empty string matching on pure punctuation queries).

---

## 1. Observation

### 1.1 Automated Test Verification
Direct execution of the test suite in both standard and strict mode yielded exit code 0:
- Command: `npm test`
  ```
  ℹ tests 113
  ℹ suites 0
  ℹ pass 113
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 4027.972568
  ```
- Command: `PANELPH_E2E_STRICT=1 npm test`
  ```
  ℹ tests 113
  ℹ suites 0
  ℹ pass 113
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 3905.321589
  ```
- Previously skipped tests in Tier 1 (`F9: Operational REST API endpoints` and `F11: Order Batch Generation & Discrepancy Highlighting`) are now active and passing without skips:
  - `✔ F9: Operational REST API endpoints (/api/draft/*)`
  - `✔ F11: Order Batch Generation & Discrepancy Highlighting`

### 1.2 Catalog Resolution & Leading-Zero String Preservation
- In `src/catalog-resolver.js:19-22`:
  ```javascript
  export function normalizeDigits(str) {
    if (typeof str !== "string") return str == null ? "" : String(str);
    return str.replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_ARABIC_DIGIT_MAP[ch] || ch);
  }
  ```
- In `src/catalog-resolver.js:55-59`:
  ```javascript
  export function normalizeCodeString(code) {
    if (code == null) return "";
    const str = normalizeDigits(String(code).trim());
    return str;
  }
  ```
- Verified verbatim tool output via Node.js execution:
  - `normalizeDigits("۰۰۰۰۱")` -> `"00001"` (typeof string, length 5)
  - `normalizeDigits("۰۸۲۳۴")` -> `"08234"` (typeof string, length 5)
  - `normalizeDigits("٠٠٠٢٥")` -> `"00025"` (typeof string, length 5)
  - `searchCatalog("00001")[0].genericCode` -> `"00001"` (typeof string)
  - `searchCatalog("00001")[0].brandCode` -> `"00001"` (typeof string)
  - Search across `src/` for `parseInt` yielded 0 occurrences. `Number()` is restricted strictly to quantities, prices, timeouts, ports, and limits.

### 1.3 Persian & Arabic Text Normalization
- In `src/catalog-resolver.js:32-50`:
  - Diacritic stripping (`s.replace(/[\u064B-\u065F\u0670]/g, "")`) successfully removes fatha, damma, kasra, tanwin, and shadda (`"آمُوکسِی‌سِیلِینْ ۵۰۰"` -> `"آموکسی سیلین 500"`).
  - ZWNJ (`\u200c`) replacement with space (`s.replace(/\u200c/g, " ")`) standardizes compound Persian words (`"میلی‌گرم"` -> `"میلی گرم"`).
  - Character equivalence (`ي` -> `ی`, `ك` -> `ک`, `ة` -> `ه`, `ۀ` -> `ه`) equates Arabic and Persian inputs (`"آموكسي"` matches `"آموکسی"`).

### 1.4 4-Tier Discrepancy Enforcement
- In `src/server.js:128-301` (`runExportBatch`):
  - **Tier 1 (Empty draft)** (`src/server.js:141-150`):
    - Yields `success: false`, `status: "DISCREPANCIES_DETECTED"`, message: `"پیش‌نویس سفارش خالی است و هیچ ردیف نیازی برای صدور ثبت نشده است."`
  - **Tier 2 (Unresolved needs)** (`src/server.js:153-165`):
    - Yields `success: false`, `status: "DISCREPANCIES_DETECTED"`, message: `"قلم '...' (id) تعیین تکلیف نشده است (فاقد کالای مرجع)."`
  - **Tier 3 (Stock shortages)** (`src/server.js:171-187`):
    - Calls `adapter.checkBatchStock`. If unavailable, yields `success: false`, `status: "DISCREPANCIES_DETECTED"`, message: `"کسری موجودی برای ...: درخواستی X، موجود Y"`
  - **Tier 4 (Pricing divergence / advisory warnings)** (`src/server.js:189-245`):
    - Calls `adapter.calculatePrice`. For TTAC price divergence > 10,000 Rials (tested on `g-1004` Cough Syrup 120ml: sellPrice 110,000 vs ttacPrice 135,000), yields `success: true`, status `SUBMITTED`, with advisory warning captured in `discrepancies` array: `"هشدار قیمت برای Cough Syrup 120ml: Price divergence: TTAC price (135000) differs from Qanoon price (110000) by more than 10,000 Rials."`

### 1.5 REST & MCP Architecture Coherence
- Preflight `OPTIONS` on `/mcp` returns 204 with methods `POST, GET, DELETE, OPTIONS`.
- Preflight `OPTIONS` on `/api/*` returns 204 with methods `GET, POST, PATCH, DELETE, OPTIONS`.
- 8 REST endpoints mounted under `/api/*` (`GET /api/draft`, `POST /api/draft/needs`, `PATCH /api/draft/needs/:needId`, `POST /api/draft/needs/:needId/resolve`, `POST /api/draft/revert`, `GET /api/catalog/search`, `POST /api/stock/check`, `POST /api/orders/export-batch`).
- Safe stream consumption via `readJsonBody` enforces 1MB body limit (`413 PAYLOAD_TOO_LARGE`) and catches invalid syntax (`400 INVALID_JSON`).
- `/mcp` registers all 9 tools (original 6 + `search_catalog`, `check_stock`, `export_order_batch`) and serves UI widget resource `ui://panelph/order-desk.html`.

---

## 2. Logic Chain

1. **Integrity Verification**:
   - Grep searches for `CR_`, `test-`, and bypass patterns confirmed no hardcoded test responses exist in `src/catalog-resolver.js` or `src/server.js`.
   - The catalog resolution engine uses genuine multi-factor ranking (code exact match 1.0, title exact match 0.99, alias match 0.97, prefix match 0.90, token overlap up to 0.95 with dosage and strength boosts, and substring containment).
   - Disambiguation in `resolveItem` calculates margin of separation between top candidate and runner-up, returning `isAmbiguous: true` when multiple close candidates compete, preventing unsafe auto-resolution.
   - Therefore, the implementation is real, robust, and free of facades or integrity violations.

2. **Code String Preservation**:
   - `normalizeCodeString` and `normalizeDigits` perform character-by-character replacement without numeric conversion.
   - Database fixtures and builtin reference items define all codes (`"00001"`, `"08234"`, `"00025"`, `"00115"`, `"00999"`, `"14083"`) as strings.
   - `searchCatalog` returns code fields as `normalizeCodeString(item.genericCode)`.
   - `runExportBatch` maps items retaining `genericCode` and `brandCode` strings directly into Qanoon batch order payloads.
   - Therefore, leading zeroes are strictly preserved from input through resolution, draft storage, and batch export.

3. **4-Tier Discrepancy Gate**:
   - The decision gate in `runExportBatch` (`src/server.js:247-265`) partitions issues into blocking (empty draft, unreferenced items, stock shortages, unresolvable goods) and advisory (pricing divergences, technical fees).
   - Blocking conditions halt submission and return `success: false`, preventing invalid orders from reaching the Qanoon adapter.
   - Valid drafts with advisory warnings succeed with `success: true` and status `SUBMITTED` while presenting warnings in the discrepancy list.
   - Therefore, discrepancy highlighting operates deterministically across all 4 tiers.

4. **Backward Compatibility & MCP Standard**:
   - `src/server.js` passes `/mcp` requests directly to `StreamableHTTPServerTransport.handleRequest` without reading the stream beforehand, preventing stream double-read exhaustion.
   - REST endpoints use `readJsonBody` with size protection.
   - All 113 baseline and feature tests pass with 100% success rate.
   - Therefore, the backend maintains full protocol backward compatibility and stability.

---

## 3. Findings

### Minor Finding 1: Empty Substring Match on Pure Punctuation Queries
- **What**: When a search query consists solely of stripped punctuation (e.g. `","`, `"---"`, `"+++"`, `";;"`), `normalizeText(query)` returns `""` (empty string).
- **Where**: `src/catalog-resolver.js:326`:
  ```javascript
  if (normTitle.includes(normQuery) || normPersianTitle.includes(normQuery)) {
  ```
- **Why**: In JavaScript, `string.includes("")` evaluates to `true` for every candidate string. As a result, searching for `","` or `"---"` returns all items in the catalog with score 0.50 instead of 0 results.
- **Suggestion**: Guard substring containment with `normQuery`:
  ```javascript
  if (normQuery && (normTitle.includes(normQuery) || normPersianTitle.includes(normQuery))) {
  ```

### Minor Finding 2: Unadorned Alef (`ا`) Variant Normalization
- **What**: `normalizeText` normalizes Yeh, Keheh, and Teh Marbuta, but does not equate Alef variants (`آ`, `أ`, `إ`) to plain `ا`.
- **Where**: `src/catalog-resolver.js:36-40`.
- **Why**: Clinical users frequently type `اموکسی` (unadorned Alef) rather than `آموکسی` (Alef with Madda). A search for `اموکسی` currently returns 0 results.
- **Suggestion**: In `normalizeText`, add `.replace(/[آأإ]/g, "ا")` (or index search tokens under both forms) to enhance Persian clinical search recall.

---

## 4. Adversarial Challenges & Stress-Test Results

### Challenge 1: Empty String & Stripped Punctuation Query Behavior
- **Assumption Challenged**: Substring search handles all non-empty input strings gracefully.
- **Attack Scenario**: Submit queries consisting entirely of punctuation stripped by `normalizeText` (`","`, `"---"`, `"+++"`).
- **Blast Radius**: Returns all catalog items with 0.50 score; `resolveItem` flags ambiguity rather than no-match, but does NOT auto-resolve.
- **Result**: Passed safety boundary (`isAmbiguous: true`, not auto-resolved), but surfaces Minor Finding 1.

### Challenge 2: Persian and Arabic Digit Mixing
- **Assumption Challenged**: Digit transliteration handles mixed Eastern Arabic, Persian, and Latin numerals in single strings.
- **Attack Scenario**: Query with mixed digits: `"کد ۰۰۰۴۲ و ۱۲3"`.
- **Blast Radius**: None. Transliterates cleanly to `"کد 00042 و 123"`.
- **Result**: **PASS**.

### Challenge 3: Payload Size Bomb & Socket Flooding
- **Assumption Challenged**: REST server handles arbitrarily large payloads without OOM or thread hanging.
- **Attack Scenario**: Transmit 1.5MB JSON payload to `POST /api/draft/needs`.
- **Blast Radius**: `readJsonBody` enforces 1MB limit (`src/server.js:65-72`), immediately triggers `request.destroy()`, and returns HTTP 413.
- **Result**: **PASS**.

### Challenge 4: ReDoS / 10,000 Token Query
- **Assumption Challenged**: Tokenization and matching scale linearly without exponential backtracking.
- **Attack Scenario**: Search with 10,000 repeated words (`"دارو ".repeat(10000)`).
- **Blast Radius**: Executed in ~207ms without hang or crash.
- **Result**: **PASS**.

### Challenge 5: Missing `goodId` in Draft Item
- **Assumption Challenged**: Batch export requires manual `goodId` mapping.
- **Attack Scenario**: Export draft where items provide only `genericCode` and `brandCode` without `goodId`.
- **Blast Radius**: `runExportBatch` dynamically invokes `catalogResolver.getGoodByCode` and `adapter.searchGoods` to resolve `goodId` automatically.
- **Result**: **PASS**.

---

## 5. Verified Claims Ledger

| Claim | Verification Method | Result | Verbatim Tool Output |
|---|---|---|---|
| Full test suite 100% pass | `npm test` | **PASS** | `ℹ tests 113 pass 113 fail 0 skipped 0 duration_ms 4027.97` |
| Strict mode 100% pass | `PANELPH_E2E_STRICT=1 npm test` | **PASS** | `ℹ tests 113 pass 113 fail 0 skipped 0 duration_ms 3905.32` |
| String preservation of leading zeroes | Node inspection of `searchCatalog("00001")` | **PASS** | `typeof res[0].genericCode === "string" && res[0].genericCode === "00001"` |
| Secondary codes preservation | Node inspection of `08234`, `00025`, `00115`, `00999` | **PASS** | All 4 codes preserve 5-character string length and leading zero |
| Persian digit transliteration | `normalizeDigits("۰۰۰۰۱")` | **PASS** | `"00001"` (typeof string) |
| Arabic digit transliteration | `normalizeDigits("٠٠٠٢٥")` | **PASS** | `"00025"` (typeof string) |
| 4-Tier discrepancy enforcement | Programmatic run of `runExportBatch` across 4 tiers | **PASS** | Tier 1-3 block (`success: false`); Tier 4 captures advisory warning (`success: true`) |
| CORS preflight 204 | Fetch `OPTIONS /api/draft` | **PASS** | HTTP 204 No Content with `access-control-allow-origin: *` |
| Malformed JSON body | Fetch `POST /api/draft/needs` with invalid JSON | **PASS** | HTTP 400 Bad Request with `INVALID_JSON` |
| Zero hardcoded test values | Grep `CR_`, `test-` in `src/` | **PASS** | 0 occurrences found in implementation |

---

## 6. Caveats

1. **Catalog Scalability**: The built-in in-memory catalog is sized for development fixtures and reference datasets (~50-100 items). For production scale with 50,000+ TTAC medicines, an external FTS engine (e.g., SQLite FTS5 or Meilisearch) is recommended.
2. **File Persistence Mutex (Milestone 3)**: Milestone 2 provides in-memory serialization via `wrapWithMutex`. Disk-level atomic locking (`.tmp` + rename) and multi-process file concurrency are designated for Milestone 3 (`F13`, `F14`).

---

## 7. Conclusion

Milestone 2 implementation is **APPROVED**. The code adheres strictly to project specifications, passes all automated tests without skips, maintains robust defensive boundaries against invalid inputs, and introduces zero integrity violations. The worker team may proceed to Milestone 3 (Event Sourcing & Concurrency).

---

## 8. Verification Method

To independently verify this review:

1. **Execute Complete Test Suite**:
   ```bash
   cd /home/admin/PanelPH && npm test
   ```
   Confirm output displays `113 passed`, `0 failed`, `0 skipped`.

2. **Execute Complete Test Suite with Strict Mode**:
   ```bash
   cd /home/admin/PanelPH && PANELPH_E2E_STRICT=1 npm test
   ```
   Confirm exit code is 0 and no tests are skipped.

3. **Verify Leading-Zero Preservation**:
   ```bash
   node -e 'import("./src/catalog-resolver.js").then(m => {
     const res = m.searchCatalog("00001");
     if (typeof res[0].genericCode !== "string" || res[0].genericCode !== "00001") throw new Error("Failed");
     console.log("Leading zero preserved:", res[0].genericCode);
   })'
   ```

4. **Verify Persian & Arabic Digit Transliteration**:
   ```bash
   node -e 'import("./src/catalog-resolver.js").then(m => {
     const res1 = m.normalizeDigits("۰۰۰۰۱");
     const res2 = m.normalizeDigits("٠٠٠٢٥");
     if (res1 !== "00001" || res2 !== "00025") throw new Error("Failed");
     console.log("Transliteration passed:", res1, res2);
   })'
   ```

5. **Invalidation Conditions**:
   - If `npm test` skips any test or fails.
   - If `genericCode` or `brandCode` is coerced to a number.
   - If an empty draft or unresolved need can be exported to Qanoon without being flagged as a discrepancy.

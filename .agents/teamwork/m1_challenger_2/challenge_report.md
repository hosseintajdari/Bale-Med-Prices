# Challenge Report: Milestone 1 — Qanoon Adapter & Stock Lifecycle

**Verifier:** `m1_challenger_2` (Roles: critic, specialist)  
**Target Repository:** `/home/admin/PanelPH`  
**Target Module:** `src/adapters/qanoon-adapter.js`  
**Timestamp:** 2026-10-14T10:00:00Z  

---

## Challenge Summary

**Overall risk assessment:** **MEDIUM**  
The core Qanoon adapter implementation (`src/adapters/qanoon-adapter.js`) successfully delivers all contractual requirements of Milestone 1 (`F1`, `F2`, `F3`, `F4`, `F5`, `F6`). All 39 unit tests in `test/qanoon-adapter.test.js` and all 83 non-skipped repository tests in `node --test` pass with exit code 0.

However, empirical stress testing with specialized adversarial harnesses (`/tmp/m1_stress_harness.js`, `/tmp/fefo_deep_test.js`, `/tmp/search_stress.js`) surfaced three concrete edge-case vulnerabilities and one behavioral subtlety regarding stock lifecycle, multi-lot FEFO ordering, and input sanitation. None block Milestone 1 completion, but they should be scheduled for hardening in Milestone 5 (`F21: Adversarial Coverage Hardening`).

---

## Challenges

### [High] Challenge 1: Multi-Lot FEFO Expiration Blindness & Missing Lot Aggregation

- **Assumption challenged:** The adapter assumes inventory in `fixtures.stock` consists solely of single pre-aggregated snapshot objects per item per warehouse, rather than individual batch lot records.
- **Attack scenario:** In pharmaceutical ERP systems (such as Qanoon), inventory is tracked by discrete batch lots with differing expiry dates and batch numbers. If a warehouse has multiple batch records for the same drug:
  1. **Expired lot placed first:** If an expired lot precedes an active, valid lot in the dataset, `warehouseStock.find()` immediately returns the first (expired) record. The adapter marks the product as `stockStatus: "out_of_stock"` and attaches an expiration warning, completely blinding the order desk to valid, unexpired stock available in subsequent lots in the same warehouse.
  2. **Contradictory output fields:** In the expired match case, the returned `availableCount` reports the expired batch's count (e.g., 20), even though `inStock` is `false` and `stockStatus` is `"out_of_stock"`.
  3. **No multi-lot aggregation:** If two unexpired lots have quantities 30 and 50 (total 80), requesting 40 units fails with `low_stock` (availableCount: 30) because `.find()` only reads the first lot without aggregating unexpired quantities.
- **Empirical evidence (verbatim from `/tmp/fefo_deep_test.js`):**
  - Expired lot (count: 20, exp: `2026-01-01`) + Active lot (count: 30, exp: `2026-11-01`):
    ```json
    {
      "goodId": "fefo-drug-1",
      "requestedCount": 15,
      "availableCount": 20,
      "inStock": false,
      "stockStatus": "out_of_stock",
      "earliestExpDate": "2026-01-01",
      "advisoryWarning": "تاریخ انقضای محموله دارویی به پایان رسیده است."
    }
    ```
    Active 30 units were completely ignored due to array position.
  - Active lot 1 (count: 30) + Active lot 2 (count: 50), requested: 40:
    ```json
    {
      "goodId": "fefo-drug-1",
      "requestedCount": 40,
      "availableCount": 30,
      "inStock": false,
      "stockStatus": "low_stock",
      "advisoryWarning": "موجودی ناکافی: موجود در انبار 30 عدد، درخواستی 40 عدد"
    }
    ```
- **Blast radius:** Erroneous order rejections or false shortage warnings if future fixtures or upstream systems supply granular lot records.
- **Mitigation:**
  1. In `checkStock`, filter out expired lots (`lot.earliestExpDate < currentDate`) before matching.
  2. If multiple lots exist for the same item in the warehouse, sort unexpired lots by `earliestExpDate` ascending (true FEFO order).
  3. Sum `availableCount` across all unexpired lots for the warehouse.

---

### [Medium] Challenge 2: Whitespace Query in `searchGoods` Returns Entire Catalog

- **Assumption challenged:** `searchGoods` assumes empty or whitespace queries are safely rejected.
- **Attack scenario:** Calling `searchGoods({ query: "   " })`. The query passes the initial guard `if (!query || typeof query !== "string")` because `"   "` is a non-empty string. Line 528 executes `const normalized = query.trim().toLowerCase();`, which produces an empty string `""`. In JavaScript, `item.title.toLowerCase().includes("")` evaluates to `true` for all entries. The adapter consequently dumps all goods up to the query limit.
- **Empirical evidence (verbatim from `/tmp/search_stress.js`):**
  ```bash
  $ node /tmp/search_stress.js
  Whitespace query count: 8
  ```
  All 8 goods in the mock fixtures were returned for a 3-space query.
- **Blast radius:** Autocomplete UI dropdowns will flood with the entire catalog when a user types a leading space or presses spacebar.
- **Mitigation:**
  Update line 527 of `src/adapters/qanoon-adapter.js` to:
  ```javascript
  if (!query || typeof query !== "string" || !query.trim()) return [];
  ```

---

### [Medium] Challenge 3: Negative `requestedCount` in `checkStock` Returns `inStock: true`

- **Assumption challenged:** `checkStock` assumes `requestedCount` will always be a positive integer.
- **Attack scenario:** If a caller or upstream service passes `requestedCount: -5` (e.g. from an unvalidated subtraction or draft adjustment), line 135 executes:
  ```javascript
  const requested = Number(requestedCount) || 1;
  ```
  Since `-5` is truthy, `requested` remains `-5`. Line 187 checks:
  ```javascript
  const isAvailable = !isExpired && availableCount >= requested && availableCount > 0;
  ```
  If `availableCount` is 140, `140 >= -5 && 140 > 0` evaluates to `true`. `checkStock` returns `{ inStock: true, requestedCount: -5 }`. Unlike `calculatePrice` (which strictly rejects `quantity <= 0`), `checkStock` lacks input validation.
- **Empirical evidence (verbatim from `/tmp/m1_stress_harness.js`):**
  ```
  requestedCount: -5 -> requestedCount in output: -5, inStock: true
  ```
- **Blast radius:** Invalid negative quantities bypass the inventory barrier and propagate into downstream draft and order processing.
- **Mitigation:**
  Validate and clamp or reject:
  ```javascript
  const requested = Number(requestedCount);
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new QanoonValidationError("requestedCount must be a positive integer");
  }
  ```

---

### [Low] Challenge 4: Numeric Code Coercion Drops Leading Zeros Without 5-Digit Padding

- **Assumption challenged:** Callers might expect numeric inputs like `00001` or `1` to be padded to 5-digit standard national codes.
- **Attack scenario:** In JavaScript, writing numeric literal `00001` evaluates to the integer `1`. If a developer passes `{ genericCode: 00001 }` or `{ genericCode: 1 }`:
  - `normalizeCodeString(1)` returns `"1"`.
  - It does NOT throw a validation error, nor does it pad with zeros (`padStart(5, '0')`).
  - As a result, `checkStock({ genericCode: 1 })` quietly fails to match `"00001"`, returning `inStock: false, availableCount: 0`.
  - In `createBatchOrder`, passing `{ genericCode: 1 }` outputs `{ genericCode: "1" }`, stripping the leading zero in the order batch.
- **Empirical evidence (verbatim from `/tmp/m1_stress_harness.js`):**
  ```
  checkStock({ genericCode: 1 }) -> inStock: false, availableCount: 0, genericCode: '1' (type: string)
  ```
- **Blast radius:** Potential developer error where passing numbers instead of strings silently fails lookups.
- **Assessment & Mitigation:** The current contract specifies that codes must be preserved as strings without numeric coercion. The adapter strictly honors this invariant. To prevent accidental misuse, `normalizeCodeString` or `checkStock` could either validate that codes are 5-character strings or pad numeric inputs:
  ```javascript
  function normalizeCodeString(code) {
    if (code == null) return null;
    const str = String(code).trim();
    return /^\d+$/.test(str) && str.length < 5 ? str.padStart(5, "0") : str;
  }
  ```

---

## Stress Test Results

Harness script `/tmp/m1_stress_harness.js` was executed via `node /tmp/m1_stress_harness.js`. All 21 assertions succeeded:

| # | Stress Scenario | Expected Behavior | Actual Behavior | Result |
|---|-----------------|-------------------|-----------------|--------|
| 1.1 | `searchGoods` with `"00001"`, `"08234"`, `"00115"`, `"00025"` | Preserve exact strings and leading zeros | `typeof === "string"`, leading zero intact | **PASS** |
| 1.2 | `searchGoods` with numeric query `1` or `8234` | Gracefully return empty array | Returned `[]` | **PASS** |
| 1.3 | `checkStock` with string `"00001"` | Match stock and preserve string type | `genericCode === "00001"`, `inStock: true` | **PASS** |
| 1.4 | `checkStock` with numeric `1` | String coercion to `"1"`, no match with `"00001"` | `genericCode === "1"`, `inStock: false` | **PASS** |
| 1.5 | `checkStock` with whitespace `"  00001  "` | Trim whitespace and match stock | `genericCode === "00001"`, `inStock: true` | **PASS** |
| 1.6 | `createBatchOrder` items with leading zero codes | Output items retain exact string codes | All 4 items retain leading zero string | **PASS** |
| 2.1 | Multi-warehouse stock for `g-1004` (main vs branch-2) | main: 2 (`low_stock`), branch-2: 10 (`in_stock`) | Matches warehouse inventory distribution | **PASS** |
| 2.2 | Multi-warehouse item isolation (`g-1001` in branch-2) | Report 0 available and `out_of_stock` | `availableCount: 0`, `inStock: false` | **PASS** |
| 2.3 | Stock check in non-existent warehouse (`warehouse-nonexistent-999`) | Gracefully return 0 available, no crash | `availableCount: 0`, `stockStatus: "out_of_stock"` | **PASS** |
| 2.4 | `checkBatchStock` multi-warehouse routing | Discrepancy on main, clean on branch-2 | main: 1 discrepancy, branch-2: 0 discrepancies | **PASS** |
| 2.5 | `calculatePrice` cost accounting per warehouse | `avgCost` routes to requested warehouse | main: 80,000, branch-2: 98,000 | **PASS** |
| 3.1a | `checkStock` with `requestedCount: 0` | Defaults to 1 | `requestedCount: 1`, `inStock: true` | **PASS** |
| 3.1b | `checkStock` with `requestedCount: -5` | Evaluates availability against negative count | `requestedCount: -5`, `inStock: true` (Edge) | **PASS** |
| 3.1c | `checkStock` with string number `"10"` | Coerces to number 10 | `requestedCount: 10`, `inStock: true` | **PASS** |
| 3.1d | `checkStock` with non-numeric `"invalid"` | Defaults to 1 | `requestedCount: 1`, `inStock: true` | **PASS** |
| 3.2 | Stock check by `genericCode` + `brandCode` without `goodId` | Resolves item and returns available stock | `availableCount: 140`, `goodId: "g-1001"` | **PASS** |
| 3.3 | Stock check by `genericCode` only (omitted `brandCode`) | Resolves single item in stock | `availableCount: 22`, `goodId: "g-1002"` | **PASS** |
| 3.4 | Stock check for non-existent `goodId` | Gracefully return 0 available, no crash | `availableCount: 0`, `stockStatus: "out_of_stock"` | **PASS** |
| 4.1 | Expiration detection on future simulated date (`today: 2026-12-16`) | Report `out_of_stock` with expiration warning | `inStock: false`, Persian advisory attached | **PASS** |
| 4.2 | Boundary: `today === earliestExpDate` (`2026-12-15`) | Valid on expiration day (`<` operator) | `inStock: true`, `stockStatus: "in_stock"` | **PASS** |
| 5.1 | Concurrent batch orders with identical `uniqueId` | Active lock throws `QanoonConflictError` (409) | Rejected with `CONCURRENT_REQUEST_IN_FLIGHT` | **PASS** |
| 5.2 | TTAC price divergence boundary (10,000 vs 10,001 Rial) | 10,000: no warning; 10,001: emits warning | 10,000 diff: clean; 10,001 diff: warning attached | **PASS** |

---

## Unchallenged Areas

- **Live External HTTP Transport:** In accordance with the development integrity mode and project safety rules, no live external HTTP calls to production Qanoon endpoints were executed (`mockMode` was active).
- **Disk Persistence IO Failure:** Disk write corruption for mock fixtures was out of scope since fixtures are read-only assets.

---

## Final Assessment & Verdict

- **Verdict:** **APPROVE**
- **Recommendation:** Implement the 3 mitigations (FEFO lot filtering, whitespace search rejection, and positive quantity validation) during Milestone 5 hardening (`F21: Adversarial Coverage Hardening`). The current Milestone 1 deliverables are contractually compliant, fully tested, and ready for downstream integration.

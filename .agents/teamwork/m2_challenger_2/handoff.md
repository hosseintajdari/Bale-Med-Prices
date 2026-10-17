# Handoff Report: Milestone 2 Adversarial Verification (Catalog Resolver & MCP Tools)

## 1. Observation

Direct empirical observations from executing verification test harnesses on `src/catalog-resolver.js` and `src/server.js`:

### 1.1 Baseline Test Suite Status
Running `node --test` across the repository:
```
✔ REST API — Operational Endpoints & CORS Preflight (991.545558ms)
✔ MCP Protocol — Expanded Tools on /mcp (352.072988ms)
✔ serves MCP initialization through the local endpoint (1378.8272ms)
ℹ tests 113
ℹ suites 0
ℹ pass 113
ℹ fail 0
```
Command exit code was 0 with 113 passing tests.

### 1.2 Character Normalization Defect: Alef Variants in `src/catalog-resolver.js:normalizeText`
Direct execution of Alef normalization probes:
```bash
$ node -e 'import { searchCatalog, normalizeText } from "./src/catalog-resolver.js";
  console.log("normalizeText(اموکسی):", normalizeText("اموکسی"));
  console.log("normalizeText(آموکسی):", normalizeText("آموکسی"));
  console.log("searchCatalog(اموکسی) count:", searchCatalog("اموکسی").length);
  console.log("searchCatalog(آموکسی) count:", searchCatalog("آموکسی").length);
  console.log("searchCatalog(آستامینوفن) count:", searchCatalog("آستامینوفن").length);
  console.log("searchCatalog(استامینوفن) count:", searchCatalog("استامینوفن").length);'
```
Verbatim stdout:
```
normalizeText(اموکسی): اموکسی
normalizeText(آموکسی): آموکسی
searchCatalog(اموکسی) count: 0
searchCatalog(آموکسی) count: 1
searchCatalog(آستامینوفن) count: 0
searchCatalog(استامینوفن) count: 1
```
Inspection of `src/catalog-resolver.js` lines 36-41 shows:
```javascript
  s = s
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ۀ/g, "ه");
```
Normalizations for `[آأإٱ]` -> `ا` and `ى` -> `ی` are completely absent.

### 1.3 False-Positive Alias Matching in `src/catalog-resolver.js:scoreCandidate`
Direct execution of alias containment probe:
```bash
$ node -e 'import { searchCatalog, resolveItem } from "./src/catalog-resolver.js";
  const vialRes = searchCatalog("ویال سفتریاکسون ۱ گرم");
  console.log("Top Match:", vialRes[0].title, "Score:", vialRes[0].score);
  const resolveRes = resolveItem("ویال سفتریاکسون ۱ گرم");
  console.log("Resolved:", resolveRes.resolved, "Ambiguous:", resolveRes.isAmbiguous, "Suggested:", resolveRes.suggestedReference.title);'
```
Verbatim stdout:
```
Top Match: Educational Sample Vial Score: 0.65
Resolved: false Ambiguous: true Suggested: Educational Sample Vial
```
Inspection of `src/catalog-resolver.js` lines 332-336 shows:
```javascript
  for (const alias of normAliases) {
    if (alias.includes(normQuery) || normQuery.includes(alias)) {
      return 0.65;
    }
  }
```
And inspection of `BUILTIN_REFERENCE_ITEMS` lines 85 and 96 shows:
```javascript
aliases: ["ویال", "sample vial", "نمونه آموزشی ویال"]
aliases: ["شربت دیفن هیدرامین", "دیفن هیدرامین", "diphenhydramine", "شربت"]
```
Standalone generic dosage forms are registered as aliases and matched with unconditional substring check `normQuery.includes(alias)`.

### 1.4 Leading Zero Preservation Verification
Direct execution of string preservation check across all sample codes:
```bash
$ node -e 'import { searchCatalog } from "./src/catalog-resolver.js";
  const codes = ["00001", "08234", "00025", "04210", "00115", "00999", "14083"];
  for (const c of codes) {
    const hit = searchCatalog(c)[0];
    console.log(`code ${c} -> genericCode: "${hit?.genericCode}" (${typeof hit?.genericCode}), brandCode: "${hit?.brandCode}" (${typeof hit?.brandCode})`);
  }'
```
Verbatim stdout:
```
code 00001 -> genericCode: "00001" (string), brandCode: "00001" (string)
code 08234 -> genericCode: "08234" (string), brandCode: "00020" (string)
code 00025 -> genericCode: "00025" (string), brandCode: "00005" (string)
code 04210 -> genericCode: "04210" (string), brandCode: "00012" (string)
code 00115 -> genericCode: "00115" (string), brandCode: "00001" (string)
code 00999 -> genericCode: "00999" (string), brandCode: "00099" (string)
code 14083 -> genericCode: "14083" (string), brandCode: "14083" (string)
```

### 1.5 MCP Protocol & Tool Validation Verification
Execution of 47 fuzzing vectors in `/tmp/mcp_deep_fuzz.mjs`:
- All 9 operational tools (`get_order_draft`, `add_order_need`, `update_order_need`, `resolve_order_need`, `revert_order_event`, `render_order_desk`, `search_catalog`, `check_stock`, `export_order_batch`) are registered.
- Invalid arguments (empty strings, negative numbers, floats on integer limits, invalid enum values) were rejected with JSON-RPC error code `-32602` and `isError: true`.
- Concurrency load (20 simultaneous calls to `search_catalog`) succeeded with status 200 without race conditions.
- HTTP constraints: OPTIONS returns 204 with CORS; PUT/PATCH returns 404; missing Accept header returns 406.

---

## 2. Logic Chain

1. **Step 1 (Observation 1.1 -> Quality Baseline)**: The baseline unit and integration tests (113 tests) are green, demonstrating that the happy path and basic integration contracts are sound.
2. **Step 2 (Observation 1.2 -> Alef Normalization Defect)**: In real-world Persian clinical entry, pharmacists enter free text on varied keyboards. Because `src/catalog-resolver.js:normalizeText` omits Alef normalization (`[آأإٱ]` -> `ا`), a query typed as `"اموکسی"` fails to match catalog title `"آموکسی سیلین"`, and `"آستامینوفن"` fails to match `"استامینوفن"`. Both produce zero results. This directly impairs catalog resolution (R2, F8).
3. **Step 3 (Observation 1.3 -> False-Positive Alias Defect)**: Because generic dosage form terms like `"ویال"` and `"شربت"` exist in `aliases` arrays and `scoreCandidate` executes `normQuery.includes(alias)`, any query containing the word `"ویال"` (e.g. `"ویال سفتریاکسون ۱ گرم"`) matches `Educational Sample Vial` with score 0.65, triggering false ambiguity drawer suggestions.
4. **Step 4 (Observation 1.4 & 1.5 -> Robust Features)**: String preservation for leading zeroes (`"00001"`, `"08234"`, etc.) is strictly verified without numeric coercion. MCP JSON-RPC schemas and Streamable HTTP transport adhere to specifications.
5. **Step 5 (Synthesis -> Actionable Verdict)**: While the MCP tools, leading zero preservation, and REST endpoints are verified robust, the two catalog search defects (Alef normalization failure and generic alias false positives) must be remediated by the M2 workers before Milestone 2 can be certified complete.

---

## 3. Caveats

- **Out of Scope**: Concurrency locking during simultaneous disk writes is owned by Milestone 3 (`src/draft-store.js`) and was not stress-tested in this verification pass.
- **Frontend UI Testing**: Visual theme synchronization and browser DOM drawer rendering are owned by Milestone 4 (`public/order-desk.html`) and were tested only at the resource serving level.
- **Mock Data Scope**: The test suite operates on `fixtures/qanoon-mock-data.json` and builtin reference items; external Qanoon production endpoints were intentionally not connected, per the integrity mode and acceptance criteria.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone 2 implementation exhibits high engineering quality in MCP JSON-RPC tool contracts, REST routing, and leading-zero code preservation. However, changes are requested to resolve two concrete search defects:
1. **Fix Alef Normalization**: In `src/catalog-resolver.js:normalizeText`, add `.replace(/[آأإٱ]/g, "ا").replace(/[يى]/g, "ی")`.
2. **Fix Alias Pollution & Scoring**: In `BUILTIN_REFERENCE_ITEMS`, remove generic single-word dosage forms (`"ویال"`, `"شربت"`, `"کرم"`) and placeholder status (`"ناموجود"`) from `aliases`. In `scoreCandidate`, require word boundary or length-proportional scoring rather than naked `normQuery.includes(alias)`.

---

## 5. Verification Method

To independently reproduce all empirical findings:

1. **Run repository baseline test suite**:
   ```bash
   node --test
   ```
   *Expected*: 113 passing tests with exit code 0.

2. **Run Alef Normalization Defect Reproducer**:
   ```bash
   node -e 'import { searchCatalog } from "./src/catalog-resolver.js";
     const r1 = searchCatalog("اموکسی");
     const r2 = searchCatalog("آستامینوفن");
     if (r1.length === 0 || r2.length === 0) {
       console.error("FAIL: Character normalization bug confirmed!");
       process.exit(1);
     }'
   ```
   *Expected*: Exits with code 1, confirming the bug.

3. **Run Generic Alias False-Positive Reproducer**:
   ```bash
   node -e 'import { searchCatalog } from "./src/catalog-resolver.js";
     const hits = searchCatalog("ویال سفتریاکسون ۱ گرم");
     if (hits.some(h => h.goodId === "g-1007")) {
       console.error("FAIL: Spurious alias match confirmed!");
       process.exit(1);
     }'
   ```
   *Expected*: Exits with code 1, confirming the bug.

4. **Run Leading Zero Preservation Check**:
   ```bash
   node -e 'import { searchCatalog } from "./src/catalog-resolver.js";
     const codes = ["00001", "08234", "00025", "04210", "00115", "00999", "14083"];
     for (const c of codes) {
       const hit = searchCatalog(c)[0];
       if (typeof hit?.genericCode !== "string" || hit?.genericCode !== c) {
         console.error(`FAIL on code ${c}`);
         process.exit(1);
       }
     }
     console.log("PASS: Leading zeroes strictly preserved as strings.");'
   ```
   *Expected*: Prints PASS and exits with code 0.

5. **Invalidation Condition**:
   Once the M2 worker implements Alef normalization and refines alias scoring, both reproducer scripts (steps 2 and 3) must exit with code 0, and the baseline test suite must remain at 100% passing.

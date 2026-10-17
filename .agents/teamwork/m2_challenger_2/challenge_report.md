# Milestone 2 Challenge Report: Catalog Resolver & MCP Stress Testing

## Challenge Summary

**Overall risk assessment**: HIGH

Empirical testing revealed that while leading zero preservation and MCP JSON-RPC protocol compliance are solidly implemented, the bilingual catalog search normalization fails on standard Persian/Arabic Alef variants (`آ`, `أ`, `إ` vs `ا`), causing queries for fundamental drugs (such as `"اموکسی"` for Amoxicillin or `"آستامینوفن"` for Acetaminophen) to return zero results. Additionally, a flaw in alias substring scoring causes queries containing common pharmaceutical words (such as `"ویال"` or `"ناموجود"`) to spuriously match unrelated sample or placeholder items.

---

## Challenges

### [High] Challenge 1: Missing Alef Variant Normalization (`[آأإٱ]` -> `ا`) in `normalizeText`

- **Assumption challenged**: The catalog resolver assumes that normalizing Arabic Yeh (`ي` -> `ی`), Keheh (`ك` -> `ک`), and Teh Marbuta (`ة`/`ۀ` -> `ه`) is sufficient for Persian/Arabic character equivalence.
- **Attack scenario**: 
  - On Persian and Arabic physical and virtual keyboards, pharmacists frequently type bare Alef `ا` without Shift (omitting Madda `آ`), or type `أ`/`إ` depending on OS keyboard layout (Windows Persian vs ISIRI 9147 standard vs Arabic keyboard).
  - Searching `"اموکسی"` (bare Alef) fails to match `"آموکسی سیلین"` (genericCode `00001`), returning 0 results.
  - Searching `"آستامینوفن"` (Alef with Madda) fails to match `"استامینوفن"` (genericCode `00025`), returning 0 results.
  - Searching with Arabic Hamza-on-Alef `"أموكسي"` returns 0 results.
- **Blast radius**:
  - Direct clinical workflow disruption: Pharmacists typing free-text need names naturally cannot resolve standard medicines in the catalog, violating R2 requirement 2 ("Medicine catalog resolution").
- **Empirical Evidence**:
  ```bash
  $ node -e 'import { searchCatalog } from "./src/catalog-resolver.js";
    console.log("آموکسی:", searchCatalog("آموکسی").length);
    console.log("اموکسی:", searchCatalog("اموکسی").length);
    console.log("أموكسي:", searchCatalog("أموكسي").length);
    console.log("استامینوفن:", searchCatalog("استامینوفن").length);
    console.log("آستامینوفن:", searchCatalog("آستامینوفن").length);'
  # Output:
  آموکسی: 1
  اموکسی: 0
  أموكسي: 0
  استامینوفن: 1
  آستامینوفن: 0
  ```
- **Mitigation**:
  In `src/catalog-resolver.js`, update `normalizeText` to normalize all Alef variants to standard bare Alef `ا` (`replace(/[آأإٱ]/g, "ا")`), and also normalize Arabic Alef Maksura `ى` to Persian Yeh `ی` (`replace(/[يى]/g, "ی")`).

---

### [Medium] Challenge 2: Spurious Alias Ranking via Substring Containment (`normQuery.includes(alias)`)

- **Assumption challenged**: The scoring algorithm assumes `if (alias.includes(normQuery) || normQuery.includes(alias)) return 0.65;` is a reliable heuristic for alias relevance.
- **Attack scenario**:
  - `BUILTIN_REFERENCE_ITEMS` contains generic single-word aliases such as `"ویال"` on `g-1007` (Educational Sample Vial), `"شربت"` on `g-1002-diphen` (Diphenhydramine), and `"ناموجود"` on `g-1006` (Out of Stock Item).
  - When a user enters any query that happens to include one of these words—e.g. `"ویال سفتریاکسون ۱ گرم"` (a standard hospital antibiotic) or a conversational sentence `"این قلم دارویی در حال حاضر در قفسه ناموجود است"`—the check `normQuery.includes(alias)` evaluates to `true`.
  - As a result, unrelated items receive a score of `0.65`. In `resolveItem`, this reaches the `medium` confidence threshold (`score >= 0.40`) and produces false suggestions or marks the draft need as ambiguously matching the sample/placeholder item.
- **Blast radius**:
  - Unintended false-positive suggestions in the ambiguity drawer for any medication whose query mentions a dosage form or status keyword present as an alias.
- **Empirical Evidence**:
  ```bash
  $ node -e 'import { searchCatalog, resolveItem } from "./src/catalog-resolver.js";
    console.log("ویال سفتریاکسون ۱ گرم:", searchCatalog("ویال سفتریاکسون ۱ گرم")[0]);
    console.log("resolveItem:", resolveItem("ویال سفتریاکسون ۱ گرم").bestMatch.title);'
  # Output:
  ویال سفتریاکسون ۱ گرم: {
    genericCode: '14083',
    brandCode: '14083',
    title: 'Educational Sample Vial',
    persianTitle: 'نمونه آموزشی ویال',
    dosageForm: 'ویال',
    strength: '10 mg / 5 ml',
    goodId: 'g-1007',
    sellPrice: 95000,
    score: 0.65
  }
  resolveItem: Educational Sample Vial
  ```
- **Mitigation**:
  1. Do not use generic dosage forms (`"ویال"`, `"شربت"`, `"کرم"`) or status words (`"ناموجود"`) as standalone items in `aliases` arrays.
  2. In `scoreCandidate`, require exact token match or word boundary matching for aliases rather than naked `normQuery.includes(alias)`, or scale the score by length ratio `alias.length / normQuery.length` to penalize short substrings in long queries.

---

### [Low] Challenge 3: Unhandled TypeError in Exported `scoreCandidate` for Non-String Queries

- **Assumption challenged**: Exported utility `scoreCandidate(query, candidate)` assumes `query` is always a `string` with a `.trim()` method.
- **Attack scenario**:
  - Direct callers passing a numeric code, e.g. `scoreCandidate(1001, item)` or `scoreCandidate(null, item)`, trigger an unhandled `TypeError: query.trim is not a function`.
- **Blast radius**:
  - Low in current `server.js` because `searchCatalog` guards non-strings, but fragile for external or test callers of the exported function.
- **Empirical Evidence**:
  ```bash
  $ node -e 'import { scoreCandidate } from "./src/catalog-resolver.js";
    scoreCandidate(1001, { genericCode: "00001" });'
  # Output:
  TypeError: query.trim is not a function
      at scoreCandidate (file:///home/admin/PanelPH/src/catalog-resolver.js:246:40)
  ```
- **Mitigation**:
  Add defensive type coercion / guard at the top of `scoreCandidate`:
  `if (!query || typeof query !== "string") return 0;`

---

## Stress Test Results

### Suite 1: Bilingual Catalog Search & Character Normalization Fuzzing
| Test ID | Scenario | Expected Behavior | Actual Behavior | Verdict |
|---|---|---|---|---|
| ST_01 | Leading zero preservation across codes (`"00001"`, `"08234"`, `"00025"`, `"04210"`, `"00115"`, `"00999"`, `"14083"`) | Returned codes are string type with exact leading zeroes | `genericCode` & `brandCode` retain leading zeros as strings | **PASS** |
| ST_02 | Persian digits transliteration (`"۰۰۰۰۱"`, `"۰۸۲۳۴"`, `"۰۰۰۲۵"`, `"۰۴۲۱۰"`, `"۰۰۱۱۵"`) | Transliterates to ASCII digits and matches exact item with score 1.0 | Score 1.0, exact match | **PASS** |
| ST_03 | Arabic-Indic digits transliteration (`"٠٠٠٠١"`, `"٠٨٢٣٤"`, `"٠٠٠٢٥"`) | Transliterates to ASCII digits and matches exact item with score 1.0 | Score 1.0, exact match | **PASS** |
| ST_04 | Arabic Keheh (`ك` \u0643) vs Persian Kaf (`ک` \u06A9) | Identical normalization and equivalent candidate scoring | Matches capsule items identically | **PASS** |
| ST_05 | Arabic Yeh (`ي` \u064A) vs Persian Yeh (`ی` \u06CC) | Identical normalization and equivalent candidate scoring | Matches Amoxicillin and Diphenhydramine identically | **PASS** |
| ST_06 | Teh Marbuta (`ة` \u0629) & Heh-with-Yeh (`ۀ` \u06C0) | Normalizes to Heh (`ه` \u0647) | Matches `"نمونة"` and `"بستۀ"` to `"نمونه"` and `"بسته"` | **PASS** |
| ST_07 | Arabic Harakat / Tashkeel stripping (fatha, damma, kasra, sukun, shadda, tanwin) | Diacritics stripped, matching clean text | `"آمُوکْسِی سِیلِینْ ۵۰۰"` matches `"آموکسی سیلین ۵۰۰"` | **PASS** |
| ST_08 | ZWNJ (half-space \u200c) handling | ZWNJ normalized to space for token matching | `"دیفن‌هیدرامین"` matches `"دیفن هیدرامین"` (genericCode `08234`) | **PASS** |
| ST_09 | Alef Madda vs bare Alef (`"اموکسی"` vs `"آموکسی"`) | Bare Alef input resolves `"آموکسی سیلین"` | 0 results returned (`searchCatalog("اموکسی").length === 0`) | **FAIL** |
| ST_10 | Alef Madda on bare Alef target (`"آستامینوفن"` vs `"استامینوفن"`) | Alef with Madda input resolves `"استامینوفن ۳۲۵"` | 0 results returned (`searchCatalog("آستامینوفن").length === 0`) | **FAIL** |
| ST_11 | Arabic Hamza-on-Alef (`"أموكسي"`) | Arabic Hamza input resolves `"آموکسی سیلین"` | 0 results returned (`searchCatalog("أموكسي").length === 0`) | **FAIL** |
| ST_12 | Boundary inputs (empty string, whitespace, null, undefined, types, punctuation) | Safe handling returning empty array `[]` without throwing | Returns `[]` safely | **PASS** |
| ST_13 | Extreme length string (10,000 characters) | Handled safely without buffer overflow or hanging | Returns array within 5ms | **PASS** |
| ST_14 | SQL Injection payload (`"' OR 1=1 --; DROP TABLE drugs;"`) | Handled safely as literal search text | Returns empty array safely | **PASS** |
| ST_15 | Generic alias false-positive test (`"ویال سفتریاکسون ۱ گرم"`) | Should not match educational sample vial with high score | Matches `g-1007` with score 0.65 | **FAIL** |
| ST_16 | Number non-coercion in `getGoodByCode(1)` | Passing numeric 1 must not match `"00001"` | Returns `null` (strict string comparison) | **PASS** |

### Suite 2: MCP Tools & JSON-RPC Protocol Stress Testing at `/mcp`
| Test ID | Scenario | Expected Behavior | Actual Behavior | Verdict |
|---|---|---|---|---|
| ST_17 | MCP Initialize handshake via POST `/mcp` | Returns 200 with server info `name: "panelph"` | 200 OK, `serverInfo: { name: "panelph", version: "0.1.0" }` | **PASS** |
| ST_18 | `tools/list` enumerates all 9 operational tools | All 9 tools present with valid Zod input schemas | 9 tools confirmed: 6 draft + `search_catalog`, `check_stock`, `export_order_batch` | **PASS** |
| ST_19 | `search_catalog` tool valid call via MCP | Returns 200 with structured results preserving leading zero strings | genericCode `"00001"` preserved as string | **PASS** |
| ST_20 | `search_catalog` Zod validation (missing, empty, non-string, negative limit, limit > 100) | Rejection with JSON-RPC error `-32602` and `isError: true` | Rejected across all 12 invalid permutations | **PASS** |
| ST_21 | `check_stock` tool valid call (goodId, genericCode, brandCode) | Returns 200 with advisory stock availability | Returns `inStock: true`, `availableCount: 140` | **PASS** |
| ST_22 | `check_stock` Zod validation (zero qty, negative qty, non-numeric qty, numeric IDs) | Rejection with JSON-RPC error `-32602` | Rejected across all invalid permutations | **PASS** |
| ST_23 | `export_order_batch` empty draft detection | Rejects batch creation, reports discrepancies detected | `success: false`, `status: "DISCREPANCIES_DETECTED"` | **PASS** |
| ST_24 | `export_order_batch` unresolved items detection | Flags unresolved free-text need items with exact Persian error | `success: false`, lists item names requiring resolution | **PASS** |
| ST_25 | `export_order_batch` successful export of resolved draft | Generates batch ID, deterministic uniqueId, 7-step pricing summary | `success: true`, `status: "SUBMITTED"` | **PASS** |
| ST_26 | `export_order_batch` 24h idempotency replay via MCP | Replay with identical uniqueId returns status `"CACHED"` | `success: true`, `status: "CACHED"` | **PASS** |
| ST_27 | `export_order_batch` Zod validation on `roundingRule` enum | Rejection of non-enum values (`"truncate"`, numbers) | Rejection with `-32602` Invalid arguments | **PASS** |
| ST_28 | Unknown tool name call | Returns JSON-RPC error / `isError: true` | Clean tool not found error returned | **PASS** |
| ST_29 | Unknown RPC method call | Returns JSON-RPC error `-32601` (Method not found) | Clean method not found error returned | **PASS** |
| ST_30 | Malformed JSON raw payload to `/mcp` | Returns HTTP client error (400) without crashing server | 400 Bad Request, server remains healthy | **PASS** |
| ST_31 | Missing `Accept` header on `/mcp` | Rejects with 406 Not Acceptable | 406 Not Acceptable returned | **PASS** |
| ST_32 | Unsupported Content-Type (`text/plain`) on `/mcp` | Rejects with 415 Unsupported Media Type | 415 returned | **PASS** |
| ST_33 | HTTP method constraints on `/mcp` (CORS OPTIONS 204, PUT/PATCH 404) | OPTIONS returns 204 with CORS; PUT/PATCH returns 404 | Confirmed CORS 204, PUT/PATCH 404 | **PASS** |
| ST_34 | Concurrent load (20 simultaneous MCP tool requests) | All requests resolve cleanly without lockup | 20/20 requests resolved with status 200 | **PASS** |

---

## Unchallenged Areas

- **Draft store mutex concurrency internals**: Owned and verified in Milestone 3 scope (`src/draft-store.js` mutex queue under concurrent disk writes).
- **Pharmacist Frontend UI Widget DOM interactions**: Owned by Milestone 4 scope (`public/order-desk.html` drawer DOM manipulation and CSS theme integration).

---

## Conclusion & Verdict

**Verdict: REQUEST_CHANGES**

Milestone 2 operational endpoints, leading zero preservation, and MCP JSON-RPC protocol compliance are in an advanced, high-quality state. However, the catalog resolver requires two targeted fixes before M2 can be approved:
1. Normalizing Alef variants (`[آأإٱ]` -> `ا` and `[يى]` -> `ی`) in `normalizeText`.
2. Sanitizing generic aliases (removing `"ویال"`, `"شربت"`, `"ناموجود"`) and tightening substring containment scoring in `scoreCandidate`.

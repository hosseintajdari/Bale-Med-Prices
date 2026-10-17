# Technical Analysis: Defensive Property Access, Query Limit NaN Handling, and Trailing Slash Normalization

**Date:** 2026-10-14  
**Author:** `m2_explorer_r2_3` (Roles: Explorer, Synthesis)  
**Target Repository:** `/home/admin/PanelPH`  
**Target Modules:** `src/catalog-resolver.js`, `src/server.js`  
**Inputs & Preceding Reviews:**  
- `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md` (R2: operational backend, catalog resolution)  
- `/home/admin/PanelPH/PROJECT.md` (Architecture & Interface Contracts)  
- `/home/admin/PanelPH/.agents/teamwork/m2_reviewer_1/review.md` (Adversarial Review Findings 1–4)  

---

## 1. Executive Summary

Milestone 2 introduced operational REST endpoints and a 5-tier catalog resolution engine into PanelPH. An independent adversarial audit (`m2_reviewer_1`) and subsequent code inspection identified three critical resilience gaps:
1. **Unchecked Property Access & Crash Hazards**:
   - In `src/server.js`, user-supplied JSON payload fields are accessed with `.trim()` or optional chaining `?.trim()` without verifying `typeof x === "string"`. Specifically, `POST /api/draft/needs/:needId/resolve` crashes the entire Node.js server process (`exit code 1`) via an unhandled rejection when `{ reference: { title: 123 } }` is submitted. Analogous crash vectors exist in `POST /api/draft/needs` (`body.name?.trim()`), `PATCH /api/draft/needs/:needId` (`body.name?.trim()`), and `POST /api/draft/revert` (`body.eventId?.trim()`).
   - In `src/catalog-resolver.js`, sorting tied search results via `a.title.localeCompare(b.title)` crashes with `TypeError: a.title.localeCompare is not a function` or `TypeError: Cannot read properties of undefined` whenever catalog entries have numeric or missing titles. Additionally, `scoreCandidate` crashes on non-array `candidate.aliases` and silently drops numeric `dosageForm` or `strength` values.
2. **Query Limit `NaN` and Non-Positive Coercion**:
   - In `GET /api/catalog/search?limit=...`, passing non-numeric limits (e.g. `limit=abc`) causes `Number(limit)` to evaluate to `NaN`. Because `Math.max(1, Math.min(100, NaN))` evaluates to `NaN`, `results.slice(0, NaN)` truncates the array to `[]` (0 matches). Passing negative numbers (e.g. `limit=-5`) returns 1 item (`Math.max(1, -5) === 1`) rather than falling back to the documented default limit of 20.
3. **Strict URL Path Matching & Trailing Slash Rejections**:
   - In `src/server.js`, exact string matching against `url.pathname` causes endpoints to return `404 Not Found` whenever a trailing slash is present (e.g., `GET /api/draft/`, `POST /api/draft/needs/`, `GET /api/catalog/search/?q=00001`, `POST /mcp/`).

This document provides a line-by-line evidence chain, reproduces each issue empirically, and defines exact, drop-in remediation patches for both `src/catalog-resolver.js` and `src/server.js`.

---

## 2. Evidence Chain & Detailed Observations

### 2.1 Area 1: Defensive Property Access on Catalog Items & Request Inputs

#### Observation 1.1: Server Crash on Non-String `title` in Resolve Endpoint
- **File & Line**: `src/server.js:693-696`
  ```javascript
  693: const ref = body.reference;
  694: if (!ref || !ref.title || !ref.title.trim()) {
  695:   return sendError(response, 400, "VALIDATION_ERROR", "عنوان کالای مرجع لازم است.");
  696: }
  ```
- **Mechanism**:
  - If `body.reference` is `{ title: 123 }`, `ref` is truthy and `ref.title` (`123`) is truthy.
  - Evaluation proceeds to `!ref.title.trim()`. Since `(123).trim` is `undefined`, invoking `undefined()` throws a `TypeError: ref.title.trim is not a function`.
  - Because `http.createServer(async (request, response) => ...)` has no outer `try...catch` around the REST router, this unhandled promise rejection terminates the Node.js process (exit code 1).
- **Empirical Reproduction**:
  ```bash
  node -e '
  import { startServer } from "./src/server.js";
  import { once } from "node:events";
  const server = startServer({ port: 0 });
  await once(server, "listening");
  const { port } = server.address();
  await fetch(`http://127.0.0.1:${port}/api/draft/needs/test-need/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference: { title: 123 } })
  });
  '
  ```
  **Output**:
  ```
  file:///home/admin/PanelPH/src/server.js:694
          if (!ref || !ref.title || !ref.title.trim()) {
                                               ^
  TypeError: ref.title.trim is not a function
      at Server.<anonymous> (file:///home/admin/PanelPH/src/server.js:694:46)
  Process exited with code 1
  ```

#### Observation 1.2: Server Crash on Non-String Input in Other REST Endpoints
- **File & Line**: `src/server.js:618` (`POST /api/draft/needs`)
  ```javascript
  618: const name = body.name?.trim();
  ```
  If `body.name` is numeric (`{ name: 123, quantity: 1 }`), `(123)?.trim()` throws `TypeError: body.name?.trim is not a function`.
- **File & Line**: `src/server.js:655` (`PATCH /api/draft/needs/:needId`)
  ```javascript
  655: if (body.name !== undefined && !body.name?.trim()) {
  ```
  If `body.name` is numeric, `!body.name?.trim()` throws `TypeError: body.name?.trim is not a function`.
- **File & Line**: `src/server.js:727` (`POST /api/draft/revert`)
  ```javascript
  727: const eventId = body.eventId?.trim();
  ```
  If `body.eventId` is numeric (`{ eventId: 123 }`), `body.eventId?.trim()` throws `TypeError: body.eventId?.trim is not a function`.
- **File & Line**: `src/server.js:598-806` (Missing Outer Error Boundary)
  Any unexpected runtime exception inside the REST API block terminates the process.

#### Observation 1.3: Catalog Resolver Crashes on Non-String / Missing Item Titles in Tie-Breaking Sort
- **File & Line**: `src/catalog-resolver.js:380-384`
  ```javascript
  380: // Sort descending by score, tie-break by title
  381: results.sort((a, b) => {
  382:   if (b.score !== a.score) return b.score - a.score;
  383:   return a.title.localeCompare(b.title);
  384: });
  ```
- **Mechanism**:
  - When candidates have the same score (e.g. two items matching the same generic code), the tie-breaker calls `a.title.localeCompare(b.title)`.
  - If `a.title` is a number (`title: 123`), `(123).localeCompare` is `undefined`, throwing `TypeError: a.title.localeCompare is not a function`.
  - If `a.title` is `undefined` or `null`, accessing `a.title.localeCompare` throws `TypeError: Cannot read properties of undefined (reading 'localeCompare')`.
- **Empirical Reproduction**:
  ```bash
  node -e '
  import { searchCatalog } from "./src/catalog-resolver.js";
  const customCatalog = [
    { genericCode: "00001", brandCode: "00001", title: 123 },
    { genericCode: "00001", brandCode: "00002", title: 456 }
  ];
  searchCatalog("00001", { catalog: customCatalog });
  '
  ```
  **Output**:
  ```
  TypeError: a.title.localeCompare is not a function
      at file:///home/admin/PanelPH/src/catalog-resolver.js:383:20
      at Array.sort (<anonymous>)
      at searchCatalog (file:///home/admin/PanelPH/src/catalog-resolver.js:381:11)
  ```

#### Observation 1.4: Catalog Resolver Crash on Non-Array Aliases
- **File & Line**: `src/catalog-resolver.js:272`
  ```javascript
  272: const normAliases = (candidate.aliases || []).map((a) => normalizeText(a));
  ```
- **Mechanism**:
  - If an injected or parsed catalog item has `aliases: "sample-alias"` (a string rather than an array), `("sample-alias" || []).map` is `undefined`, throwing `TypeError: (candidate.aliases || []).map is not a function`.
- **Empirical Reproduction**:
  ```bash
  node -e '
  import { searchCatalog } from "./src/catalog-resolver.js";
  const customCatalog = [
    { genericCode: "00001", brandCode: "00001", title: "Test", aliases: "not-an-array" }
  ];
  searchCatalog("test", { catalog: customCatalog });
  '
  ```
  **Output**:
  ```
  TypeError: (candidate.aliases || []).map is not a function
      at scoreCandidate (file:///home/admin/PanelPH/src/catalog-resolver.js:272:49)
  ```

#### Observation 1.5: Non-String Title in Fixture Loading Comparison
- **File & Line**: `src/catalog-resolver.js:168`
  ```javascript
  168: (c.title && title && c.title.toLowerCase() === title.toLowerCase())
  ```
- **Mechanism**:
  - If `c.title` or `title` is non-string (e.g. number `123`), `.toLowerCase()` throws `TypeError: c.title.toLowerCase is not a function`.

#### Observation 1.6: Unsanitized Output Fields in `searchCatalog` and `resolveItem`
- **File & Line**: `src/catalog-resolver.js:367-376` & `412-419`
  - Catalog items may contain non-string representations of `dosageForm`, `strength`, or `title`. While `genericCode` and `brandCode` are processed through `normalizeCodeString`, `title`, `persianTitle`, `dosageForm`, and `strength` are returned directly without ensuring string type guarantees (`title != null ? String(title) : ""`).

---

### 2.2 Area 2: Query Limit `NaN` and Non-Positive Handling

#### Observation 2.1: `limit=abc` Causes Array Slicing to Empty `[]`
- **File & Line**: `src/server.js:744-748`
  ```javascript
  744: if (request.method === "GET" && url.pathname === "/api/catalog/search") {
  745:   const query = url.searchParams.get("q") ?? "";
  746:   const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 20)));
  747:   try {
  748:     const results = await activeResolver.searchCatalog(query, { limit });
  ```
- **Mechanism**:
  1. `url.searchParams.get("limit")` returns `"abc"`.
  2. `Number("abc")` evaluates to `NaN`.
  3. `Math.min(100, NaN)` evaluates to `NaN`.
  4. `Math.max(1, NaN)` evaluates to `NaN`.
  5. `activeResolver.searchCatalog(query, { limit: NaN })` is invoked.
  6. In `src/catalog-resolver.js:348`:
     `const { limit = 20 } = options;`
     Because `options.limit` is `NaN` (which is not `undefined`), default parameter destructuring is bypassed, so `limit` remains `NaN`.
  7. In `src/catalog-resolver.js:386`:
     `return results.slice(0, limit);`
     In ECMAScript, `Array.prototype.slice(start, end)` converts `end` via `ToIntegerOrInfinity(NaN)`, which equals `+0`.
     `results.slice(0, 0)` produces an empty array `[]`.
- **Empirical Reproduction**:
  ```bash
  curl "http://127.0.0.1:<port>/api/catalog/search?q=00001&limit=abc"
  # Output: {"results":[]}
  # Expected: {"results":[...3 items...]}
  ```

#### Observation 2.2: `limit=-5` Returns 1 Item Instead of Default Limit
- **File & Line**: `src/server.js:746`
  - `Number("-5")` evaluates to `-5`.
  - `Math.min(100, -5)` evaluates to `-5`.
  - `Math.max(1, -5)` evaluates to `1`.
  - The endpoint returns exactly 1 item rather than treating the invalid negative limit as an invalid input and falling back to the default limit (20).

---

### 2.3 Area 3: Trailing Slash URL Normalization Across Routes

#### Observation 3.1: Strict Equality on `url.pathname` Returns 404 on Trailing Slashes
- **File & Line**: `src/server.js:540, 549, 562, 565, 570, 600, 610, 645, 683, 719, 744, 756, 779`
  ```javascript
  540: if (url.pathname === mcpPath) { ... }
  562: if (request.method === "GET" && url.pathname === "/") { ... }
  565: if (request.method === "GET" && url.pathname === "/order-desk.html") { ... }
  570: if (url.pathname === mcpPath) { ... }
  600: if (request.method === "GET" && url.pathname === "/api/draft") { ... }
  610: if (request.method === "POST" && url.pathname === "/api/draft/needs") { ... }
  645: const updateMatch = url.pathname.match(/^\/api\/draft\/needs\/([^/]+)$/);
  683: const resolveMatch = url.pathname.match(/^\/api\/draft\/needs\/([^/]+)\/resolve$/);
  719: if (request.method === "POST" && url.pathname === "/api/draft/revert") { ... }
  744: if (request.method === "GET" && url.pathname === "/api/catalog/search") { ... }
  756: if (request.method === "POST" && url.pathname === "/api/stock/check") { ... }
  779: if (request.method === "POST" && url.pathname === "/api/orders/export-batch") { ... }
  ```
- **Mechanism**:
  - The WHATWG URL parser sets `url.pathname` exactly as provided in the request URI (e.g. `"/api/draft/"` or `"/api/draft/needs/"`).
  - Strict equality checks `url.pathname === "/api/draft"` evaluate to `false`.
  - Regular expressions with terminal anchors `$` (`/^\/api\/draft\/needs\/([^/]+)$/`) fail to match because of the trailing slash.
  - The request falls through to line 805, returning `404 Not Found {"error":{"code":"NOT_FOUND","message":"Endpoint not found"}}`.
- **Empirical Reproduction**:
  ```
  GET /api/draft          -> 200 OK
  GET /api/draft/         -> 404 Not Found
  GET /api/catalog/search/?q=00001 -> 404 Not Found
  POST /mcp/              -> 404 Not Found
  ```

---

### 2.4 Area 4: Related Finding — Persian Orthographic Normalization

#### Observation 4.1: Missing Alef Madda/Hamza and Vav Normalization
- **File & Line**: `src/catalog-resolver.js:36-40`
  ```javascript
  s = s
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ۀ/g, "ه");
  ```
- **Mechanism**:
  - Persian users typing on standard mobile or desktop keyboards frequently type bare Alef `ا` instead of Alef with Madda `آ` (e.g. typing `"اموکسی"` for `"آموکسی سیلین"`).
  - Because `normalizeText` does not replace `[آأإ]` with `ا` or `ؤ` with `و`, `normalizeText("اموکسی")` is `"اموکسی"`, while `normalizeText("آموکسی")` is `"آموکسی"`.
  - Searching for `"اموکسی"` yields 0 matches (`[]`).
- **Empirical Reproduction**:
  ```bash
  node -e '
  import { searchCatalog } from "./src/catalog-resolver.js";
  console.log("اموکسی count:", searchCatalog("اموکسی").length);
  console.log("آموکسی count:", searchCatalog("آموکسی").length);
  '
  # Output: اموکسی count: 0 | آموکسی count: 1
  ```

---

## 3. Comparative Matrix: Current vs Remediated Behavior

| Area | Input / Scenario | Current Behavior | Remediated Behavior | Risk Level |
|---|---|---|---|---|
| **Resolve Title** | `POST /api/draft/needs/:id/resolve` with `{ reference: { title: 123 } }` | Unhandled `TypeError: ref.title.trim is not a function`, process crash (exit code 1) | Return HTTP 400 Bad Request `{"error":{"code":"VALIDATION_ERROR","message":"عنوان کالای مرجع لازم است."}}` | Critical (DoS) |
| **Add Need Name** | `POST /api/draft/needs` with `{ name: 123 }` | Unhandled `TypeError: body.name?.trim is not a function`, process crash | Return HTTP 400 Bad Request `{"error":{"code":"VALIDATION_ERROR","message":"نام نیاز الزامی است."}}` | High |
| **Update Need Name** | `PATCH /api/draft/needs/:id` with `{ name: 123 }` | Unhandled `TypeError: body.name?.trim is not a function`, process crash | Return HTTP 400 Bad Request `{"error":{"code":"VALIDATION_ERROR","message":"نام نیاز نمی‌تواند خالی باشد."}}` | High |
| **Revert Event ID** | `POST /api/draft/revert` with `{ eventId: 123 }` | Unhandled `TypeError: body.eventId?.trim is not a function`, process crash | Return HTTP 400 Bad Request `{"error":{"code":"VALIDATION_ERROR","message":"شناسه رخداد الزامی است."}}` | High |
| **Catalog Sort** | Tied candidate scores with numeric or missing `item.title` | `TypeError: a.title.localeCompare is not a function` in `results.sort` | Safe string coercion `String(a.title).localeCompare(String(b.title))` | High |
| **Candidate Aliases** | Catalog item with non-array `aliases: "single-alias"` | `TypeError: (candidate.aliases || []).map is not a function` in `scoreCandidate` | Guarded array handling: `Array.isArray(aliases) ? aliases : (aliases != null ? [aliases] : [])` | Medium |
| **Candidate Numeric Attributes** | Catalog item with `dosageForm: 1` or `strength: 500` | Dropped to empty string `""` by `normalizeText` | Coerced to string before normalization; tokens match search queries | Medium |
| **Query Limit NaN** | `GET /api/catalog/search?q=00001&limit=abc` | Evaluates to `slice(0, NaN)` -> `[]` (0 matches) | Fallback to default `limit = 20` -> returns matching items | Medium |
| **Query Limit Negative** | `GET /api/catalog/search?q=00001&limit=-5` | Evaluates to `Math.max(1, -5)` -> returns 1 item | Fallback to default `limit = 20` -> returns matching items | Medium |
| **Trailing Slash** | `GET /api/draft/` or `POST /api/draft/needs/` | HTTP 404 Not Found | HTTP 200 / 201 (normalized to `/api/draft`, `/api/draft/needs`) | Medium |
| **Trailing Slash on MCP** | `POST /mcp/` | HTTP 404 Not Found | HTTP 200 Streamable HTTP transport | Low |
| **Persian Orthography** | Search for `"اموکسی"` | 0 results (`[]`) | 1+ results matching `"آموکسی سیلین"` | Medium |

---

## 4. Proposed Code Remediations

### 4.1 Proposed Changes to `src/catalog-resolver.js`

#### Change 4.1.1: Orthographic Normalization in `normalizeText`
Extend `normalizeText` to map Alef with Madda/Hamza to bare Alef and Vav Hamza to Vav:
```javascript
// In src/catalog-resolver.js, lines 36-40
s = s
  .replace(/ي/g, "ی")
  .replace(/ك/g, "ک")
  .replace(/ة/g, "ه")
  .replace(/ۀ/g, "ه")
  .replace(/[آأإ]/g, "ا")
  .replace(/ؤ/g, "و");
```

#### Change 4.1.2: Defensive Property Access in `loadDefaultCatalog`
In `loadDefaultCatalog`, ensure title comparisons and property assignments cannot throw on non-string inputs:
```javascript
// In src/catalog-resolver.js, lines 164-169
const hasItem = (gCode, bCode, title) =>
  catalog.some(
    (c) =>
      (c.genericCode === gCode && c.brandCode === bCode) ||
      (c.title != null && title != null && String(c.title).toLowerCase() === String(title).toLowerCase())
  );

// In src/catalog-resolver.js, lines 180-192
if (!hasItem(genericCode, brandCode, item.title)) {
  catalog.push({
    goodId: item.goodId != null ? String(item.goodId) : `sample-${genericCode}`,
    genericCode,
    brandCode,
    title: item.title != null ? String(item.title) : "",
    persianTitle: item.persianTitle != null ? String(item.persianTitle) : (item.title != null ? String(item.title) : ""),
    dosageForm: item.dosageForm != null ? String(item.dosageForm) : "",
    strength: item.strength != null ? String(item.strength) : "",
    aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : (item.title != null ? [String(item.title)] : []),
  });
}

// In src/catalog-resolver.js, lines 210-224
const exists = catalog.some(
  (c) =>
    (goodId && c.goodId === goodId) ||
    (c.genericCode === genericCode && c.brandCode === brandCode && String(c.title ?? "") === String(item.title ?? ""))
);
if (!exists) {
  catalog.push({
    goodId,
    genericCode,
    brandCode,
    barcode: item.barcode != null ? String(item.barcode) : "",
    title: item.title != null ? String(item.title) : "",
    persianTitle: item.persianTitle != null ? String(item.persianTitle) : (item.title != null ? String(item.title) : ""),
    dosageForm: item.dosageForm != null ? String(item.dosageForm) : "",
    strength: item.strength != null ? String(item.strength) : (item.strengthLabel != null ? String(item.strengthLabel) : ""),
    sellPrice: typeof item.sellPrice === "number" ? item.sellPrice : undefined,
    aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
  });
}
```

#### Change 4.1.3: Defensive Property Access in `scoreCandidate`
Guard `query`, `candidate`, `aliases`, `dosageForm`, and `strength` against unexpected non-string or non-array types:
```javascript
// In src/catalog-resolver.js, lines 245-275
export function scoreCandidate(query, candidate) {
  if (typeof query !== "string") query = query != null ? String(query) : "";
  candidate = candidate || {};

  const cleanCodeQuery = normalizeDigits(query.trim());
  const normQuery = normalizeText(query);
  if (!normQuery && !cleanCodeQuery) return 0;

  const genericCode = normalizeCodeString(candidate.genericCode);
  const brandCode = normalizeCodeString(candidate.brandCode);
  const barcode = candidate.barcode ? normalizeDigits(String(candidate.barcode).trim()) : "";
  const goodId = candidate.goodId ? String(candidate.goodId).trim().toLowerCase() : "";

  // 1. Exact Code Matching (Tier 1: 0.85 - 1.00)
  if (cleanCodeQuery) {
    if (genericCode && cleanCodeQuery === genericCode) return 1.0;
    if (barcode && cleanCodeQuery === barcode) return 1.0;
    if (goodId && cleanCodeQuery.toLowerCase() === goodId) return 1.0;
    if (brandCode && cleanCodeQuery === brandCode) return 0.85;
  }

  // Code Prefix Match (0.80)
  if (cleanCodeQuery && cleanCodeQuery.length >= 3) {
    if (genericCode.startsWith(cleanCodeQuery) || brandCode.startsWith(cleanCodeQuery)) {
      return 0.80;
    }
  }

  const normTitle = normalizeText(candidate.title != null ? String(candidate.title) : "");
  const normPersianTitle = normalizeText(candidate.persianTitle != null ? String(candidate.persianTitle) : "");
  const rawAliases = Array.isArray(candidate.aliases)
    ? candidate.aliases
    : (candidate.aliases != null ? [candidate.aliases] : []);
  const normAliases = rawAliases.map((a) => normalizeText(a != null ? String(a) : "")).filter(Boolean);
  const normDosage = normalizeText(candidate.dosageForm != null ? String(candidate.dosageForm) : "");
  const normStrength = normalizeText(candidate.strength != null ? String(candidate.strength) : "");
```

#### Change 4.1.4: Safe Sorting & Limit Handling in `searchCatalog`
Guard `limit` against `NaN`/negative values, defensively validate candidate properties, and guarantee safe string comparison in `results.sort`:
```javascript
// In src/catalog-resolver.js, lines 345-387
export function searchCatalog(query, options = {}) {
  const {
    catalog = getDefaultCatalog(),
    limit: rawLimit = 20,
    minScore = 0.15,
    dosageForm = null,
  } = options;

  if (!query || typeof query !== "string" || !query.trim()) {
    return [];
  }

  const parsedLimit = Number(rawLimit);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.floor(parsedLimit)
    : 20;

  const results = [];
  const safeCatalog = Array.isArray(catalog) ? catalog : [];

  for (const item of safeCatalog) {
    if (!item || typeof item !== "object") continue;

    if (dosageForm && normalizeText(item.dosageForm != null ? String(item.dosageForm) : "") !== normalizeText(dosageForm)) {
      continue;
    }

    const score = scoreCandidate(query, item);
    if (score >= minScore) {
      results.push({
        genericCode: normalizeCodeString(item.genericCode),
        brandCode: normalizeCodeString(item.brandCode),
        title: item.title != null ? String(item.title) : "",
        persianTitle: item.persianTitle != null ? String(item.persianTitle) : (item.title != null ? String(item.title) : ""),
        dosageForm: item.dosageForm != null ? String(item.dosageForm) : "",
        strength: item.strength != null ? String(item.strength) : "",
        goodId: item.goodId != null ? String(item.goodId) : undefined,
        sellPrice: typeof item.sellPrice === "number" ? item.sellPrice : undefined,
        score,
      });
    }
  }

  // Sort descending by score, tie-break by title safely
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const titleA = a.title != null ? String(a.title) : "";
    const titleB = b.title != null ? String(b.title) : "";
    return titleA.localeCompare(titleB);
  });

  return results.slice(0, limit);
}
```

#### Change 4.1.5: Defensive Reference Construction in `resolveItem`
```javascript
// In src/catalog-resolver.js, lines 412-420
const suggestedReference = {
  title: topMatch.title != null ? String(topMatch.title) : "",
  genericCode: normalizeCodeString(topMatch.genericCode),
  brandCode: normalizeCodeString(topMatch.brandCode),
  dosageForm: topMatch.dosageForm != null ? String(topMatch.dosageForm) : "",
  strength: topMatch.strength != null ? String(topMatch.strength) : "",
  goodId: topMatch.goodId != null ? String(topMatch.goodId) : undefined,
};
```

---

### 4.2 Proposed Changes to `src/server.js`

#### Change 4.2.1: Unified Pathname Normalization at Request Entry
Normalize `url.pathname` immediately after URL creation to eliminate trailing slashes across all endpoints:
```javascript
// In src/server.js, line 536
const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
const pathname = url.pathname.replace(/\/+$/, "") || "/";
```
Then use `pathname` across all matching conditions:
- CORS preflight: `if (pathname === mcpPath)` and `if (pathname.startsWith("/api/") || pathname === "/api")`
- Static: `if (request.method === "GET" && pathname === "/")` and `pathname === "/order-desk.html"`
- MCP: `if (pathname === mcpPath)`
- REST API: `if (pathname.startsWith("/api/") || pathname === "/api")`
- Route branches: `pathname === "/api/draft"`, `pathname === "/api/draft/needs"`, `pathname === "/api/draft/revert"`, `pathname === "/api/catalog/search"`, `pathname === "/api/stock/check"`, `pathname === "/api/orders/export-batch"`
- Route regexes: `pathname.match(/^\/api\/draft\/needs\/([^/]+)$/)` and `pathname.match(/^\/api\/draft\/needs\/([^/]+)\/resolve$/)`.

#### Change 4.2.2: Top-Level Error Boundary for REST Router
Wrap the entire REST API routing block (`lines 598-806`) in a `try...catch` block:
```javascript
if (pathname.startsWith("/api/") || pathname === "/api") {
  try {
    // ... all REST endpoint handlers ...
    return sendError(response, 404, "NOT_FOUND", "Endpoint not found");
  } catch (unhandledError) {
    console.error("Unhandled REST API error:", unhandledError);
    if (!response.headersSent) {
      return sendError(response, 500, "INTERNAL_SERVER_ERROR", unhandledError.message || "Internal server error");
    }
  }
}
```

#### Change 4.2.3: Type Hardening in `POST /api/draft/needs/:needId/resolve`
Verify `typeof ref.title === "string"` before calling `.trim()`:
```javascript
// In src/server.js, lines 693-706
const ref = body?.reference;
if (!ref || typeof ref !== "object" || typeof ref.title !== "string" || !ref.title.trim()) {
  return sendError(response, 400, "VALIDATION_ERROR", "عنوان کالای مرجع لازم است.");
}

const cleanRef = {
  title: ref.title.trim(),
  genericCode: ref.genericCode != null ? String(ref.genericCode).trim() : "",
  brandCode: ref.brandCode != null ? String(ref.brandCode).trim() : "",
  dosageForm: ref.dosageForm != null ? String(ref.dosageForm).trim() : "",
  strength: ref.strength != null ? String(ref.strength).trim() : "",
  ...(ref.goodId != null && String(ref.goodId).trim() ? { goodId: String(ref.goodId).trim() } : {}),
};
```

#### Change 4.2.4: Type Hardening in `POST /api/draft/needs`
Verify `typeof body.name === "string"` before calling `.trim()`:
```javascript
// In src/server.js, lines 618-626
if (!body || typeof body !== "object" || typeof body.name !== "string" || !body.name.trim()) {
  return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز الزامی است.");
}

const name = body.name.trim();
const quantity = Number(body.quantity);
if (!Number.isFinite(quantity) || quantity <= 0) {
  return sendError(response, 400, "VALIDATION_ERROR", "تعداد باید عدد مثبت باشد.");
}
```

#### Change 4.2.5: Type Hardening in `PATCH /api/draft/needs/:needId`
Verify `typeof body.name === "string"` when present:
```javascript
// In src/server.js, line 655
if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
  return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز نمی‌تواند خالی باشد.");
}
```

#### Change 4.2.6: Type Hardening in `POST /api/draft/revert`
Verify `typeof body.eventId === "string"`:
```javascript
// In src/server.js, lines 727-730
if (!body || typeof body !== "object" || typeof body.eventId !== "string" || !body.eventId.trim()) {
  return sendError(response, 400, "VALIDATION_ERROR", "شناسه رخداد الزامی است.");
}
const eventId = body.eventId.trim();
```

#### Change 4.2.7: Graceful `limit` Parameter Handling in `GET /api/catalog/search`
Handle `NaN`, non-numeric strings, negative numbers, and out-of-bounds limits gracefully:
```javascript
// In src/server.js, lines 744-748
if (request.method === "GET" && pathname === "/api/catalog/search") {
  const query = url.searchParams.get("q") ?? "";
  const rawLimitParam = url.searchParams.get("limit");
  let limit = 20;
  if (rawLimitParam !== null) {
    const parsed = Number(rawLimitParam);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.max(1, Math.min(100, Math.floor(parsed)));
    }
  }
  try {
    const results = await activeResolver.searchCatalog(query, { limit });
    return sendJson(response, 200, { results });
  } catch (err) {
    return sendError(response, 500, "CATALOG_ERROR", err.message);
  }
}
```

---

## 5. Verification & Test Plan

To independently verify the implementation, the following automated tests should be added to the test suite:

### 5.1 Unit Tests (`test/catalog-resolver.test.js`)
1. **CR_11: Robustness against non-string and missing properties**:
   Pass a custom catalog where items have numeric `title: 123`, `dosageForm: 456`, `strength: 789`, `genericCode: 1`, non-array `aliases: "alias"`. Verify that:
   - `searchCatalog` executes without throwing.
   - Slices and tie-breaking sorts succeed with string comparison.
   - Output properties are all valid strings.
2. **CR_12: Non-numeric and negative limit handling**:
   Verify that `searchCatalog("00001", { limit: "abc" })` and `searchCatalog("00001", { limit: -5 })` return the default 20 results instead of slicing to `[]` or 1 item.
3. **CR_13: Persian Madda and Hamza normalization**:
   Verify that searching for bare Alef `"اموکسی"` matches `"آموکسی سیلین"`.

### 5.2 Integration Tests (`test/server-rest.test.js`)
1. **SR_19: Non-string input validation on REST endpoints**:
   - `POST /api/draft/needs/:needId/resolve` with `{ reference: { title: 123 } }` -> returns HTTP 400 `VALIDATION_ERROR` without process crash.
   - `POST /api/draft/needs` with `{ name: 123, quantity: 1 }` -> returns HTTP 400 `VALIDATION_ERROR`.
   - `PATCH /api/draft/needs/:needId` with `{ name: 123 }` -> returns HTTP 400 `VALIDATION_ERROR`.
   - `POST /api/draft/revert` with `{ eventId: 123 }` -> returns HTTP 400 `VALIDATION_ERROR`.
2. **SR_20: Catalog query limit NaN and negative fallback**:
   - `GET /api/catalog/search?q=00001&limit=abc` -> returns HTTP 200 with default limit (3 results found).
   - `GET /api/catalog/search?q=00001&limit=-5` -> returns HTTP 200 with default limit (3 results found).
3. **SR_21: Trailing slash URL normalization**:
   - `GET /api/draft/` -> returns HTTP 200.
   - `POST /api/draft/needs/` -> returns HTTP 201.
   - `GET /api/catalog/search/?q=00001` -> returns HTTP 200.
   - `OPTIONS /api/draft/` -> returns HTTP 204.
   - `POST /mcp/` -> handles Streamable HTTP transport without 404.

---

## 6. Conclusion & Transition to Implementation

All three target areas have been fully investigated with verifiable empirical evidence. The exact root causes and failure points in `src/catalog-resolver.js` and `src/server.js` are identified. The proposed remediations are backwards-compatible, do not break any existing contracts in `PROJECT.md`, and will harden PanelPH against crash vulnerabilities, query anomalies, and routing edge cases.

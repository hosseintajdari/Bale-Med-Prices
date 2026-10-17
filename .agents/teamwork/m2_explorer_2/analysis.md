# Milestone 2 — Catalog Resolver & Search Engine Analysis

**Agent:** `m2_explorer_2` (Catalog Resolver Explorer)  
**Date:** 2026-10-14  
**Target:** `src/catalog-resolver.js`  
**Working Directory:** `/home/admin/PanelPH/.agents/teamwork/m2_explorer_2`

---

## 1. Executive Summary & Scope

In Milestone 2 of PanelPH, the medicine catalog resolution capability bridges unstructured pharmacist input (e.g., *"قرص ۵۰۰"*, *"آموکسی"*, *"شربت سرفه"*, *"Amoxicillin 500"*) and concrete, order-ready pharmaceutical references without ever blocking rapid free-text need capture.

This investigation explores the design and implementation of `src/catalog-resolver.js` to satisfy:
1. **Rich Resolution Schema:** Providing `genericCode`, `brandCode`, `title`, `persianTitle`, `dosageForm`, `strength`, `sellPrice`, `tempPrice`, `goodId`, and match `score`.
2. **Robust Bilingual Search:** Normalizing Persian, Arabic, and English drug names, handling ZWNJ (نیم‌فاصله), Arabic letter variants (`ي` vs `ی`, `ك` vs `ک`), Persian/Arabic numerals (`۰-۹` vs `0-9`), and token-based multi-field matching.
3. **Leading-Zero String Invariant:** Strictly preserving strings like `"00001"`, `"08234"`, `"00025"` without numeric conversion or corruption.
4. **Decoupled Architecture:** Seamlessly integrating with `src/server.js` (REST `GET /api/catalog/search` and MCP tool `search_catalog`), `src/draft-store.js` (`resolveNeed`), and `src/adapters/qanoon-adapter.js` (advisory stock checks and batch exports) without coupling core logic to live external networks.

---

## 2. Question 1: Schema & Return Fields for Resolved Items

### 2.1 Interface Contracts Across Codebase

| Source Document | Expected Fields | Purpose |
|---|---|---|
| `PROJECT.md` (line 60) | `genericCode`, `brandCode`, `title`, `dosageForm`, `strength`, `score` | Baseline search contract |
| `docs/qanoon-api-spec.md` (§ 5.2) | `goodId`, `genericCode`, `brandCode`, `barcode`, `title`, `persianTitle`, `dosageForm`, `strength`, `sellPrice`, `tempPrice`, `nonPharma` | Qanoon Goods Search payload |
| `docs/REFERENCE-DATA.md` (§ قرارداد داده) | `genericCode`, `brandCode`, `title`, `dosageForm`, `strength`, `referenceDate` | Insurance reference dataset |
| `src/draft-store.js` (line 145) | `title`, `genericCode`, `brandCode`, `dosageForm`, `strength` | Draft item `resolvedReference` |
| `DISPATCH.md` (Question 1) | `genericCode`, `brandCode`, `title`, `dosageForm`, `strength`, `sellPrice` | Milestone 2 authoritative question |

### 2.2 Recommended Resolved Item Schema

To ensure total coherence across all consumers (UI ambiguity drawer, draft store, and batch export engine), each item returned by `catalogResolver.searchCatalog(query)` must contain:

```typescript
interface CatalogCandidate {
  goodId: string;            // e.g. "g-1001" (unique catalog ID for Qanoon pricing & batch)
  genericCode: string;       // e.g. "00001" (FDA generic code, strictly string)
  brandCode: string;         // e.g. "00001" (Manufacturer brand code, strictly string)
  barcode: string | null;    // e.g. "6261001100011" (GS1 barcode)
  title: string;             // e.g. "Amoxicillin 500mg Capsule" (primary title)
  persianTitle: string;      // e.g. "آموکسی سیلین ۵۰۰ میلی گرم" (Persian title)
  dosageForm: string;        // e.g. "کپسول" (dosage form: قرص, کپسول, شربت, ویال, کرم)
  strength: string;          // e.g. "۵۰۰ میلی‌گرم" or "500 mg"
  sellPrice: number;         // e.g. 185000 (approved price in Rials)
  tempPrice: number;         // e.g. 179000 (interim price in Rials)
  nonPharma: boolean;        // e.g. false (excludes cosmetic items from technical fees)
  score: number;             // e.g. 0.95 (normalized relevance score between 0.0 and 1.0)
}
```

### 2.3 Rationale for Each Field
- `genericCode` & `brandCode`: Mandatory for Qanoon adapter stock checks (`adapter.checkStock({ genericCode, brandCode })`) and insurance formulary mapping.
- `goodId` & `sellPrice`: Mandatory for batch order export (`adapter.createBatchOrder({ items: [{ goodId, genericCode, quantity, price }] })`). Having these pre-resolved avoids secondary catalog lookups during batch export.
- `dosageForm` & `strength`: Clinical safety invariant. Prevents dangerous formulation confusion (e.g. Adult Cream vs Pediatric Syrup, or 500mg vs 250mg).
- `score`: Enables descending sorting so the top recommendations appear first in the UI ambiguity drawer and MCP responses.

---

## 3. Question 2: Bilingual Persian & English Text Search

### 3.1 Domain Challenges in Pharmacy Search
Pharmacists and prescription entry clerks enter medication queries in multiple formats:
- English brand/generic names (`Amoxicillin`, `Acetaminophen`, `Adult Cream`, `Syrup`)
- Persian drug names (`آموکسی سیلین`, `استامینوفن`, `کرم محافظ بزرگسال`, `شربت سرفه`)
- Colloquial aliases (`آموکسی`, `amox`, `سرفه`, `ویتامین دی`)
- Persian numerals (`۵۰۰`, `۳۲۵`, `۱۰۰۰`) vs ASCII numerals (`500`, `325`, `1000`)
- Mixed dosage expressions (`قرص استامینوفن ۳۲۵`, `amox 500 cap`)
- Missing items (e.g. `آلوپروستادیل` - Alprostadil, which must return `[]` gracefully without exceptions)

### 3.2 Orthographic & Character Normalization Engine

A naive `.includes()` check fails in Persian for standard queries:
- `"آموکسی سیلین ۵۰۰ میلی گرم".includes("آموکسی ۵۰۰")` evaluates to `false` because words are separated.
- `"۵۰۰ میلی‌گرم".includes("500")` evaluates to `false` due to Persian digits (`۰-۹`).
- `"كپسول".includes("کپسول")` evaluates to `false` due to Arabic vs Persian Kaf.

The proposed `normalizeSearchText(text)` pipeline applies:
1. **Diacritics Removal:** Strips Arabic/Persian vowels and tashkeel (`[\u064B-\u065F\u0670]`).
2. **ZWNJ Normalization:** Converts Zero-Width Non-Joiner (`\u200C`) and punctuation (`-`, `_`, `/`, `,`, `:`) to standard spaces.
3. **Persian & Arabic Letter Unification:**
   - Arabic Yeh `[ي ى ئ]` $\rightarrow$ Persian Yeh `ی`
   - Arabic Kaf `ك` $\rightarrow$ Persian Kaf `ک`
   - Hamza/Maddah Alefs `[آ أ إ]` $\rightarrow$ `ا`
   - Teh Marbuta `ة` $\rightarrow$ `ه`
   - Waw with Hamza `ؤ` $\rightarrow$ `و`
4. **Digit Unification:**
   - Persian digits `[۰-۹]` $\rightarrow$ ASCII `[0-9]`
   - Arabic digits `[٠-٩]` $\rightarrow$ ASCII `[0-9]`
5. **Whitespace Collapsing:** Collapses multiple consecutive spaces and trims.

### 3.3 Token-Based Multi-Field Scoring Algorithm

The matching algorithm evaluates candidate goods against the query using a 4-tier scoring hierarchy:

```
Tier 1: Exact Identifier Match (Score: 1.0)
        Query matches genericCode, brandCode, goodId, or barcode verbatim.

Tier 2: Exact Phrase Match (Score: 0.95)
        Normalized query matches title, persianTitle, or any alias verbatim.

Tier 3: Substring Match (Score: 0.90)
        Normalized query is a contiguous substring of title or persianTitle.

Tier 4: Token-Based Multi-Field Coverage (Score: 0.85 to 0.50)
        Splits query into tokens (e.g. ["amox", "500", "cap"]).
        Checks if each token matches (exact, prefix, or substring) across the
        combined corpus (title + persianTitle + dosageForm + strength + aliases).
        - If 100% of tokens match: Score = 0.85
        - If partial tokens match: Score = (matchedTokens / totalTokens) * 0.60
```

### 3.4 Runtime Verification Benchmark

Verified against `fixtures/qanoon-mock-data.json` in node runtime:

```
Query: "00001"          -> matches: 3 | [score: 1.00] g-1001 (Amoxicillin 500mg)
Query: "08234"          -> matches: 1 | [score: 1.00] g-1002 (Adult Protective Cream)
Query: "00025"          -> matches: 1 | [score: 1.00] g-1003 (Acetaminophen 325mg)
Query: "Amoxicillin"    -> matches: 2 | [score: 0.95] g-1001 (Amoxicillin 500mg)
Query: "آموکسی"         -> matches: 2 | [score: 0.95] g-1001 (Amoxicillin 500mg)
Query: "Adult Cream"    -> matches: 1 | [score: 0.85] g-1002 (Adult Protective Cream)
Query: "Syrup"          -> matches: 1 | [score: 0.90] g-1004 (Cough Syrup 120ml)
Query: "استامینوفن ۳۲۵" -> matches: 1 | [score: 0.90] g-1003 (Acetaminophen 325mg)
Query: "استامینوفن 325" -> matches: 1 | [score: 0.90] g-1003 (Acetaminophen 325mg)
Query: "شربت سرفه"      -> matches: 1 | [score: 0.90] g-1004 (Cough Syrup 120ml)
Query: "ویتامین دی"     -> matches: 1 | [score: 0.90] g-1005 (Vitamin D3 1000IU)
Query: "آلوپروستادیل"   -> matches: 0 | [] (Graceful empty result, no exceptions)
```

---

## 4. Question 3: Strict Leading-Zero String Preservation

### 4.1 Invariant Definition
Under Iranian pharmaceutical standards:
- Generic codes (e.g. `"00001"`, `"08234"`, `"00025"`, `"00115"`, `"00999"`) are FDA national formulary identifiers.
- Brand codes (e.g. `"00001"`, `"00020"`, `"00005"`) identify licensed manufacturers.

If coerced to numbers (e.g., `Number("00001") -> 1`), the codes lose leading zeroes, corrupting database lookups, foreign keys, and stock queries.

### 4.2 Protective Rules for Implementation
1. **Raw String Storage:** Store codes exclusively as string primitives:
   ```javascript
   export function normalizeCodeString(code) {
     if (code == null) return "";
     return String(code).trim();
   }
   ```
2. **Never Coerce:** Ban `Number()`, `+`, `parseInt()`, `parseFloat()`, or `Math.max()` on code values.
3. **Never Synthetically Pad:** Avoid `.padStart(5, '0')` because not all drug codes or IRC numbers are 5 characters.
4. **Zod Schema:** Enforce `z.string()` in all server endpoints and MCP tool definitions.
5. **Exact String Comparison:** Use `===` between normalized strings; never compare numeric values.

### 4.3 Existing Test Proof
In `test/e2e/tier2-boundary-corner.test.js` (lines 60-100, `T2_05`):
Codes `["00001", "08234", "00000", "00123"]` are tested across entry and resolution:
```javascript
assert.strictEqual(typeof resolvedItem.resolvedReference.genericCode, "string");
assert.strictEqual(resolvedItem.resolvedReference.genericCode, code);
assert.strictEqual(resolvedItem.resolvedReference.brandCode, code);
```
All existing tests currently pass (exit code 0).

---

## 5. Question 4: System Integration & Non-Blocking Workflow

### 5.1 Decoupled Operational Lifecycle

```
[ Pharmacist Input ]
        │
        ▼
1. Free-Text Entry (REST POST /api/draft/needs | MCP add_order_need)
   ├── Captures { name, quantity, unit, note }
   ├── DraftStore saves item with status: "needs_completion", resolvedReference: null
   └── ZERO catalog search required (rush hour friendly!)
        │
        ▼
2. Interactive Search (REST GET /api/catalog/search | MCP search_catalog)
   ├── Pharmacist opens #ambiguities drawer
   ├── CatalogResolver queries fixtures / goods with normalizeSearchText()
   ├── Optional: QanoonAdapter.checkStock() provides advisory stock badges
   └── Returns ranked candidates [{ genericCode: "00001", score: 0.95, ... }]
        │
        ▼
3. Ambiguity Resolution (REST POST /api/draft/needs/:id/resolve | MCP resolve_order_need)
   ├── Pharmacist selects candidate reference
   ├── DraftStore updates item: status -> "ready_for_review", stores resolvedReference
   └── Appends 'need_resolved' event
        │
        ▼
4. Full Auditability & Revert (REST POST /api/draft/revert | MCP revert_order_event)
   └── Compensating 'event_reverted' restores item to "needs_completion"
```

### 5.2 Server REST Endpoint Design
In `src/server.js`:
```javascript
// GET /api/catalog/search?q={query}&limit={limit}
if (request.method === "GET" && url.pathname === "/api/catalog/search") {
  const query = url.searchParams.get("q") ?? "";
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 20)));
  const results = await catalogResolver.searchCatalog(query, { limit });
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  return response.end(JSON.stringify({ results }));
}
```

### 5.3 MCP Tool Definition
In `src/server.js`:
```javascript
registerAppTool(
  server,
  "search_catalog",
  {
    title: "جستجوی کاتالوگ دارو",
    description: "جستجوی داروها در کاتالوگ با نام فارسی، انگلیسی، شکل، دوز یا کد ژنریک بدون مسدودسازی ثبت آزاد.",
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().positive().optional(),
    },
    _meta: { ui: { visibility: ["model", "app"] } },
  },
  async ({ query, limit = 20 }) => {
    const results = await catalogResolver.searchCatalog(query, { limit });
    return {
      content: [{ type: "text", text: `یافت شده: ${results.length} مورد` }],
      structuredContent: { results },
    };
  }
);
```

---

## 6. Proposed Implementation for `src/catalog-resolver.js`

Here is the complete reference implementation designed for `src/catalog-resolver.js`:

```javascript
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG_PATH = join(__dirname, "..", "fixtures", "qanoon-mock-data.json");

/**
 * Strictly preserves leading-zero code strings.
 */
export function normalizeCodeString(code) {
  if (code == null) return "";
  return String(code).trim();
}

/**
 * Normalizes Persian, Arabic, and English search strings:
 * - Unifies Arabic/Persian letter variants (ي/ی, ك/ک, آ/ا, ة/ه, ؤ/و)
 * - Converts Persian & Arabic numerals (۰-۹, ٠-٩) to ASCII 0-9
 * - Replaces ZWNJ (نیم‌فاصله) and punctuation with space
 * - Removes tashkeel/diacritics
 */
export function normalizeSearchText(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove tashkeel
    .replace(/\u200C/g, " ")               // ZWNJ to space
    .replace(/[يىئ]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[آأإ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776 + 48))
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
    .replace(/[-_/,.:;()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Computes a relevance score (0.0 - 1.0) for a good against a search query.
 */
export function calculateMatchScore(query, good) {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return 0;

  const rawQuery = String(query).trim();
  const genericCode = normalizeCodeString(good.genericCode);
  const brandCode = normalizeCodeString(good.brandCode);
  const goodId = String(good.goodId || good.id || "");
  const barcode = good.barcode ? String(good.barcode) : "";

  // 1. Exact code match (score 1.0)
  if (
    rawQuery === genericCode ||
    rawQuery === brandCode ||
    rawQuery === goodId ||
    rawQuery === barcode
  ) {
    return 1.0;
  }

  const normTitle = normalizeSearchText(good.title);
  const normPersian = normalizeSearchText(good.persianTitle);
  const normAliases = (Array.isArray(good.aliases) ? good.aliases : []).map(normalizeSearchText);
  const normDosage = normalizeSearchText(good.dosageForm || good.patientFormLabel);
  const normStrength = normalizeSearchText(good.strengthLabel || good.strength);

  // 2. Exact phrase match in title or aliases (score 0.95)
  if (normTitle === normQuery || normPersian === normQuery || normAliases.includes(normQuery)) {
    return 0.95;
  }

  // 3. Substring match in title or persianTitle (score 0.90)
  if (normTitle.includes(normQuery) || normPersian.includes(normQuery)) {
    return 0.90;
  }

  // 4. Token-based multi-field matching
  const queryTokens = normQuery.split(" ").filter(Boolean);
  const corpus = [
    normTitle,
    normPersian,
    normDosage,
    normStrength,
    ...normAliases,
    genericCode,
    brandCode,
  ].join(" ");
  const corpusTokens = corpus.split(" ").filter(Boolean);

  let matchCount = 0;
  for (const qt of queryTokens) {
    const found = corpusTokens.some(
      (ct) =>
        ct === qt ||
        (qt.length >= 3 && ct.startsWith(qt)) ||
        (ct.length >= 3 && ct.includes(qt))
    );
    if (found) matchCount++;
  }

  if (matchCount === queryTokens.length) {
    return 0.85;
  } else if (matchCount > 0) {
    return Math.round((matchCount / queryTokens.length) * 0.6 * 100) / 100;
  }

  return 0;
}

/**
 * CatalogResolver class managing catalog loading, caching, and searching.
 */
export class CatalogResolver {
  constructor(options = {}) {
    this.catalogPath = options.catalogPath ?? DEFAULT_CATALOG_PATH;
    this.inMemoryGoods = options.goods ?? null;
    this.adapter = options.adapter ?? null;
    this._loadedGoods = null;
  }

  async getGoods() {
    if (this.inMemoryGoods) return this.inMemoryGoods;
    if (this._loadedGoods) return this._loadedGoods;

    if (this.adapter && typeof this.adapter.getFixtures === "function") {
      const fixtures = await this.adapter.getFixtures();
      this._loadedGoods = Array.isArray(fixtures.goods) ? fixtures.goods : [];
      return this._loadedGoods;
    }

    try {
      const content = await readFile(this.catalogPath, "utf8");
      const parsed = JSON.parse(content);
      this._loadedGoods = Array.isArray(parsed.goods) ? parsed.goods : Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this._loadedGoods = [];
    }
    return this._loadedGoods;
  }

  /**
   * Search catalog with bilingual matching and leading-zero code preservation.
   */
  async searchCatalog(query, { limit = 20, minScore = 0.1 } = {}) {
    if (!query || typeof query !== "string") return [];
    const maxLimit = Math.max(1, Number(limit) || 20);
    const goods = await this.getGoods();

    const scored = goods
      .map((g) => {
        const score = calculateMatchScore(query, g);
        return { good: g, score };
      })
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (a.good.title || "").localeCompare(b.good.title || "");
      })
      .slice(0, maxLimit);

    return scored.map(({ good, score }) => ({
      goodId: String(good.id || good.goodId || ""),
      genericCode: normalizeCodeString(good.genericCode), // strictly string
      brandCode: normalizeCodeString(good.brandCode),     // strictly string
      barcode: good.barcode ? String(good.barcode) : null,
      title: good.title || "",
      persianTitle: good.persianTitle || good.title || "",
      dosageForm: good.dosageForm || good.patientFormLabel || "",
      strength: good.strengthLabel || good.strength || "",
      sellPrice: Number(good.sellPrice ?? 0),
      tempPrice: Number(good.tempPrice ?? 0),
      nonPharma: Boolean(good.nonPharma),
      score,
    }));
  }

  /**
   * Lookup good by exact generic and brand code.
   */
  async getGoodByCode(genericCode, brandCode) {
    const cleanGeneric = normalizeCodeString(genericCode);
    const cleanBrand = normalizeCodeString(brandCode);
    if (!cleanGeneric) return null;

    const goods = await this.getGoods();
    return (
      goods.find((g) => {
        const gGen = normalizeCodeString(g.genericCode);
        const gBrand = normalizeCodeString(g.brandCode);
        return gGen === cleanGeneric && (!cleanBrand || gBrand === cleanBrand);
      }) ?? null
    );
  }
}

/**
 * Factory for creating CatalogResolver instance.
 */
export function createCatalogResolver(options = {}) {
  return new CatalogResolver(options);
}

// Default singleton resolver for convenience
const defaultResolver = new CatalogResolver();

/**
 * Top-level convenience search function.
 */
export async function searchCatalog(query, options) {
  return defaultResolver.searchCatalog(query, options);
}
```

---

## 7. Recommended Test Specifications for `test/catalog-resolver.test.js`

The M2 implementation should include unit tests in `test/catalog-resolver.test.js`:

1. **Leading Zero Preservation:**
   - Query `"00001"` matches and returns `genericCode: "00001"` (typeof `"string"`).
   - Query `"08234"` matches and returns `genericCode: "08234"` (typeof `"string"`).
   - Query `"00025"` matches and returns `genericCode: "00025"` (typeof `"string"`).
2. **Bilingual Search:**
   - Query `"Amoxicillin"` matches `g-1001` with score $\ge 0.90$.
   - Query `"آموکسی"` matches `g-1001` with score $\ge 0.90$.
   - Query `"Adult Cream"` matches `g-1002` with score $\ge 0.85$.
   - Query `"Syrup"` matches `g-1004` with score $\ge 0.90$.
   - Query `"استامینوفن ۳۲۵"` matches `g-1003` (Persian numerals).
   - Query `"استامینوفن 325"` matches `g-1003` (ASCII numerals).
   - Query `"كپسول"` (Arabic kaf) matches `g-1001` and `g-1005`.
   - Query `"آلوپروستادیل"` returns `[]` without error.
3. **Empty & Boundary Input:**
   - Empty string `""`, `null`, `undefined`, whitespace `"   "` return `[]`.
   - Non-string query returns `[]`.
4. **Integration with QanoonAdapter:**
   - Resolver initialized with `adapter` correctly reads goods from `adapter.getFixtures()`.

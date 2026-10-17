# Milestone 2 Technical Analysis: Medicine Catalog Resolution Engine (`src/catalog-resolver.js`)

**Author:** `m2_explorer_2_gen2`  
**Date:** 2026-10-14  
**Integrity Mode:** Development  
**Target Component:** `src/catalog-resolver.js`  
**Related Components:** `src/server.js`, `src/draft-store.js`, `src/adapters/qanoon-adapter.js`, `public/order-desk.html`  
**Relevant Tests:** `test/e2e/test-helper.js`, `test/e2e/tier1-feature-coverage.test.js` (F8), `test/e2e/tier2-boundary-corner.test.js` (T2_05, T2_07), `test/e2e/tier3-cross-feature.test.js`, `test/e2e/tier4-real-world-scenarios.test.js`

---

## 1. Executive Summary

Milestone 2 requires implementing the operational layer of PanelPH, including the **Medicine Catalog Resolution Engine** (`src/catalog-resolver.js`). This engine enables pharmacists to match unstructured, free-text need entries against authoritative medicine catalogs (Qanoon, FDA, insurance registries) to resolve generic codes, brand codes, dosage forms, strengths, and standard titles.

Crucially, **free-text entry is never blocked or gated by catalog lookup** (R2.1, PRD). Instead, catalog resolution operates as an asynchronous, voluntary disambiguation tool that assists the pharmacist via the interactive ambiguity drawer and MCP tool calls.

This analysis details the architectural design for `src/catalog-resolver.js`, focusing on:
1. **Strict String Preservation of Leading Zeros**: Generic and brand codes like `"00001"`, `"08234"`, `"00025"`, `"00115"`, and `"00999"` must strictly remain strings across all stages (normalization, indexing, scoring, persistence, and REST/MCP serialization).
2. **Bilingual Persian/English Matching**: Resilient normalization handling Persian/Arabic digits (`۰-۹`), half-space (Zero-Width Non-Joiner `\u200c`), Arabic-to-Persian character unification (`ي/ی`, `ك/ک`), and diacritics removal.
3. **Scoring and Disambiguation Algorithm**: Multi-attribute ranking combining exact code match, exact title/alias match, prefix match, multi-token containment, dosage form/strength boosting, and substring scoring.
4. **Interface Contracts**: Clear exported APIs for `searchCatalog(query, options)` and `resolveItem(query, candidates, options)`, accompanied by a default reference catalog and custom catalog injection support.

---

## 2. Current State Assessment

### 2.1 File System Inspection
- `src/catalog-resolver.js`: **Currently absent** (does not exist yet).
- `test/e2e/test-helper.js` line 47-49 defines `isCatalogResolverAvailable()`, which probes the existence of `src/catalog-resolver.js`.
- `src/draft-store.js` line 145-151 contains `resolveNeed({ id, reference })`, which stores `resolvedReference: { title, genericCode, brandCode, dosageForm, strength }`.
- `src/server.js` line 96-113 exposes the MCP tool `resolve_order_need` with a Zod schema validating `genericCode` and `brandCode` as `z.string().optional()`.
- `src/adapters/qanoon-adapter.js` line 525-561 implements `searchGoods({ query, limit })` for Qanoon inventory, strictly preserving codes as strings via `normalizeCodeString`.

### 2.2 Existing Data Fixtures
1. `fixtures/catalog.sample.json`:
   - Contains minimal sample insurance/catalog items:
     - Item 1: `genericCode: "00001"`, `brandCode: "00001"`, `title: "نمونه آموزشی قرص"`, `dosageForm: "قرص"`, `strength: "۵۰۰ میلی‌گرم"`
     - Item 2: `genericCode: "14083"`, `brandCode: "14083"`, `title: "نمونه آموزشی ویال"`, `dosageForm: "ویال"`, `strength: "۱۰ میلی‌گرم / ۵ میلی‌لیتر"`
2. `fixtures/qanoon-mock-data.json`:
   - Contains 8 rich medicine items with `goodId`, `genericCode`, `brandCode`, `barcode`, `title`, `persianTitle`, `dosageForm`, `strength`, `sellPrice`, and `aliases`.
   - Examples of leading-zero codes: `"00001"`, `"08234"`, `"00025"`, `"04210"`, `"00115"`, `"00999"`.
3. `test/e2e/test-helper.js` (`SAMPLE_DRUGS`):
   - Defines 3 standard test drugs:
     - `SAMPLE_DRUGS[0]`: `"00001"` (قرص ۵۰۰ میلی‌گرم)
     - `SAMPLE_DRUGS[1]`: `"14083"` (ویال ۱۰ میلی‌گرم / ۵ میلی‌لیتر)
     - `SAMPLE_DRUGS[2]`: `"08234"` (شربت دیفن هیدرامین ۱۲.۵ میلی‌گرم / ۵ میلی‌لیتر)

---

## 3. Leading-Zero Preservation Invariant

### 3.1 The Vulnerability Vectors
In Iranian pharmaceutical information systems (Qanoon, TTAC, Salamat Insurance), drug codes are standard fixed-width string identifiers (typically 5 characters, e.g. `"00001"` for Amoxicillin, `"00025"` for Acetaminophen, `"08234"` for Diphenhydramine).

If converted to numeric values (`Number("00001") -> 1`), catastrophic errors occur:
- Insurance claim validation fails because code `"1"` is rejected by schemas expecting 5-character strings.
- Barcode scanners fail to cross-reference items.
- Multiple drugs whose codes differ only by leading zeroes collide.

In JavaScript and Node.js applications, leading zeroes are lost through five common hazards:
1. **Implicit or explicit numeric casting**: `parseInt(code, 10)`, `Number(code)`, or `+code`.
2. **Digit normalization through integer parsing**: e.g., converting Persian `"۰۰۰۰۱"` to `"00001"` by doing `parseInt(persianToLatin(str))` instead of pure string character mapping.
3. **Regex over-sanitization**: using `str.replace(/^0+/, "")`.
4. **Weak equality checks**: `code == 1` coercing `"00001"` to `1`.
5. **Schema coercion**: using `z.coerce.number()` or `z.coerce.string()` where an intermediate number step strips zeros.

### 3.2 String Preservation Invariant Implementation
The engine must enforce three strict rules:
1. **Never parse codes as numbers**: Always use `String(code).trim()`.
2. **Safe character-by-character digit transliteration**:
   ```javascript
   const PERSIAN_ARABIC_DIGIT_MAP = {
     "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
     "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
     "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
     "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"
   };

   export function normalizeDigits(str) {
     if (typeof str !== "string") return str == null ? "" : String(str);
     return str.replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_ARABIC_DIGIT_MAP[ch] || ch);
   }
   ```
   *Verification:*
   `normalizeDigits("۰۰۰۰۱")` yields `"00001"` (length 5, string type, zero truncation = 0).
   `normalizeDigits("۰۸۲۳۴")` yields `"08234"` (length 5, string type).
3. **Output Code Type Invariant**:
   All items emitted from `searchCatalog` and `resolveItem` must explicitly satisfy:
   `typeof item.genericCode === "string"` and `typeof item.brandCode === "string"`.

---

## 4. Bilingual Persian/English Text Normalization

Pharmacists enter medicine queries using varied conventions:
- Pure English names: `"Amoxicillin 500"`, `"Cough Syrup"`
- Pure Persian names: `"آموکسی سیلین"`, `"شربت سرفه"`
- Transliterated or colloquial names: `"آموکسی"`, `"آمپیسیلین"`
- Half-space (ZWNJ / نیم‌فاصله `\u200c`): `"میلی‌گرم"` vs `"میلی گرم"` vs `"میلیگرم"`
- Arabic character variations from third-party keyboards: Arabic Yeh (`ي` `\u064A`) vs Persian Yeh (`ی` `\u06CC`), Arabic Keheh (`ك` `\u0643`) vs Persian Keheh (`ک` `\u06A9`).
- Arabic diacritics / vowels (Tashdid, Tanwin, Fatha, Kasra, Damma).

### 4.1 Normalization Pipeline
```javascript
export function normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  let s = text.trim();
  // 1. Transliterate Persian/Arabic numerals to ASCII digits while preserving string length
  s = normalizeDigits(s);
  // 2. Unify Arabic characters to Persian standard
  s = s.replace(/ي/g, "ی")
       .replace(/ك/g, "ک")
       .replace(/ة/g, "ه")
       .replace(/ۀ/g, "ه");
  // 3. Remove Arabic diacritics (harakat)
  s = s.replace(/[\u064B-\u065F\u0670]/g, "");
  // 4. Convert ZWNJ (\u200c) to space to ensure consistent tokenization
  s = s.replace(/\u200c/g, " ");
  // 5. Normalize punctuation and collapse whitespace
  s = s.replace(/[\(\)\[\]\{\}\/\\,;:\-_+]/g, " ");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}
```

---

## 5. Candidate Ranking and Scoring Algorithm

The catalog resolver ranks candidates on a normalized `score` scale between `0.00` and `1.00`.

### 5.1 Scoring Hierarchy
1. **Tier 1: Exact Code Match (`score = 1.00` or `0.98`)**
   - If query digits match `genericCode` exactly (e.g., `"00001"` === `"00001"`): `score = 1.00`.
   - If query digits match `brandCode` exactly: `score = 0.98`.
   - If query matches `barcode` or `goodId`: `score = 1.00`.
   - If query digits are a code prefix: `score = 0.88`.

2. **Tier 2: Exact Name / Persian Title / Alias Match (`score = 0.95 - 0.99`)**
   - If `normQuery === normTitle` or `normQuery === normPersianTitle`: `score = 0.99`.
   - If `normAliases.includes(normQuery)`: `score = 0.97`.

3. **Tier 3: Prefix Match (`score = 0.90`)**
   - If `normTitle.startsWith(normQuery)` or `normPersianTitle.startsWith(normQuery)`: `score = 0.90`.

4. **Tier 4: Multi-Token Overlap with Attribute Boosting (`score = 0.40 - 0.92`)**
   - Split query into tokens: $T_Q = \{t_1, t_2, \dots, t_k\}$.
   - Target tokens $T_D$ include title, persianTitle, aliases, dosageForm, and strength.
   - Base overlap ratio: $R = |T_Q \cap T_D| / |T_Q|$.
   - **Dosage Form Boost**: If query explicitly mentions the candidate's dosage form (`"کپسول"`, `"قرص"`, `"شربت"`, `"ویال"`), add `+0.08`.
   - **Strength Boost**: If query explicitly mentions candidate's strength (`"500"`, `"325"`, `"120"`, `"10"`), add `+0.08`.
   - Combined token score = $\min(0.95, R \times 0.80 + \text{boosts})$.

5. **Tier 5: Substring Containment (`score = 0.30 - 0.75`)**
   - If `normTitle.includes(normQuery)` or `normPersianTitle.includes(normQuery)`:
     $S = 0.50 + 0.30 \times (\text{len}(normQuery) / \text{len}(normTitle))$.

6. **Tie-Breaking**:
   - Primary: Descending by `score`.
   - Secondary: Ascending alphabetical by `title`.
   - Tertiary: Ascending by `genericCode`.

---

## 6. Interface Contracts & API Design

### 6.1 `searchCatalog(query, options = {})`
```typescript
interface SearchOptions {
  catalog?: CatalogItem[];
  limit?: number;        // default: 20
  minScore?: number;     // default: 0.15
  dosageForm?: string;   // optional filter
}

interface CatalogResult {
  genericCode: string;   // e.g. "00001" (MUST preserve leading zeroes)
  brandCode: string;     // e.g. "00001" (MUST preserve leading zeroes)
  title: string;         // e.g. "Amoxicillin 500mg Capsule"
  persianTitle?: string; // e.g. "آموکسی سیلین ۵۰۰ میلی گرم"
  dosageForm: string;    // e.g. "کپسول"
  strength: string;      // e.g. "500 mg"
  goodId?: string;       // e.g. "g-1001"
  sellPrice?: number;    // e.g. 185000
  score: number;         // e.g. 0.95
}
```

### 6.2 `resolveItem(query, candidates = null, options = {})`
Resolves an unstructured pharmacist need entry, evaluating whether an unambiguous high-confidence reference exists or if pharmacist confirmation is required.

```typescript
interface ResolveOptions {
  catalog?: CatalogItem[];
  autoThreshold?: number;    // default: 0.85
  ambiguityMargin?: number;  // default: 0.15
}

interface ResolutionReport {
  resolved: boolean;         // true if high-confidence and unambiguous
  confidence: "high" | "medium" | "low" | "none";
  isAmbiguous: boolean;      // true if multiple close candidates exist
  bestMatch: CatalogResult | null;
  candidates: CatalogResult[];
  suggestedReference: {
    title: string;
    genericCode: string;
    brandCode: string;
    dosageForm: string;
    strength: string;
  } | null;
}
```

### 6.3 Ambiguity Detection Logic
- If `candidates.length === 0`: `confidence = "none"`, `isAmbiguous = false`, `resolved = false`.
- If `topCandidate.score >= 0.85`:
  - Check if `candidates[1]` exists and `topCandidate.score - candidates[1].score < 0.15` and `candidates[1].score >= 0.70`.
  - If YES: Multiple valid candidates exist (e.g. user typed `"آموکسی"` and both 500mg and 250mg exist). Mark `isAmbiguous = true`, `confidence = "medium"`, `resolved = false`. Pharmacist selection in drawer is required.
  - If NO: Single dominant match. Mark `isAmbiguous = false`, `confidence = "high"`, `resolved = true`.
- If `0.40 <= topCandidate.score < 0.85`:
  - `confidence = "medium"`, `isAmbiguous = true`, `resolved = false`.

---

## 7. Reference Data Strategy & Unified Built-In Dataset

To ensure 100% offline test suite execution and zero network dependencies, `src/catalog-resolver.js` should bundle a unified default catalog derived from existing project fixtures:

```javascript
export const DEFAULT_CATALOG_ITEMS = [
  // 1. Amoxicillin 500mg (F8, SAMPLE_DRUGS[0], g-1001)
  {
    goodId: "g-1001",
    genericCode: "00001",
    brandCode: "00001",
    barcode: "6261001100011",
    title: "Amoxicillin 500mg Capsule",
    persianTitle: "آموکسی سیلین ۵۰۰ میلی گرم",
    dosageForm: "کپسول",
    strength: "500 mg",
    sellPrice: 185000,
    aliases: ["آموکسی", "amoxicillin", "آمپیسیلین", "قرص ۵۰۰", "نمونه آموزشی قرص"],
  },
  // 2. Educational Sample Vial (SAMPLE_DRUGS[1], g-1007)
  {
    goodId: "g-1007",
    genericCode: "14083",
    brandCode: "14083",
    barcode: "6261001100073",
    title: "Educational Sample Vial",
    persianTitle: "نمونه آموزشی ویال",
    dosageForm: "ویال",
    strength: "10 mg / 5 ml",
    sellPrice: 95000,
    aliases: ["ویال", "sample vial", "نمونه آموزشی ویال"],
  },
  // 3. Diphenhydramine Syrup (SAMPLE_DRUGS[2], T2_05)
  {
    goodId: "g-1002-diphen",
    genericCode: "08234",
    brandCode: "08234",
    barcode: "6261001100028",
    title: "شربت دیفن هیدرامین",
    persianTitle: "شربت دیفن هیدرامین",
    dosageForm: "شربت",
    strength: "۱۲.۵ میلی‌گرم / ۵ میلی‌لیتر",
    sellPrice: 120000,
    aliases: ["شربت دیفن هیدرامین", "دیفن هیدرامین", "diphenhydramine", "شربت"],
  },
  // 4. Acetaminophen 325mg (g-1003)
  {
    goodId: "g-1003",
    genericCode: "00025",
    brandCode: "00005",
    barcode: "6261001100035",
    title: "Acetaminophen 325mg Tablet",
    persianTitle: "استامینوفن ۳۲۵ میلی‌گرم",
    dosageForm: "قرص",
    strength: "325 mg",
    sellPrice: 45000,
    aliases: ["استامینوفن", "acetaminophen", "paracetamol", "استامینوفن ۳۲۵"],
  },
  // 5. Cough Syrup 120ml (g-1004)
  {
    goodId: "g-1004",
    genericCode: "04210",
    brandCode: "00012",
    barcode: "6261001100042",
    title: "Cough Syrup 120ml",
    persianTitle: "شربت سرفه ۱۲۰ میلی‌لیتر",
    dosageForm: "شربت",
    strength: "120 ml",
    sellPrice: 110000,
    aliases: ["شربت", "cough syrup", "سرفه", "شربت سرفه"],
  },
  // 6. Vitamin D3 1000IU (g-1005)
  {
    goodId: "g-1005",
    genericCode: "00115",
    brandCode: "00001",
    barcode: "6261001100059",
    title: "Vitamin D3 1000IU Capsule",
    persianTitle: "ویتامین دی۳ ۱۰۰۰ واحد",
    dosageForm: "کپسول",
    strength: "1000 IU",
    sellPrice: 85000,
    aliases: ["ویتامین", "vitamin d", "دی۳"],
  },
  // 7. Out of Stock Item (g-1006)
  {
    goodId: "g-1006",
    genericCode: "00999",
    brandCode: "00099",
    barcode: "6261001100066",
    title: "Out of Stock Item",
    persianTitle: "داروی ناموجود در انبار",
    dosageForm: "ویال",
    strength: "1 g",
    sellPrice: 300000,
    aliases: ["ناموجود", "out of stock"],
  },
  // 8. Adult Protective Cream (g-1002 in mock data)
  {
    goodId: "g-1002",
    genericCode: "08234",
    brandCode: "00020",
    barcode: "6261001100028",
    title: "Adult Protective Cream",
    persianTitle: "کرم محافظ بزرگسال",
    dosageForm: "کرم",
    strength: "50 ml",
    sellPrice: 240000,
    aliases: ["کرم", "cream", "protective cream"],
  },
];
```

In addition, the module dynamically reads `fixtures/qanoon-mock-data.json` and `fixtures/catalog.sample.json` when present, merging items seamlessly and caching in memory.

---

## 8. Integration with Server & UI Layer

### 8.1 Operational REST Endpoint (`src/server.js`)
- Route: `GET /api/catalog/search?q=:query`
- Handler:
  ```javascript
  if (req.method === "GET" && url.pathname === "/api/catalog/search") {
    const query = url.searchParams.get("q") ?? "";
    const results = await searchCatalog(query);
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ results }));
  }
  ```

### 8.2 MCP Tool Expansion (`src/server.js`)
- Tool: `search_catalog`
  ```javascript
  registerAppTool(
    server,
    "search_catalog",
    {
      title: "جستجوی کاتالوگ دارو",
      description: "کاتالوگ اقلام دارویی را جستجو می‌کند و کدهای دارای صفر ابتدایی را متنی نگه می‌دارد.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().positive().optional(),
      },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async ({ query, limit }) => {
      const results = await searchCatalog(query, { limit });
      return {
        content: [{ type: "text", text: `تعداد ${results.length} مورد یافت شد.` }],
        structuredContent: { results },
      };
    }
  );
  ```

### 8.3 Pharmacist Ambiguity Drawer (`public/order-desk.html`)
- When a need is entered (status `needs_completion`), the frontend calls `GET /api/catalog/search?q=` with the `freeTextName`.
- The drawer displays the top candidates with their `dosageForm`, `strength`, `genericCode`, and `score`.
- Clicking "تأیید" sends `resolve_order_need` with the candidate's exact string codes, instantly resolving the item.

---

## 9. Recommended Test Specification (`test/catalog-resolver.test.js`)

M2 Worker should create `test/catalog-resolver.test.js` verifying the following 10 test cases:
1. **CR_01: String preservation of leading zeroes**: Verifies `genericCode: "00001"` remains string `"00001"` and `brandCode: "00001"` remains string `"00001"`. Assert `typeof === "string"` and `=== "00001"`.
2. **CR_02: String preservation for secondary zero-padded codes**: Verifies `"08234"`, `"00025"`, `"00115"`, `"00999"`.
3. **CR_03: Persian digit transliteration**: Searching for `"۰۰۰۰۱"` returns the item with genericCode `"00001"`.
4. **CR_04: Persian text normalization with ZWNJ**: Searching `"میلی‌گرم"` (with ZWNJ) matches items defined with `"میلی گرم"` (with space).
5. **CR_05: Arabic/Persian character equivalence**: Searching with Arabic Keheh (`ك`) and Yeh (`ي`) matches Persian records.
6. **CR_06: Multi-token attribute ranking**: Searching `"کپسول آموکسی سیلین ۵۰۰"` yields higher score than searching `"قرص ۵۰۰"`.
7. **CR_07: Alias resolution**: Searching `"آمپیسیلین"` or `"آموکسی"` resolves to Amoxicillin.
8. **CR_08: Custom catalog injection**: Verifying `searchCatalog(query, { catalog: customList })` queries only custom items.
9. **CR_09: Disambiguation evaluation in `resolveItem`**: When query is ambiguous (`"آموکسی"` with multiple strengths), `isAmbiguous: true` and `confidence: "medium"` are returned.
10. **CR_10: High-confidence resolution in `resolveItem`**: When query matches exact code `"00001"`, `resolved: true`, `confidence: "high"`, `isAmbiguous: false` are returned.

---

## 10. Implementation Recommendations for M2 Worker

1. **File Placement**: Create `src/catalog-resolver.js` using standard ESM (`export function searchCatalog`, `export function resolveItem`, `export class CatalogResolver`).
2. **Zero-Coercion Guarantee**: Avoid any `parseInt` or `Number()` on code fields. Use `String(code).trim()`.
3. **Dual Export**: Export both standalone functional APIs (`searchCatalog`, `resolveItem`) and class/factory (`CatalogResolver`, `createCatalogResolver`) for maximum test flexibility.
4. **Wire to Server**: Import `searchCatalog` in `src/server.js` and mount `GET /api/catalog/search` and `search_catalog` MCP tool.
5. **Add Unit Tests**: Write `test/catalog-resolver.test.js` to run alongside existing tests under `node --test`.

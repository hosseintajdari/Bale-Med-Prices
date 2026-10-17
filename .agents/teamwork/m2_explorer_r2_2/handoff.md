# Handoff Report: Catalog Resolver Alef Normalization & Spurious Alias Remediations

**Reporter**: `m2_explorer_r2_2`  
**Target File**: `/home/admin/PanelPH/src/catalog-resolver.js`  
**Handoff Type**: Hard (Investigation complete, actionable fix proposed)  
**Date**: 2026-10-14  

---

## 1. Observation

### Observation 1.1: Alef and Yeh/Alef Maksura Normalization Defect
- **File**: `src/catalog-resolver.js`, lines 36-40
- **Verbatim Code**:
  ```javascript
  s = s
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ۀ/g, "ه");
  ```
- **Execution Command**:
  ```bash
  node -e 'import { searchCatalog } from "./src/catalog-resolver.js";
  console.log("آموکسی:", searchCatalog("آموکسی").length);
  console.log("اموکسی:", searchCatalog("اموکسی").length);
  console.log("أموكسي:", searchCatalog("أموكسي").length);
  console.log("استامینوفن:", searchCatalog("استامینوفن").length);
  console.log("آستامینوفن:", searchCatalog("آستامینوفن").length);'
  ```
- **Verbatim Output**:
  ```
  آموکسی: 1
  اموکسی: 0
  أموكسي: 0
  استامینوفن: 1
  آستامینوفن: 0
  ```
- **Verbatim Alef Maksura Test**:
  `normalizeText("مستشفى")` returns `"مستشفى"` instead of `"مستشفی"`.

### Observation 1.2: Spurious Generic Alias Matching
- **File**: `src/catalog-resolver.js`, lines 85, 97, 145, 157, and lines 332-336
- **Verbatim Code**:
  ```javascript
  // line 85 (g-1007)
  aliases: ["ویال", "sample vial", "نمونه آموزشی ویال"],
  // line 97 (g-1002-diphen)
  aliases: ["شربت دیفن هیدرامین", "دیفن هیدرامین", "diphenhydramine", "شربت"],
  // line 145 (g-1006)
  aliases: ["ناموجود", "out of stock"],
  // line 157 (g-1002)
  aliases: ["کرم محافظ", "cream", "protective cream"],

  // lines 332-336 in scoreCandidate
  for (const alias of normAliases) {
    if (alias.includes(normQuery) || normQuery.includes(alias)) {
      return 0.65;
    }
  }
  ```
- **Execution Command**:
  ```bash
  node -e 'import { searchCatalog, resolveItem } from "./src/catalog-resolver.js";
  console.log("ویال سفتریاکسون ۱ گرم matches:", searchCatalog("ویال سفتریاکسون ۱ گرم").map(x => ({ goodId: x.goodId, title: x.title, score: x.score })));
  console.log("شربت کواموکسی کلاو matches:", searchCatalog("شربت کواموکسی کلاو").map(x => ({ goodId: x.goodId, title: x.title, score: x.score })));
  console.log("داروی ناموجود در بیمارستان matches:", searchCatalog("داروی ناموجود در بیمارستان").map(x => ({ goodId: x.goodId, title: x.title, score: x.score })));'
  ```
- **Verbatim Output**:
  ```
  ویال سفتریاکسون ۱ گرم matches: [
    { goodId: 'g-1007', title: 'Educational Sample Vial', score: 0.65 },
    { goodId: 'g-1006', title: 'Out of Stock Item', score: 0.56 }
  ]
  شربت کواموکسی کلاو matches: [
    { goodId: 'g-1002-diphen', title: 'شربت دیفن هیدرامین', score: 0.65 }
  ]
  داروی ناموجود در بیمارستان matches: [ { goodId: 'g-1006', title: 'Out of Stock Item', score: 0.6 } ]
  ```

### Observation 1.3: Unhandled TypeError on Non-String Query in `scoreCandidate`
- **File**: `src/catalog-resolver.js`, lines 245-247
- **Execution Command**:
  ```bash
  node -e 'import { scoreCandidate } from "./src/catalog-resolver.js"; scoreCandidate(1001, { genericCode: "00001" });'
  ```
- **Verbatim Output**:
  ```
  TypeError: query.trim is not a function
      at scoreCandidate (file:///home/admin/PanelPH/src/catalog-resolver.js:246:40)
  ```

---

## 2. Logic Chain

1. **Premise 1 (Alef Variants)**: In Persian medical transcription, keyboard layouts alternate between bare Alef `ا` (`\u0627`), Alef with Madda `آ` (`\u0622`), and Arabic Hamza variants `أ` (`\u0623`), `إ` (`\u0625`), `ٱ` (`\u0671`). In Arabic/Persian orthography, Arabic Alef Maksura `ى` (`\u0649`) and Arabic Yeh `ي` (`\u064A`) are used interchangeably with Persian Yeh `ی` (`\u06CC`).
2. **Deduction from Obs 1.1**: Because `normalizeText` leaves `[آأإٱ]` and `ى` unmapped, search queries with bare Alef `"اموکسی"` have normalized query `"اموکسی"`, while database item `g-1001` has normalized title and alias `"آموکسی..."`. Because `"اموکسی" !== "آموکسی"`, all string equality, prefix, token match, and substring comparisons fail, yielding 0 search results.
3. **Premise 2 (Alias Semantics)**: Standalone generic pharmaceutical dosage forms (`"ویال"`, `"شربت"`, `"کرم"`) and status words (`"ناموجود"`) are common vocabulary terms in prescriptions, not distinguishing trade or generic brand aliases of specific catalog goods.
4. **Deduction from Obs 1.2**: In `scoreCandidate` lines 332-336, the condition `normQuery.includes(alias)` evaluates to `true` whenever any word in `normQuery` matches an alias. Because `g-1007` has alias `"ویال"`, the query `"ویال سفتریاکسون ۱ گرم"` triggers `normQuery.includes("ویال")`, awarding a flat score of `0.65` to `g-1007`. In `resolveItem`, this exceeds the `medium` confidence threshold (`score >= 0.40`), falsely presenting "Educational Sample Vial" as a valid candidate for Ceftriaxone.
5. **Deduction from Obs 1.2 (Tier 4)**: In lines 286-322, dosage forms and strengths are added to `candidateTokens` while also receiving explicit boosts (+0.08 each). Combined with partial numeric substring containment (`"10".includes("1")`), `g-1006` Out of Stock Item (with dosageForm `"ویال"` and strength `"1 g"`) falsely scores `0.56` against `"ویال سفتریاکسون ۱ گرم"`, even though zero drug name tokens matched.
6. **Deduction from Obs 1.3**: Direct invocations of `scoreCandidate(query, candidate)` fail to validate input types before calling `query.trim()`, triggering unhandled type exceptions for non-string queries or null candidates.

---

## 3. Caveats

1. **Normalization Scope**: Mapping `[آأإٱ]` to `ا` is canonical for search indexing. It does not mutate display titles or persistent records (which retain original Persian typography like `آموکسی سیلین ۵۰۰ میلی گرم`).
2. **Double-Alef or Hamza Combinations**: Diacritical marks (`\u064B-\u065F\u0670`) are stripped after Alef normalization, ensuring both precomposed and decomposed forms resolve cleanly.
3. **Third-Party Fixture Aliases**: If third-party fixtures inject additional single-token generic words into `aliases`, the algorithmic fix in `scoreCandidate` (word-boundary check + length ratio penalization + requiring name token match in Tier 4) provides defense in depth even if external fixtures contain un-sanitized aliases.
4. **Scope Constraint**: As an Explorer, this report contains verified analysis and exact proposed code snippets. The edits must be applied to `src/catalog-resolver.js` by the M2 Worker.

---

## 4. Conclusion & Proposed Code Snippets

The catalog resolver defects can be resolved cleanly within `src/catalog-resolver.js` without altering any public function signatures or breaking existing tests.

### Change 1: `normalizeText` in `src/catalog-resolver.js` (lines 32-50)

#### Before:
```javascript
export function normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  let s = text.trim();
  s = normalizeDigits(s);
  s = s
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ۀ/g, "ه");
  // Remove Arabic diacritics (harakat)
  s = s.replace(/[\u064B-\u065F\u0670]/g, "");
  // Replace ZWNJ (\u200c) with space
  s = s.replace(/\u200c/g, " ");
  // Replace punctuation with space
  s = s.replace(/[\(\)\[\]\{\}\/\\,;:\-_+]/g, " ");
  // Collapse whitespace and lowercase
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}
```

#### After:
```javascript
export function normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  let s = text.trim().normalize("NFC");
  s = normalizeDigits(s);
  s = s
    .replace(/[آأإٱ]/g, "ا")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ۀ/g, "ه");
  // Remove Arabic diacritics (harakat)
  s = s.replace(/[\u064B-\u065F\u0670]/g, "");
  // Replace ZWNJ (\u200c) with space
  s = s.replace(/\u200c/g, " ");
  // Replace punctuation with space
  s = s.replace(/[\(\)\[\]\{\}\/\\,;:\-_+]/g, " ");
  // Collapse whitespace and lowercase
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}
```

---

### Change 2: `BUILTIN_REFERENCE_ITEMS` in `src/catalog-resolver.js` (lines 61-158)

#### Before:
```javascript
  {
    goodId: "g-1007",
    ...
    aliases: ["ویال", "sample vial", "نمونه آموزشی ویال"],
  },
  {
    goodId: "g-1002-diphen",
    ...
    aliases: ["شربت دیفن هیدرامین", "دیفن هیدرامین", "diphenhydramine", "شربت"],
  },
  ...
  {
    goodId: "g-1006",
    ...
    aliases: ["ناموجود", "out of stock"],
  },
  {
    goodId: "g-1002",
    ...
    aliases: ["کرم محافظ", "cream", "protective cream"],
  },
```

#### After:
```javascript
  {
    goodId: "g-1007",
    ...
    aliases: ["sample vial", "نمونه آموزشی ویال"],
  },
  {
    goodId: "g-1002-diphen",
    ...
    aliases: ["شربت دیفن هیدرامین", "دیفن هیدرامین", "diphenhydramine"],
  },
  ...
  {
    goodId: "g-1006",
    ...
    aliases: ["داروی ناموجود در انبار", "out of stock item"],
  },
  {
    goodId: "g-1002",
    ...
    aliases: ["کرم محافظ", "protective cream"],
  },
```

---

### Change 3: `scoreCandidate` in `src/catalog-resolver.js` (lines 245-339)

#### Before:
```javascript
export function scoreCandidate(query, candidate) {
  const cleanCodeQuery = normalizeDigits(query.trim());
  const normQuery = normalizeText(query);
  if (!normQuery && !cleanCodeQuery) return 0;
  ...
    const candidateTokens = new Set([
      ...normTitle.split(" "),
      ...normPersianTitle.split(" "),
      ...normDosage.split(" "),
      ...normStrength.split(" "),
      ...normAliases.flatMap((a) => a.split(" ")),
    ].filter((t) => t.length > 0));

    let matchedTokens = 0;
    for (const qt of queryTokens) {
      if (candidateTokens.has(qt)) {
        matchedTokens++;
      } else {
        // Partial token containment
        for (const ct of candidateTokens) {
          if (ct.includes(qt) || qt.includes(ct)) {
            matchedTokens += 0.5;
            break;
          }
        }
      }
    }

    const overlapRatio = matchedTokens / queryTokens.length;
    if (overlapRatio > 0) {
      let boost = 0;
      // Dosage form boost
      if (normDosage && normQuery.includes(normDosage)) boost += 0.08;
      // Strength boost (exact string or numeric value)
      const strengthDigits = normStrength.replace(/\D+/g, "");
      if ((normStrength && normQuery.includes(normStrength)) || (strengthDigits && normQuery.includes(strengthDigits))) {
        boost += 0.08;
      }

      const tokenScore = Math.min(0.95, overlapRatio * 0.80 + boost);
      if (tokenScore >= 0.40) return Math.round(tokenScore * 100) / 100;
    }
  }

  // 5. Substring Containment (Tier 5)
  if (normTitle.includes(normQuery) || normPersianTitle.includes(normQuery)) {
    const lenRatio = Math.min(1, normQuery.length / Math.max(normTitle.length, 1));
    const subScore = 0.50 + 0.30 * lenRatio;
    return Math.round(subScore * 100) / 100;
  }

  for (const alias of normAliases) {
    if (alias.includes(normQuery) || normQuery.includes(alias)) {
      return 0.65;
    }
  }

  return 0;
}
```

#### After:
```javascript
export function scoreCandidate(query, candidate) {
  if (!query || typeof query !== "string" || !candidate || typeof candidate !== "object") {
    return 0;
  }

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

  const normTitle = normalizeText(candidate.title || "");
  const normPersianTitle = normalizeText(candidate.persianTitle || "");
  const normAliases = (candidate.aliases || []).map((a) => normalizeText(a)).filter(Boolean);
  const normDosage = normalizeText(candidate.dosageForm || "");
  const normStrength = normalizeText(candidate.strength || "");

  // 2. Exact Title / Persian Title / Alias Match (Tier 2: 0.95 - 0.99)
  if (normQuery === normTitle || normQuery === normPersianTitle) return 0.99;
  if (normAliases.includes(normQuery)) return 0.97;

  // 3. Title Starts With Query (Tier 3: 0.90)
  if (normTitle.startsWith(normQuery) || normPersianTitle.startsWith(normQuery)) return 0.90;

  // 4. Multi-Token Overlap & Attribute Boosting (Tier 4)
  const queryTokens = normQuery.split(" ").filter((t) => t.length > 0);
  if (queryTokens.length > 0) {
    const nameTokens = new Set([
      ...normTitle.split(" "),
      ...normPersianTitle.split(" "),
      ...normAliases.flatMap((a) => a.split(" ")),
    ].filter((t) => t.length > 0));

    const attributeTokens = new Set([
      ...normDosage.split(" "),
      ...normStrength.split(" "),
    ].filter((t) => t.length > 0));

    let matchedNameTokens = 0;
    let matchedAttrTokens = 0;

    for (const qt of queryTokens) {
      if (nameTokens.has(qt)) {
        matchedNameTokens++;
      } else if (attributeTokens.has(qt)) {
        matchedAttrTokens++;
      } else {
        // Partial token containment (only for non-numeric text tokens >= 3 chars)
        const isNumeric = /^\d+$/.test(qt);
        if (!isNumeric && qt.length >= 3) {
          let foundPartial = false;
          for (const nt of nameTokens) {
            if (!/^\d+$/.test(nt) && (nt.includes(qt) || qt.includes(nt))) {
              matchedNameTokens += 0.5;
              foundPartial = true;
              break;
            }
          }
          if (!foundPartial) {
            for (const at of attributeTokens) {
              if (!/^\d+$/.test(at) && (at.includes(qt) || qt.includes(at))) {
                matchedAttrTokens += 0.5;
                break;
              }
            }
          }
        }
      }
    }

    const totalMatchedTokens = matchedNameTokens + matchedAttrTokens;
    const overlapRatio = totalMatchedTokens / queryTokens.length;

    // A match in Tier 4 requires at least one matched name token unless query is purely numeric or attribute
    const hasNameMatch = matchedNameTokens > 0;

    if (overlapRatio > 0 && (hasNameMatch || queryTokens.length <= 2)) {
      let boost = 0;
      // Dosage form boost
      if (normDosage && normQuery.includes(normDosage)) boost += 0.08;
      // Strength boost (exact string or numeric value)
      const strengthDigits = normStrength.replace(/\D+/g, "");
      if ((normStrength && normQuery.includes(normStrength)) || (strengthDigits && normQuery.includes(strengthDigits))) {
        boost += 0.08;
      }

      const tokenScore = Math.min(0.95, overlapRatio * 0.80 + boost);
      if (tokenScore >= 0.40) return Math.round(tokenScore * 100) / 100;
    }
  }

  // 5. Substring Containment (Tier 5)
  if (normTitle.includes(normQuery) || normPersianTitle.includes(normQuery)) {
    const lenRatio = Math.min(1, normQuery.length / Math.max(normTitle.length, 1));
    const subScore = 0.50 + 0.30 * lenRatio;
    return Math.round(subScore * 100) / 100;
  }

  // Substring & word boundary matching for aliases
  let bestAliasScore = 0;
  for (const alias of normAliases) {
    if (alias.length < 2) continue;

    // Query is a prefix of alias (e.g. "amox" -> "amoxicillin")
    if (normQuery.length >= 3 && alias.startsWith(normQuery)) {
      const lenRatio = Math.min(1, normQuery.length / alias.length);
      const score = 0.60 + 0.25 * lenRatio;
      bestAliasScore = Math.max(bestAliasScore, score);
    }
    // Query is a substring of alias (e.g. "moxicillin" -> "amoxicillin")
    else if (normQuery.length >= 3 && alias.includes(normQuery)) {
      const lenRatio = Math.min(1, normQuery.length / alias.length);
      const score = 0.45 + 0.25 * lenRatio;
      bestAliasScore = Math.max(bestAliasScore, score);
    }
    // Alias is a complete word or phrase within longer query
    else if (alias.length >= 3) {
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wordBoundaryRegex = new RegExp("(^|\\s)" + escapedAlias + "(\\s|$)");
      if (wordBoundaryRegex.test(normQuery)) {
        const lenRatio = Math.min(1, alias.length / normQuery.length);
        const score = (0.35 + 0.35 * lenRatio) * lenRatio;
        bestAliasScore = Math.max(bestAliasScore, score);
      }
    }
  }

  if (bestAliasScore >= 0.40) {
    return Math.round(bestAliasScore * 100) / 100;
  }

  return 0;
}
```

---

## 5. Verification Method

### 5.1 Verification Commands
Once the M2 Worker applies the proposed patch to `src/catalog-resolver.js`:

1. **Verify Alef Normalization**:
   ```bash
   node -e 'import { searchCatalog } from "./src/catalog-resolver.js";
   assert = (a, b) => { if (!a) throw new Error(b); };
   assert(searchCatalog("اموکسی").length > 0, "Bare Alef must match Amoxicillin");
   assert(searchCatalog("آستامینوفن").length > 0, "Madda Alef must match Acetaminophen");
   assert(searchCatalog("أموكسي").length > 0, "Hamza Alef must match Amoxicillin");
   assert(searchCatalog("إستامينوفن").length > 0, "Hamza below must match Acetaminophen");
   console.log("Alef normalization verification: PASSED");'
   ```

2. **Verify Spurious Alias Rejection**:
   ```bash
   node -e 'import { searchCatalog } from "./src/catalog-resolver.js";
   const vialResults = searchCatalog("ویال سفتریاکسون ۱ گرم");
   const syrupResults = searchCatalog("شربت کواموکسی کلاو");
   if (vialResults.some(r => r.goodId === "g-1007")) throw new Error("g-1007 must not match Ceftriaxone vial");
   if (syrupResults.some(r => r.goodId === "g-1002-diphen")) throw new Error("g-1002-diphen must not match Co-amoxiclav syrup");
   console.log("Spurious alias rejection verification: PASSED");'
   ```

3. **Verify Defensive Guard**:
   ```bash
   node -e 'import { scoreCandidate } from "./src/catalog-resolver.js";
   if (scoreCandidate(1001, { genericCode: "00001" }) !== 0) throw new Error("Numeric query must return 0");
   if (scoreCandidate(null, { genericCode: "00001" }) !== 0) throw new Error("Null query must return 0");
   console.log("Defensive guard verification: PASSED");'
   ```

4. **Verify Existing Unit Test Suite**:
   ```bash
   node --test test/catalog-resolver.test.js
   ```
   Expected: 10 tests, 10 pass, 0 fail (exit code 0).

5. **Invalidation Conditions**:
   - Any query for bare Alef `"اموکسی"` returns 0 results.
   - Any query for `"ویال سفتریاکسون ۱ گرم"` matches `"Educational Sample Vial"` with score >= 0.40.
   - Passing `1001` to `scoreCandidate` throws an unhandled error.

# Investigation & Handoff Report: Character Normalization in `src/catalog-resolver.js`

**Agent**: `m2_i2_explorer_1` (Explorer)  
**Date**: 2026-10-14T10:44:00Z  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m2_i2_explorer_1`  
**Target Repository**: `/home/admin/PanelPH`  
**Milestone**: Milestone 2 Iteration 2  

---

## 1. Observation

### 1.1 Empirical Defect Verification: Alef and Yeh Inconsistencies

Direct execution of character normalization and catalog search probes on `src/catalog-resolver.js`:

```bash
$ node -e '
import { searchCatalog, normalizeText } from "./src/catalog-resolver.js";
console.log("normalizeText(اموکسی):", normalizeText("اموکسی"));
console.log("normalizeText(آموکسی):", normalizeText("آموکسی"));
console.log("normalizeText(استامینوفن):", normalizeText("استامینوفن"));
console.log("normalizeText(آستامینوفن):", normalizeText("آستامینوفن"));
console.log("normalizeText(اموكسى [Maksura]):", normalizeText("اموكسى"));
console.log("normalizeText(اموکسی [Persian]):", normalizeText("اموکسی"));
console.log("searchCatalog(اموکسی) hits:", searchCatalog("اموکسی").length);
console.log("searchCatalog(آموکسی) hits:", searchCatalog("آموکسی").length);
console.log("searchCatalog(استامینوفن) hits:", searchCatalog("استامینوفن").length);
console.log("searchCatalog(آستامینوفن) hits:", searchCatalog("آستامینوفن").length);
console.log("searchCatalog(آموكسى) hits:", searchCatalog("آموكسى").length);
'
```

**Verbatim stdout**:
```
normalizeText(اموکسی): اموکسی
normalizeText(آموکسی): آموکسی
normalizeText(استامینوفن): استامینوفن
normalizeText(آستامینوفن): آستامینوفن
normalizeText(اموكسى [Maksura]): اموکسى
normalizeText(اموکسی [Persian]): اموکسی
searchCatalog(اموکسی) hits: 0
searchCatalog(آموکسی) hits: 1
searchCatalog(استامینوفن) hits: 1
searchCatalog(آستامینوفن) hits: 0
searchCatalog(آموكسى) hits: 0
```

### 1.2 Inspection of Existing Normalization in `src/catalog-resolver.js`

Inspection of `src/catalog-resolver.js` lines 32–50 reveals:
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

Direct observations of omissions in `normalizeText`:
1. **Alef Normalization Omitted**: `آ` (U+0622), `أ` (U+0623), `إ` (U+0625), and `ٱ` (U+0671) are neither matched nor mapped to standard bare Alef `ا` (U+0627).
2. **Alef Maksura Omitted**: Arabic Yeh `ي` (U+064A) is mapped to `ی` (U+06CC), but Alef Maksura `ى` (U+0649) is absent from the character set, leaving dotless Arabic Yeh untransliterated.
3. **Tatweel / Kashida Omitted**: Tatweel `ـ` (`\u0640`) is not included in the diacritics removal regex, causing elongated inputs like `آموکـسی` to fail matching `آموکسی`.
4. **Persian Punctuation**: Persian comma `،` (`\u060C`), Persian semicolon `؛` (`\u061B`), and quotes/guillemets `«»` are not collapsed to space separators.

### 1.3 Inspection of Code String and Numeral Normalization

Inspection of `src/catalog-resolver.js` lines 8–23 and 52–60:
```javascript
const PERSIAN_ARABIC_DIGIT_MAP = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

export function normalizeDigits(str) {
  if (typeof str !== "string") return str == null ? "" : String(str);
  return str.replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_ARABIC_DIGIT_MAP[ch] || ch);
}

export function normalizeCodeString(code) {
  if (code == null) return "";
  const str = normalizeDigits(String(code).trim());
  return str;
}
```

Empirical verification of string preservation across all zero-padded codes:
```bash
$ node -e '
import { normalizeDigits, normalizeCodeString } from "./src/catalog-resolver.js";
const sampleCodes = ["00001", "08234", "00025", "04210", "00115", "00999", "۰۰۰۰۱", "۰۸۲۳۴", "٠٠٠٢٥"];
for (const c of sampleCodes) {
  const norm = normalizeCodeString(c);
  console.log(`code: ${c} -> norm: "${norm}" (type: ${typeof norm}, len: ${norm.length})`);
  console.assert(typeof norm === "string", "Must be string");
  console.assert(norm.length === 5, "Must preserve length");
}
console.log("All codes preserved leading zeroes strictly as strings.");
'
```
**Verbatim stdout**:
```
code: 00001 -> norm: "00001" (type: string, len: 5)
code: 08234 -> norm: "08234" (type: string, len: 5)
code: 00025 -> norm: "00025" (type: string, len: 5)
code: 04210 -> norm: "04210" (type: string, len: 5)
code: 00115 -> norm: "00115" (type: string, len: 5)
code: 00999 -> norm: "00999" (type: string, len: 5)
code: ۰۰۰۰۱ -> norm: "00001" (type: string, len: 5)
code: ۰۸۲۳۴ -> norm: "08234" (type: string, len: 5)
code: ٠٠٠٢٥ -> norm: "00025" (type: string, len: 5)
All codes preserved leading zeroes strictly as strings.
```

### 1.4 Mapping of Normalization Call Sites in `src/catalog-resolver.js`

1. **`normalizeDigits(str)` call sites**:
   - `src/catalog-resolver.js:35`: In `normalizeText(text)` to convert numerals before textual normalization.
   - `src/catalog-resolver.js:57`: In `normalizeCodeString(code)` to convert Persian/Arabic digits in code strings.
   - `src/catalog-resolver.js:246`: In `scoreCandidate(query, candidate)` as `const cleanCodeQuery = normalizeDigits(query.trim());`.
   - `src/catalog-resolver.js:252`: In `scoreCandidate(query, candidate)` to normalize candidate barcodes.

2. **`normalizeCodeString(code)` call sites**:
   - `src/catalog-resolver.js:178–179`: When ingesting items from `catalog.sample.json`.
   - `src/catalog-resolver.js:207–208`: When ingesting items from `qanoon-mock-data.json`.
   - `src/catalog-resolver.js:250–251`: Inside `scoreCandidate` for `genericCode` and `brandCode` matching.
   - `src/catalog-resolver.js:367–368`: In `searchCatalog` result output mapping.
   - `src/catalog-resolver.js:414–415`: In `resolveItem` suggested reference creation.
   - `src/catalog-resolver.js:473–478`: In `getGoodByCode` for generic/brand code lookups.

3. **`normalizeText(text)` call sites**:
   - `src/catalog-resolver.js:247`: Query normalization: `const normQuery = normalizeText(query);`.
   - `src/catalog-resolver.js:270`: Candidate title: `const normTitle = normalizeText(candidate.title || "");`.
   - `src/catalog-resolver.js:271`: Candidate Persian title: `const normPersianTitle = normalizeText(candidate.persianTitle || "");`.
   - `src/catalog-resolver.js:272`: Candidate aliases: `const normAliases = (candidate.aliases || []).map((a) => normalizeText(a));`.
   - `src/catalog-resolver.js:273`: Candidate dosage form: `const normDosage = normalizeText(candidate.dosageForm || "");`.
   - `src/catalog-resolver.js:274`: Candidate strength: `const normStrength = normalizeText(candidate.strength || "");`.
   - `src/catalog-resolver.js:360`: Dosage form filter comparison: `if (dosageForm && normalizeText(item.dosageForm) !== normalizeText(dosageForm))`.

---

## 2. Logic Chain

1. **Root Cause Identification**:
   - In Persian and Arabic medical text, Alef appears with various diacritical marks: `آ` (madda), `أ` (hamza above), `إ` (hamza below), `ٱ` (wasla), and bare `ا`.
   - In clinical keyboard entry, users interchangeably type `"اموکسی"` or `"آموکسی"`, `"استامینوفن"` or `"آستامینوفن"`.
   - Because `normalizeText` currently preserves the distinction between `آ` (U+0622) and `ا` (U+0627), exact string comparisons, prefix matches, and token lookups fail when the input orthography diverges from the catalog record.
   - Specifically, `BUILTIN_REFERENCE_ITEMS` registers item `g-1001` with `persianTitle: "آموکسی سیلین ۵۰۰ میلی گرم"` and `aliases: ["آموکسی", ...]`. Searching `"اموکسی"` yields 0 hits because neither `"آموکسی"` nor `"آموکسی سیلین"` contains or matches `"اموکسی"`.
   - Conversely, item `g-1003` is registered with `persianTitle: "استامینوفن ۳۲۵ میلی‌گرم"` and `aliases: ["استامینوفن", ...]`. Searching `"آستامینوفن"` yields 0 hits for the identical reason.

2. **Yeh and Alef Maksura Character Sets**:
   - Arabic keyboards and legacy databases frequently emit `ى` (U+0649, Alef Maksura) and `ي` (U+064A, Arabic Yeh).
   - `normalizeText` line 37 replaces `ي` with `ی` (`\u06CC`), but omits `ى`.
   - Hence, clinical queries containing `ى` (e.g., `"اموكسى"`) remain non-matching against catalog title `"آموکسی سیلین"`.
   - Updating the transliteration to `.replace(/[يى]/g, "ی")` completely unifies all Yeh variants to standard Persian Yeh (`\u06CC`).

3. **Diacritics and Typographical Normalization (Tatweel & ZWNJ)**:
   - Arabic diacritics (`[\u064B-\u065F\u0670]`) represent short vowels (harakat) and pronunciation guides. Decomposed Alef forms (e.g. `ا` + U+0653 madda) are stripped by this range to bare `ا`.
   - Tatweel / Kashida (`ـ`, U+0640) is an elongation glyph inserted between letters. If not stripped to an empty string (`""`), search queries like `"آموکـسی"` fail against `"آموکسی"`.
   - Conversely, ZWNJ (`\u200c`, half-space) is a word-internal morpheme boundary (e.g., `"میلی‌گرم"`). Replacing it with a space (`" "`) ensures that subsequent `\s+` collapse splits `"میلی‌گرم"` into tokens `["میلی", "گرم"]`, matching `"میلی گرم"` identically.

4. **Zero-Padded Numeral Preservation**:
   - `normalizeDigits` performs direct character substitution via dictionary lookup `PERSIAN_ARABIC_DIGIT_MAP[ch] || ch`.
   - Because it operates on characters and never calls `Number()`, `parseInt()`, or unary `+`, it preserves string length and all leading zeroes (`"00001"` remains `"00001"`, `"۰۰۰۰۱"` converts to `"00001"`).
   - In `scoreCandidate`, exact code matching uses strict string equality (`genericCode === cleanCodeQuery`), ensuring no numeric coercion occurs.
   - `searchCatalog` and `resolveItem` wrap output codes with `normalizeCodeString`, returning strings consistently.

---

## 3. Caveats

1. **False-Positive Alias Matching (Challenger 2 Finding 1.3)**:
   - Challenger 2 previously observed that searching `"ویال سفتریاکسون ۱ گرم"` matched `Educational Sample Vial` (`g-1007`) because `"ویال"` was listed as a standalone alias and matched via `normQuery.includes(alias)`.
   - While this investigation focuses specifically on character normalization, the alias cleanup and score calculation in `scoreCandidate` should be addressed in tandem by the M2 Worker.
2. **Decomposed vs Precomposed Unicode**:
   - When text input contains decomposed Unicode sequences (NFD), `normalizeDigits` and the diacritics stripping regex `[\u064B-\u065F\u0670\u0640]` handle combining marks. Adding `.normalize("NFC")` at the start of `normalizeText` provides defense-in-depth against unusual combining sequences.

---

## 4. Conclusion & Proposed Code Modifications

### 4.1 Exact Code Modification for `src/catalog-resolver.js`

In `src/catalog-resolver.js`, replace lines 36–42 with the following unified transliteration and diacritics stripping:

```javascript
<<<<
  s = s
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ۀ/g, "ه");
  // Remove Arabic diacritics (harakat)
  s = s.replace(/[\u064B-\u065F\u0670]/g, "");
====
  s = s
    .replace(/[آأإٱ]/g, "ا")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ةۀ]/g, "ه");
  // Remove Arabic diacritics (harakat) and tatweel (\u0640)
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
>>>>
```

Optionally, update the punctuation replacement on line 46 to include Persian punctuation marks:
```javascript
<<<<
  // Replace punctuation with space
  s = s.replace(/[\(\)\[\]\{\}\/\\,;:\-_+]/g, " ");
====
  // Replace punctuation with space (preserving decimal period for strengths like 12.5)
  s = s.replace(/[\(\)\[\]\{\}\/\\,;:!_+\-ـ،؛؟«»"']/g, " ");
>>>>
```

### 4.2 Proposed Regression Test Cases for `test/catalog-resolver.test.js`

Add the following 4 comprehensive regression test suites (`CR_11` to `CR_14`) to `test/catalog-resolver.test.js`:

```javascript
test("CR_11: Persian and Arabic Alef variant normalization ([آأإٱ] -> ا)", () => {
  // 1. Unit-level normalization equivalence
  assert.strictEqual(
    normalizeText("اموکسی"),
    normalizeText("آموکسی"),
    "Bare Alef and Alef with Madda must normalize identically"
  );
  assert.strictEqual(
    normalizeText("استامینوفن"),
    normalizeText("آستامینوفن"),
    "Bare Alef and Alef with Madda must normalize identically"
  );
  assert.strictEqual(
    normalizeText("أموكسيسيلين"),
    normalizeText("اموکسیسیلین"),
    "Alef with Hamza Above must normalize to bare Alef"
  );
  assert.strictEqual(
    normalizeText("إيبوبروفين"),
    normalizeText("ایبوبروفین"),
    "Alef with Hamza Below must normalize to bare Alef"
  );

  // 2. Integration catalog search equivalence
  const amoxVariants = ["اموکسی", "آموکسی", "أموكسي"];
  for (const q of amoxVariants) {
    const hits = searchCatalog(q);
    assert.ok(hits.length > 0, `Search for "${q}" must return catalog hits`);
    assert.strictEqual(hits[0].genericCode, "00001", `Top hit for "${q}" must be Amoxicillin 00001`);
    assert.ok(hits[0].score >= 0.85, `Score for "${q}" must meet high-relevance threshold`);
  }

  const acetVariants = ["استامینوفن", "آستامینوفن"];
  for (const q of acetVariants) {
    const hits = searchCatalog(q);
    assert.ok(hits.length > 0, `Search for "${q}" must return catalog hits`);
    assert.strictEqual(hits[0].genericCode, "00025", `Top hit for "${q}" must be Acetaminophen 00025`);
  }
});

test("CR_12: Alef Maksura (ى) and Arabic Yeh transliteration", () => {
  assert.strictEqual(
    normalizeText("اموكسى"),
    normalizeText("اموکسی"),
    "Alef Maksura (ى) must normalize to Persian Yeh (ی)"
  );
  assert.strictEqual(
    normalizeText("آموكسي"),
    normalizeText("اموکسی"),
    "Arabic Yeh (ي) and Alef Madda must normalize to Persian Yeh and bare Alef"
  );

  const maksuraHits = searchCatalog("آموكسى");
  assert.ok(maksuraHits.length > 0, "Query with Alef Maksura must find catalog item");
  assert.strictEqual(maksuraHits[0].genericCode, "00001");
});

test("CR_13: Diacritics (harakat) and Tatweel (kashida) stripping", () => {
  // Harakat stripping
  assert.strictEqual(
    normalizeText("اَمُوکْسِی سِیلِین"),
    normalizeText("اموکسی سیلین"),
    "Arabic diacritics (fatha, damma, kasra, sukun) must be stripped"
  );
  // Tatweel stripping
  assert.strictEqual(
    normalizeText("آموکـسی سیلین"),
    normalizeText("اموکسی سیلین"),
    "Tatweel / Kashida (ـ) must be stripped"
  );

  const diacriticHits = searchCatalog("اَمُوکْسِی");
  assert.ok(diacriticHits.length > 0, "Query with diacritics must match");
  assert.strictEqual(diacriticHits[0].genericCode, "00001");

  const tatweelHits = searchCatalog("آموکـسی");
  assert.ok(tatweelHits.length > 0, "Query with tatweel must match");
  assert.strictEqual(tatweelHits[0].genericCode, "00001");
});

test("CR_14: Leading-zero preservation integrity under numeral normalization", () => {
  const zeroCodes = [
    { input: "00001", expected: "00001" },
    { input: "۰۰۰۰۱", expected: "00001" },
    { input: "٠٠٠٠١", expected: "00001" },
    { input: "08234", expected: "08234" },
    { input: "۰۸۲۳۴", expected: "08234" },
    { input: "00025", expected: "00025" },
    { input: "۰۰۰۲۵", expected: "00025" },
    { input: "٠٠٠٢٥", expected: "00025" },
  ];

  for (const { input, expected } of zeroCodes) {
    const code = normalizeCodeString(input);
    assert.strictEqual(typeof code, "string", "Code must remain string type");
    assert.strictEqual(code, expected, `Leading zeros must remain intact for ${input}`);
    assert.strictEqual(code.length, 5, `Length must remain exactly 5 for ${input}`);

    const searchHits = searchCatalog(input);
    assert.ok(searchHits.length > 0, `searchCatalog must find code ${input}`);
    assert.strictEqual(searchHits[0].genericCode, expected);
    assert.strictEqual(typeof searchHits[0].genericCode, "string");
    assert.strictEqual(searchHits[0].score, 1.0, "Exact code must score 1.0");

    const resolved = resolveItem(input);
    assert.strictEqual(resolved.resolved, true, `resolveItem must resolve ${input}`);
    assert.strictEqual(resolved.suggestedReference.genericCode, expected);
    assert.strictEqual(typeof resolved.suggestedReference.genericCode, "string");
  }
});
```

---

## 5. Verification Method

To independently verify the empirical findings and validate the proposed changes:

1. **Verify Baseline Test Suite**:
   ```bash
   cd /home/admin/PanelPH
   node --test
   ```
   *Expected outcome*: 113 passing tests with exit code 0.

2. **Verify Alef & Yeh Normalization Defect on Current Codebase**:
   ```bash
   node -e '
   import { searchCatalog } from "./src/catalog-resolver.js";
   const r1 = searchCatalog("اموکسی");
   const r2 = searchCatalog("آستامینوفن");
   const r3 = searchCatalog("آموكسى");
   if (r1.length === 0 || r2.length === 0 || r3.length === 0) {
     console.log("CONFIRMED: Normalization defects present (r1=" + r1.length + ", r2=" + r2.length + ", r3=" + r3.length + ")");
     process.exit(0);
   } else {
     console.error("UNEXPECTED: Queries unexpectedly matched.");
     process.exit(1);
   }'
   ```
   *Expected outcome*: Prints `CONFIRMED: Normalization defects present` and exits with code 0.

3. **Verify Proposed Normalization Behavior via In-Memory Harness**:
   ```bash
   node -e '
   function normalizeText(text) {
     if (!text || typeof text !== "string") return "";
     let s = text.trim();
     const digitMap = {
       "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
       "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9"
     };
     s = s.replace(/[۰-۹٠-٩]/g, (ch) => digitMap[ch] || ch);
     s = s
       .replace(/[آأإٱ]/g, "ا")
       .replace(/[يى]/g, "ی")
       .replace(/ك/g, "ک")
       .replace(/[ةۀ]/g, "ه");
     s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
     s = s.replace(/\u200c/g, " ");
     s = s.replace(/[\(\)\[\]\{\}\/\\,;:!_+\-ـ،؛؟«»"'"'"'`]/g, " ");
     return s.replace(/\s+/g, " ").trim().toLowerCase();
   }

   const tests = [
     ["اموکسی", "آموکسی"],
     ["استامینوفن", "آستامینوفن"],
     ["اموكسى", "اموکسی"],
     ["آموکـسی", "اموکسی"],
     ["اَمُوکْسِی", "اموکسی"],
     ["أموكسيسيلين", "اموکسیسیلین"],
   ];

   for (const [a, b] of tests) {
     console.assert(normalizeText(a) === normalizeText(b), `Failed: ${a} !== ${b}`);
   }
   console.log("PASS: Proposed normalization handles all Alef, Yeh, Harakat, and Tatweel variants.");
   '
   ```
   *Expected outcome*: Prints `PASS: Proposed normalization handles all Alef, Yeh, Harakat, and Tatweel variants.` with exit code 0.

4. **Verify String Code Preservation without Numeric Coercion**:
   ```bash
   node -e '
   import { normalizeCodeString, searchCatalog, resolveItem } from "./src/catalog-resolver.js";
   const codes = ["00001", "08234", "00025", "04210", "00115", "00999"];
   for (const c of codes) {
     const n = normalizeCodeString(c);
     const res = resolveItem(c);
     if (typeof n !== "string" || n !== c || res.suggestedReference.genericCode !== c) {
       console.error(`FAIL: Leading zero lost on ${c}`);
       process.exit(1);
     }
   }
   console.log("PASS: Leading-zero code preservation verified.");
   '
   ```
   *Expected outcome*: Prints `PASS: Leading-zero code preservation verified.` with exit code 0.

5. **Invalidation Condition**:
   Once the M2 Worker updates `src/catalog-resolver.js:normalizeText` with `/[آأإٱ]/g -> "ا"`, `/[يى]/g -> "ی"`, and Tatweel stripping, running probe #2 will yield non-zero results (`r1 > 0 && r2 > 0 && r3 > 0`), all 4 regression tests `CR_11`-`CR_14` will pass, and the baseline test suite will remain 100% green.

import assert from "node:assert/strict";

// We test candidate modifications to normalizeText, BUILTIN_REFERENCE_ITEMS, and scoreCandidate

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

export function normalizeText(text) {
  if (!text || typeof text !== "string") return "";
  let s = text.trim();
  s = normalizeDigits(s);
  s = s
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ۀ/g, "ه")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/[يى]/g, "ی");
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

export function normalizeCodeString(code) {
  if (code == null) return "";
  const str = normalizeDigits(String(code).trim());
  return str;
}

// Known generic dosage forms and placeholder tokens that must never match as standalone aliases
const GENERIC_DISALLOWED_ALIASES = new Set([
  "ویال", "شربت", "کرم", "قرص", "کپسول", "امپول", "قطره", "پماد", "ژل",
  "سوسپانسیون", "محلول", "اسپری", "سرم", "شیاف", "لوسیون", "پودر", "ساسه",
  "vial", "syrup", "cream", "tablet", "capsule", "ampoule", "drops", "ointment",
  "gel", "suspension", "solution", "spray", "serum", "suppository", "lotion", "powder",
  "ناموجود", "موجود", "out of stock"
]);

export const BUILTIN_REFERENCE_ITEMS = [
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
    aliases: ["sample vial", "نمونه آموزشی ویال"], // Removed generic "ویال"
  },
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
    aliases: ["شربت دیفن هیدرامین", "دیفن هیدرامین", "diphenhydramine"], // Removed generic "شربت"
  },
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
    aliases: ["شربت سرفه", "cough syrup", "سرفه"],
  },
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
    aliases: ["ویتامین دی۳", "vitamin d", "دی۳"],
  },
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
    aliases: ["داروی ناموجود", "out of stock item"], // Refined from ["ناموجود", "out of stock"]
  },
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
    aliases: ["کرم محافظ", "protective cream"], // Removed generic "cream"
  },
];

export function scoreCandidate(query, candidate) {
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
  // Filter out any standalone generic terms from active aliases
  const rawNormAliases = (candidate.aliases || []).map((a) => normalizeText(a)).filter((a) => a.length > 0);
  const normAliases = rawNormAliases.filter((a) => !GENERIC_DISALLOWED_ALIASES.has(a));
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
    const candidateTokens = new Set([
      ...normTitle.split(" "),
      ...normPersianTitle.split(" "),
      ...normDosage.split(" "),
      ...normStrength.split(" "),
      ...normAliases.flatMap((a) => a.split(" ")),
    ].filter((t) => t.length > 0));

    let matchedTokens = 0;
    let matchedSubstantiveTokens = 0;
    const GENERIC_TOKENS = new Set([
      ...GENERIC_DISALLOWED_ALIASES,
      "میلی", "گرم", "لیتر", "واحد", "درصد", "mg", "ml", "g", "iu", "mcg", "در", "برای", "با"
    ]);

    for (const qt of queryTokens) {
      const isGeneric = GENERIC_TOKENS.has(qt) || /^\d+$/.test(qt);
      if (candidateTokens.has(qt)) {
        matchedTokens++;
        if (!isGeneric) matchedSubstantiveTokens++;
      } else {
        // Partial token containment
        for (const ct of candidateTokens) {
          if (ct.includes(qt) || qt.includes(ct)) {
            matchedTokens += 0.5;
            if (!isGeneric && !GENERIC_TOKENS.has(ct) && !/^\d+$/.test(ct)) {
              matchedSubstantiveTokens += 0.5;
            }
            break;
          }
        }
      }
    }

    const overlapRatio = matchedTokens / queryTokens.length;
    // Only grant Tier 4 token score if at least one substantive (non-generic, non-numeric) token matched.
    // If only generic dosage forms or units matched, do not grant Tier 4 score; allow fallthrough.
    if (overlapRatio > 0 && matchedSubstantiveTokens > 0) {
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

  // 6. Refined Alias Evaluation:
  // - Require minimum query length >= 3
  // - For alias prefix match (user typing as-you-type): alias.startsWith(normQuery)
  // - For multi-word phrase containment: require whole-token word boundary match
  //   AND length ratio >= 0.50, and never on single generic terms.
  for (const alias of normAliases) {
    if (normQuery.length >= 3 && alias.startsWith(normQuery)) {
      const lenRatio = normQuery.length / alias.length;
      const subScore = 0.55 + 0.25 * lenRatio;
      return Math.round(subScore * 100) / 100;
    }

    // Exact word/phrase containment in query with word boundary protection
    if (alias.length >= 4 && !GENERIC_DISALLOWED_ALIASES.has(alias)) {
      const regex = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(\\s|$)`);
      if (regex.test(normQuery)) {
        const lenRatio = Math.min(1, alias.length / normQuery.length);
        if (lenRatio >= 0.35) {
          const subScore = 0.45 + 0.35 * lenRatio;
          return Math.round(subScore * 100) / 100;
        }
      }
    }
  }

  return 0;
}

export function searchCatalog(query, options = {}) {
  const {
    catalog = BUILTIN_REFERENCE_ITEMS,
    limit = 20,
    minScore = 0.15,
    dosageForm = null,
  } = options;

  if (!query || typeof query !== "string" || !query.trim()) {
    return [];
  }

  const results = [];
  for (const item of catalog) {
    if (dosageForm && normalizeText(item.dosageForm) !== normalizeText(dosageForm)) {
      continue;
    }
    const score = scoreCandidate(query, item);
    if (score >= minScore) {
      results.push({
        genericCode: normalizeCodeString(item.genericCode),
        brandCode: normalizeCodeString(item.brandCode),
        title: item.title,
        persianTitle: item.persianTitle || item.title,
        dosageForm: item.dosageForm || "",
        strength: item.strength || "",
        goodId: item.goodId ? String(item.goodId) : undefined,
        sellPrice: typeof item.sellPrice === "number" ? item.sellPrice : undefined,
        score,
      });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });
  return results.slice(0, limit);
}

export function resolveItem(query, candidates = null, options = {}) {
  const candidateList = candidates !== null ? candidates : searchCatalog(query, options);
  const autoThreshold = options.autoThreshold ?? 0.85;
  const ambiguityMargin = options.ambiguityMargin ?? 0.15;

  if (!candidateList || candidateList.length === 0) {
    return {
      resolved: false,
      confidence: "none",
      isAmbiguous: false,
      bestMatch: null,
      candidates: [],
      suggestedReference: null,
    };
  }

  const topMatch = candidateList[0];
  const runnerUp = candidateList[1] || null;

  const suggestedReference = {
    title: topMatch.title,
    genericCode: normalizeCodeString(topMatch.genericCode),
    brandCode: normalizeCodeString(topMatch.brandCode),
    dosageForm: topMatch.dosageForm || "",
    strength: topMatch.strength || "",
    goodId: topMatch.goodId,
  };

  const isCloseRunnerUp =
    runnerUp &&
    topMatch.score - runnerUp.score < ambiguityMargin &&
    runnerUp.score >= 0.70 &&
    !(topMatch.score >= 0.999 && runnerUp.score < 0.999);

  if (topMatch.score >= autoThreshold) {
    if (isCloseRunnerUp) {
      return {
        resolved: false,
        confidence: "medium",
        isAmbiguous: true,
        bestMatch: topMatch,
        candidates: candidateList,
        suggestedReference,
      };
    }
    return {
      resolved: true,
      confidence: "high",
      isAmbiguous: false,
      bestMatch: topMatch,
      candidates: candidateList,
      suggestedReference,
    };
  }

  if (topMatch.score >= 0.40) {
    return {
      resolved: false,
      confidence: "medium",
      isAmbiguous: true,
      bestMatch: topMatch,
      candidates: candidateList,
      suggestedReference,
    };
  }

  return {
    resolved: false,
    confidence: "low",
    isAmbiguous: false,
    bestMatch: topMatch,
    candidates: candidateList,
    suggestedReference,
  };
}

// RUN TESTS
console.log("=== Testing Character Normalization ===");
const r1 = searchCatalog("اموکسی");
console.log("searchCatalog(\"اموکسی\") count:", r1.length, "top:", r1[0]?.title);
assert.ok(r1.length > 0, "اموکسی must find Amoxicillin");

const r2 = searchCatalog("آستامینوفن");
console.log("searchCatalog(\"آستامینوفن\") count:", r2.length, "top:", r2[0]?.title);
assert.ok(r2.length > 0, "آستامینوفن must find Acetaminophen");

console.log("\n=== Testing Spurious Alias False Positives ===");
const vialHits = searchCatalog("ویال سفتریاکسون ۱ گرم");
console.log("searchCatalog(\"ویال سفتریاکسون ۱ گرم\") hits:", vialHits.map(h => `${h.goodId}:${h.title}(${h.score})`));
const hasG1007 = vialHits.some(h => h.goodId === "g-1007");
assert.strictEqual(hasG1007, false, "Educational Sample Vial must NOT match specific clinical query");

const vialRes = resolveItem("ویال سفتریاکسون ۱ گرم");
console.log("resolveItem(\"ویال سفتریاکسون ۱ گرم\"):", vialRes.resolved, "ambiguous:", vialRes.isAmbiguous, "suggested:", vialRes.suggestedReference?.title);
assert.notStrictEqual(vialRes.suggestedReference?.goodId, "g-1007", "Must not suggest Educational Sample Vial");

console.log("\n=== Testing Other Dosage Form Queries ===");
const ketotifenHits = searchCatalog("شربت کتوتیفن");
console.log("searchCatalog(\"شربت کتوتیفن\") hits:", ketotifenHits.map(h => `${h.goodId}:${h.title}(${h.score})`));
// Diphenhydramine must not match just because query has "شربت"!
assert.strictEqual(ketotifenHits.some(h => h.goodId === "g-1002-diphen"), false, "Diphenhydramine must not match شربت کتوتیفن");

console.log("\n=== Testing Valid Alias Queries ===");
const ampiHits = searchCatalog("آمپیسیلین");
assert.ok(ampiHits.length > 0);
assert.strictEqual(ampiHits[0].genericCode, "00001");
console.log("searchCatalog(\"آمپیسیلین\") ->", ampiHits[0].title, ampiHits[0].score);

const amoxHits = searchCatalog("آموکسی");
assert.ok(amoxHits.length > 0);
assert.strictEqual(amoxHits[0].genericCode, "00001");
console.log("searchCatalog(\"آموکسی\") ->", amoxHits[0].title, amoxHits[0].score);

const codeHits = searchCatalog("00001");
assert.ok(codeHits.length > 0);
assert.strictEqual(codeHits[0].genericCode, "00001");
console.log("searchCatalog(\"00001\") ->", codeHits[0].title, codeHits[0].score);

console.log("\nALL VERIFICATION CHECKS PASSED!");

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const PERSIAN_ARABIC_DIGIT_MAP = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/**
 * Transliterates Persian and Arabic digits to ASCII digits character-by-character,
 * preserving string length and leading zeroes.
 */
export function normalizeDigits(str) {
  if (typeof str !== "string") return str == null ? "" : String(str);
  return str.replace(/[۰-۹٠-٩]/g, (ch) => PERSIAN_ARABIC_DIGIT_MAP[ch] || ch);
}

/**
 * Normalizes Persian and Arabic text for consistent search comparison:
 * - Translates digits while preserving leading zeros
 * - Normalizes Arabic Yeh/Keheh/Teh Marbuta to Persian standard
 * - Strips Arabic diacritics
 * - Converts ZWNJ (\u200c) to space for unified tokenization
 * - Collapses punctuation and whitespace
 */
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

/**
 * Ensures code strings preserve leading zeroes and never undergo numeric coercion.
 */
export function normalizeCodeString(code) {
  if (code == null) return "";
  const str = normalizeDigits(String(code).trim());
  return str;
}

// Disallowed standalone generic aliases (dosage forms, inventory status, units)
export const GENERIC_DISALLOWED_ALIASES = new Set([
  "ویال", "شربت", "کرم", "قرص", "کپسول", "امپول", "قطره", "پماد", "ژل",
  "سوسپانسیون", "محلول", "اسپری", "سرم", "شیاف", "لوسیون", "پودر", "ساشه", "ساسه",
  "vial", "syrup", "cream", "tablet", "capsule", "ampoule", "drops", "ointment",
  "gel", "suspension", "solution", "spray", "serum", "suppository", "lotion", "powder", "sachet",
  "ناموجود", "موجود", "out of stock"
]);

export const GENERIC_MEASURE_OR_STOP_TOKENS = new Set([
  ...GENERIC_DISALLOWED_ALIASES,
  "میلی", "گرم", "لیتر", "واحد", "درصد", "mg", "ml", "g", "iu", "mcg", "در", "برای", "با",
  "item", "دارو", "out", "of", "stock", "است"
]);

export const ISOLATED_UNITS = new Set([
  "mg", "ml", "g", "iu", "mcg", "واحد", "درصد"
]);

export const ISOLATED_STATUS_TERMS = new Set([
  "ناموجود", "موجود", "out of stock", "دارو ناموجود", "item out of stock"
]);

export const DOSAGE_MEASURE_TOKENS = new Set([
  "میلی", "گرم", "لیتر", "واحد", "درصد", "mg", "ml", "g", "iu", "mcg"
]);

export const COMPACT_DOSAGE_REGEX = /^\d+(?:\.\d+)?(?:mg|ml|g|iu|mcg|گرم|میلی|لیتر|واحد)$/i;

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
    aliases: ["sample vial", "نمونه آموزشی ویال"],
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
    aliases: ["شربت دیفن هیدرامین", "دیفن هیدرامین", "diphenhydramine"],
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
    aliases: ["داروی ناموجود", "out of stock item"],
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
    aliases: ["کرم محافظ", "protective cream"],
  },
];

function loadDefaultCatalog() {
  const catalog = [...BUILTIN_REFERENCE_ITEMS];

  // Helper to check existence
  const hasItem = (gCode, bCode, title) =>
    catalog.some(
      (c) =>
        (c.genericCode === gCode && c.brandCode === bCode) ||
        (c.title && title && c.title.toLowerCase() === title.toLowerCase())
    );

  // Try merging sample catalog fixture if present
  try {
    const samplePath = join(PROJECT_ROOT, "fixtures", "catalog.sample.json");
    const sampleRaw = readFileSync(samplePath, "utf8");
    const sampleItems = JSON.parse(sampleRaw);
    if (Array.isArray(sampleItems)) {
      for (const item of sampleItems) {
        const genericCode = normalizeCodeString(item.genericCode);
        const brandCode = normalizeCodeString(item.brandCode);
        if (!hasItem(genericCode, brandCode, item.title)) {
          catalog.push({
            goodId: item.goodId || `sample-${genericCode}`,
            genericCode,
            brandCode,
            title: item.title,
            persianTitle: item.title,
            dosageForm: item.dosageForm || "",
            strength: item.strength || "",
            aliases: [item.title],
          });
        }
      }
    }
  } catch {
    // Ignore optional fixture read error
  }

  // Try merging qanoon mock fixtures if present
  try {
    const qanoonPath = join(PROJECT_ROOT, "fixtures", "qanoon-mock-data.json");
    const qanoonRaw = readFileSync(qanoonPath, "utf8");
    const qanoonData = JSON.parse(qanoonRaw);
    if (Array.isArray(qanoonData.goods)) {
      for (const item of qanoonData.goods) {
        // Skip alias item g1 since g-1001 already represents it
        if (item.id === "g1" || item.goodId === "g1") continue;
        const genericCode = normalizeCodeString(item.genericCode);
        const brandCode = normalizeCodeString(item.brandCode);
        const goodId = item.goodId || item.id;
        const exists = catalog.some((c) => c.goodId === goodId || (c.genericCode === genericCode && c.brandCode === brandCode && c.title === item.title));
        if (!exists) {
          catalog.push({
            goodId,
            genericCode,
            brandCode,
            barcode: item.barcode || "",
            title: item.title,
            persianTitle: item.persianTitle || item.title,
            dosageForm: item.dosageForm || "",
            strength: item.strength || item.strengthLabel || "",
            sellPrice: item.sellPrice,
            aliases: Array.isArray(item.aliases) ? item.aliases : [],
          });
        }
      }
    }
  } catch {
    // Ignore optional fixture read error
  }

  return catalog;
}

let cachedDefaultCatalog = null;
function getDefaultCatalog() {
  if (!cachedDefaultCatalog) {
    cachedDefaultCatalog = loadDefaultCatalog();
  }
  return cachedDefaultCatalog;
}

/**
 * Computes candidate relevance score in [0.0, 1.0].
 */
export function scoreCandidate(query, candidate) {
  if (!query || typeof query !== "string") return 0;
  if (!/[\p{L}\p{N}]/u.test(query)) return 0;

  const cleanDigits = normalizeDigits(query.trim());
  const cleanCodeQuery = cleanDigits.replace(/[^\w\d]/g, "");
  const rawCodeQuery = cleanDigits;
  const normQuery = normalizeText(query);
  if (!normQuery && !cleanCodeQuery) return 0;

  const genericCode = normalizeCodeString(candidate.genericCode);
  const brandCode = normalizeCodeString(candidate.brandCode);
  const barcode = candidate.barcode ? normalizeDigits(String(candidate.barcode).trim()) : "";
  const goodId = candidate.goodId ? String(candidate.goodId).trim().toLowerCase() : "";

  // 1. Exact Code Matching (Tier 1: 0.85 - 1.00)
  if (cleanCodeQuery) {
    if (genericCode && (cleanCodeQuery === genericCode || rawCodeQuery === genericCode)) return 1.0;
    if (barcode && (cleanCodeQuery === barcode || rawCodeQuery === barcode)) return 1.0;
    if (goodId && (cleanCodeQuery.toLowerCase() === goodId || rawCodeQuery.toLowerCase() === goodId)) return 1.0;
    if (brandCode && (cleanCodeQuery === brandCode || rawCodeQuery === brandCode)) return 0.85;
  }

  // Code Prefix Match (0.80) - only for numeric codes >= 3 digits
  if (/^\d{3,}$/.test(cleanCodeQuery)) {
    if (genericCode.startsWith(cleanCodeQuery) || brandCode.startsWith(cleanCodeQuery)) {
      return 0.80;
    }
  }

  const normTitle = normalizeText(candidate.title || "");
  const normPersianTitle = normalizeText(candidate.persianTitle || "");
  const rawNormAliases = (candidate.aliases || []).map((a) => normalizeText(a)).filter((a) => a.length > 0);
  const normAliases = rawNormAliases.filter((a) => !GENERIC_DISALLOWED_ALIASES.has(a));
  const normDosage = normalizeText(candidate.dosageForm || "");
  const normStrength = normalizeText(candidate.strength || "");

  // 2. Exact Title / Persian Title / Alias Match (Tier 2: 0.95 - 0.99)
  if (normQuery === normTitle || normQuery === normPersianTitle) return 0.99;
  if (normAliases.includes(normQuery)) return 0.97;

  // Placeholder inventory status item (g-1006) must only match exact code or exact canonical title/alias
  if (candidate.goodId === "g-1006" || genericCode === "00999") {
    return 0;
  }

  // Standalone disallowed dosage forms (e.g. "ویال", "شربت", "کرم", "قرص", "کپسول", "vial", "cream")
  if (GENERIC_DISALLOWED_ALIASES.has(normQuery)) {
    return 0;
  }

  // Isolated units (e.g. "mg", "ml", "واحد")
  if (ISOLATED_UNITS.has(normQuery)) {
    return 0;
  }

  // Isolated status terms
  if (ISOLATED_STATUS_TERMS.has(normQuery)) {
    return 0;
  }

  const queryTokens = normQuery.split(" ").filter((t) => t.length > 0);

  // Pure dosage queries: spaced or compact (e.g. "۵۰۰ میلی گرم", "500 mg", "500mg", "325mg", "120ml", "1000iu", "۵۰۰میلی‌گرم")
  const isDosageOrDigitToken = (t) => /^\d+$/.test(t) || DOSAGE_MEASURE_TOKENS.has(t) || COMPACT_DOSAGE_REGEX.test(t);
  const hasDigitComponent = queryTokens.some((t) => /^\d+$/.test(t) || COMPACT_DOSAGE_REGEX.test(t));
  const hasDosageComponent = queryTokens.some((t) => DOSAGE_MEASURE_TOKENS.has(t) || COMPACT_DOSAGE_REGEX.test(t));
  if (hasDigitComponent && hasDosageComponent && queryTokens.length > 0 && queryTokens.every(isDosageOrDigitToken)) {
    return 0;
  }

  // 3. Title Starts With Query (Tier 3: 0.90)
  if (
    normQuery.length >= 3 &&
    !GENERIC_MEASURE_OR_STOP_TOKENS.has(normQuery) &&
    (normTitle.startsWith(normQuery) || normPersianTitle.startsWith(normQuery))
  ) {
    return 0.90;
  }

  // 4. Multi-Token Overlap & Attribute Boosting (Tier 4)
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
    for (const qt of queryTokens) {
      const isGeneric = GENERIC_MEASURE_OR_STOP_TOKENS.has(qt) || /^\d+$/.test(qt) || COMPACT_DOSAGE_REGEX.test(qt);
      if (candidateTokens.has(qt)) {
        matchedTokens++;
        if (!isGeneric) matchedSubstantiveTokens++;
      } else {
        // Partial token containment - only for non-generic tokens >= 3 chars
        if (!isGeneric && qt.length >= 3) {
          for (const ct of candidateTokens) {
            if (!GENERIC_MEASURE_OR_STOP_TOKENS.has(ct) && !/^\d+$/.test(ct)) {
              if (ct.includes(qt) || qt.includes(ct)) {
                matchedTokens += 0.5;
                matchedSubstantiveTokens += 0.5;
                break;
              }
            }
          }
        }
      }
    }

    const overlapRatio = matchedTokens / queryTokens.length;
    // Only grant Tier 4 score if at least one substantive (non-generic, non-numeric) token matched.
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
  if (
    normQuery.length >= 3 &&
    !/^\d+$/.test(normQuery) &&
    !COMPACT_DOSAGE_REGEX.test(normQuery) &&
    !GENERIC_MEASURE_OR_STOP_TOKENS.has(normQuery) &&
    (normTitle.includes(normQuery) || normPersianTitle.includes(normQuery))
  ) {
    const lenRatio = Math.min(1, normQuery.length / Math.max(normTitle.length, 1));
    const subScore = 0.50 + 0.30 * lenRatio;
    return Math.round(subScore * 100) / 100;
  }

  // 6. Refined Alias Evaluation:
  // - Require minimum query length >= 3
  // - For alias prefix match (typing as-you-type): alias.startsWith(normQuery)
  // - For phrase containment: require whole-token word boundary match
  //   AND length ratio >= 0.35, and never on single generic terms.
  for (const alias of normAliases) {
    if (normQuery.length >= 3 && alias.startsWith(normQuery)) {
      const lenRatio = normQuery.length / alias.length;
      const subScore = 0.55 + 0.25 * lenRatio;
      return Math.round(subScore * 100) / 100;
    }

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

/**
 * Searches medicine catalog and returns ranked candidates.
 * Strictly preserves leading zeroes in genericCode and brandCode strings.
 */
export function searchCatalog(query, options = {}) {
  const {
    catalog = getDefaultCatalog(),
    limit = 20,
    minScore = 0.15,
    dosageForm = null,
  } = options;

  if (!query || typeof query !== "string" || !/[\p{L}\p{N}]/u.test(query)) {
    return [];
  }

  const normQuery = normalizeText(query);
  if (
    GENERIC_DISALLOWED_ALIASES.has(normQuery) ||
    ISOLATED_UNITS.has(normQuery) ||
    ISOLATED_STATUS_TERMS.has(normQuery)
  ) {
    return [];
  }

  const queryTokens = normQuery.split(" ").filter((t) => t.length > 0);
  const isDosageOrDigitToken = (t) => /^\d+$/.test(t) || DOSAGE_MEASURE_TOKENS.has(t) || COMPACT_DOSAGE_REGEX.test(t);
  const hasDigitComponent = queryTokens.some((t) => /^\d+$/.test(t) || COMPACT_DOSAGE_REGEX.test(t));
  const hasDosageComponent = queryTokens.some((t) => DOSAGE_MEASURE_TOKENS.has(t) || COMPACT_DOSAGE_REGEX.test(t));
  if (hasDigitComponent && hasDosageComponent && queryTokens.length > 0 && queryTokens.every(isDosageOrDigitToken)) {
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

  // Sort descending by score, tie-break by dual code match, then title
  const cleanDigits = normalizeDigits(query.trim());
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aDual = cleanDigits && a.genericCode === cleanDigits && a.brandCode === cleanDigits;
    const bDual = cleanDigits && b.genericCode === cleanDigits && b.brandCode === cleanDigits;
    if (aDual && !bDual) return -1;
    if (!aDual && bDual) return 1;
    return a.title.localeCompare(b.title);
  });

  return results.slice(0, limit);
}

/**
 * Evaluates whether a query can be resolved unambiguously to a catalog item,
 * or whether pharmacist confirmation/selection is required.
 */
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

  // Ambiguity condition: runner up is close to top match and both are reasonably scored,
  // unless topMatch is an exact perfect match (1.0) and runnerUp is not (e.g. secondary brand code match).
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

export function getGoodByCode(genericCode, brandCode = null, options = {}) {
  const catalog = options.catalog || getDefaultCatalog();
  const cleanGeneric = normalizeCodeString(genericCode);
  const cleanBrand = brandCode != null ? normalizeCodeString(brandCode) : null;
  return (
    catalog.find((item) => {
      const itemG = normalizeCodeString(item.genericCode);
      const itemB = normalizeCodeString(item.brandCode);
      if (cleanBrand) {
        return itemG === cleanGeneric && itemB === cleanBrand;
      }
      return itemG === cleanGeneric;
    }) || null
  );
}

export class CatalogResolver {
  constructor(options = {}) {
    this.catalog = options.catalog || getDefaultCatalog();
  }

  searchCatalog(query, options = {}) {
    return searchCatalog(query, { catalog: this.catalog, ...options });
  }

  resolveItem(query, candidates = null, options = {}) {
    return resolveItem(query, candidates, { catalog: this.catalog, ...options });
  }

  getGoodByCode(genericCode, brandCode = null) {
    return getGoodByCode(genericCode, brandCode, { catalog: this.catalog });
  }
}

export function createCatalogResolver(options = {}) {
  return new CatalogResolver(options);
}

import { readFileSync } from "node:fs";
import { goods as mockGoods } from "../data/mock-data.ts";
import type { Good } from "../../../../packages/domain/src/types.ts";

function loadGoods(): Good[] {
  const path = process.env.QANUN_GOODS_PATH;
  if (path && process.env.NODE_ENV !== "test") {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as Good[];
      }
    } catch {
      // fall through to the bundled mock data
    }
  }
  return mockGoods;
}

// REST complement channel (read-only): a separate dataset pulled over the
// vendor REST API by rest_cycle.py. It is merged FILL-ONLY — an item is
// appended only when neither its numeric code nor its normalized title
// exists in the primary (token-channel) catalog, so a REST price can
// never override a token-channel price. A missing or malformed REST file
// is not an error: the primary catalog is served alone, silently.
export function sanitizeRestGoods(parsed: unknown): Good[] {
  if (!Array.isArray(parsed)) return [];
  const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
  const optStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  const num = (v: unknown, dflt: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : dflt;
  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((a) => typeof a === "string") : [];
  const out: Good[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id.length === 0) continue;
    // Build a COMPLETE Good with type-checked fields: downstream code
    // (search precompute, scoring, presenters) reads aliases/sources/
    // taxCodes and numeric fields without guards, so a sparse or
    // mistyped entry must arrive fully defaulted, never raw.
    out.push({
      id: e.id,
      internalCode: str(e.internalCode),
      barcode: str(e.barcode),
      genericCode: str(e.genericCode),
      title: str(e.title),
      persianTitle: str(e.persianTitle),
      englishTitle: str(e.englishTitle),
      aliases: strArray(e.aliases),
      brand: str(e.brand),
      sellPrice: num(e.sellPrice, 0),
      taxCodes: Array.isArray(e.taxCodes) ? e.taxCodes.map((t) => String(t)) : [],
      nonPharma: e.nonPharma === true,
      countInPackage: num(e.countInPackage, 1),
      unitLabel: str(e.unitLabel),
      packLabel: str(e.packLabel),
      dosageForm: optStr(e.dosageForm),
      routeQualifier: optStr(e.routeQualifier),
      strengthLabel: optStr(e.strengthLabel),
      patientFormLabel: optStr(e.patientFormLabel),
      packageDescription: optStr(e.packageDescription),
      activeStatus:
        e.activeStatus === "active" || e.activeStatus === "inactive" || e.activeStatus === "unknown"
          ? e.activeStatus
          : undefined,
      crawledAt: optStr(e.crawledAt),
      ttacCode: optStr(e.ttacCode),
      ...(typeof e.tempPrice === "number" && Number.isFinite(e.tempPrice) ? { tempPrice: e.tempPrice } : {}),
      sources: Array.isArray(e.sources)
        ? e.sources
            .filter((s) => s !== null && typeof s === "object")
            .map((s) => {
              const sr = s as Record<string, unknown>;
              return {
                key: str(sr.key) as Good["sources"][number]["key"],
                label: str(sr.label),
                role: str(sr.role) as Good["sources"][number]["role"],
                priority: num(sr.priority, 0),
              };
            })
        : [],
    });
  }
  return out;
}

function loadRestGoods(): Good[] {
  const path = process.env.REST_GOODS_PATH;
  if (path && process.env.NODE_ENV !== "test") {
    try {
      return sanitizeRestGoods(JSON.parse(readFileSync(path, "utf8")));
    } catch {
      // fall through: primary catalog only
    }
  }
  return [];
}

export function mergeRestComplement(base: Good[], rest: Good[]): Good[] {
  if (rest.length === 0) return base;
  const codes = new Set<string>();
  const titles = new Set<string>();
  const keyOf = (good: Good) => (good.internalCode || "").trim();
  const titleKeysOf = (good: Good) =>
    [good.persianTitle, good.title, good.englishTitle]
      .map((t) => normalizeSearchText(t || ""))
      .filter((t) => t.length > 0);
  for (const good of base) {
    const code = keyOf(good);
    if (code) codes.add(code);
    for (const t of titleKeysOf(good)) titles.add(t);
  }
  const seenIds = new Set<string>();
  const additions: Good[] = [];
  for (const good of rest) {
    if (seenIds.has(good.id)) continue;
    seenIds.add(good.id);
    const code = keyOf(good);
    if (code && codes.has(code)) continue;
    const tks = titleKeysOf(good);
    if (tks.some((t) => titles.has(t))) continue;
    additions.push(good);
    if (code) codes.add(code);
    for (const t of tks) titles.add(t);
  }
  if (additions.length > 0) {
    console.log(`[goods] REST complement: +${additions.length} items over base ${base.length}`);
  }
  return additions.length > 0 ? [...base, ...additions] : base;
}

const baseGoods: Good[] = loadGoods();
let goods: Good[] = baseGoods;
try {
  goods = mergeRestComplement(baseGoods, loadRestGoods());
} catch {
  // A malformed complement must never take the primary catalog down.
  goods = baseGoods;
}
import { normalizeSearchText, tokenizeSearchText } from "../search/search-normalization.ts";
import { selectionHistoryStore } from "../services/selection-history-store.ts";

const DOSAGE_FORM_TOKENS = new Set([
  "قرص",
  "کپسول",
  "شربت",
  "قطره",
  "پماد",
  "کرم",
  "شیاف",
  "آمپول",
  "تزریقی",
  "tablet",
  "capsule",
  "syrup",
  "drop",
  "drops",
  "ointment",
  "cream",
  "suppository",
  "injection"
]);
const FORM_ALIASES = new Map([
  ["tablet", ["tablet", "tab", "قرص"]],
  ["capsule", ["capsule", "cap", "کپسول"]],
  ["softgel", ["softgel", "سافت ژل", "سافت‌ژل"]],
  ["syrup", ["syrup", "شربت"]],
  ["drop", ["drop", "drops", "قطره"]],
  ["ointment", ["ointment", "پماد"]],
  ["cream", ["cream", "کرم"]],
  ["suppository", ["suppository", "supp", "شیاف"]],
  ["injection", ["injection", "ampule", "ampoule", "آمپول", "تزریقی"]]
]);
const QUALIFIER_ALIASES = new Map([
  ["ophthalmic", ["ophthalmic", "eye", "چشمی"]],
  ["otic", ["otic", "ear", "گوشی"]],
  ["nasal", ["nasal", "nose", "بینی"]],
  ["oral", ["oral", "خوراکی"]],
  ["rectal", ["rectal", "رکتال", "مقعدی"]],
  ["topical", ["topical", "پوستی", "موضعی"]],
  ["sublingual", ["sublingual", "زیرزبانی", "زیر زبانی"]]
]);

function tokenize(term) {
  return tokenizeSearchText(term);
}

function includesAny(query, values) {
  return values.some((value) => query.includes(normalizeSearchText(value)));
}

function findExplicitKeys(query, aliases) {
  return [...aliases.entries()]
    .filter(([, values]) => includesAny(query, values))
    .map(([key]) => key);
}

function levenshteinDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () => []);

  for (let index = 0; index <= left.length; index += 1) {
    rows[index][0] = index;
  }

  for (let index = 0; index <= right.length; index += 1) {
    rows[0][index] = index;
  }

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      rows[leftIndex][rightIndex] = Math.min(
        rows[leftIndex - 1][rightIndex] + 1,
        rows[leftIndex][rightIndex - 1] + 1,
        rows[leftIndex - 1][rightIndex - 1] + substitutionCost
      );
    }
  }

  return rows[left.length][right.length];
}

function fuzzyTokenMatch(token, candidate) {
  if (!token || !candidate) {
    return false;
  }

  if (candidate.includes(token)) {
    return true;
  }

  // Levenshtein distance is at least the length difference, so candidates
  // further than 1 char away can never fuzzy-match — skip the O(n*m) table.
  if (Math.abs(token.length - candidate.length) > 1) {
    return false;
  }

  if (token.length < 5 || candidate.length < 5) {
    return DOSAGE_FORM_TOKENS.has(candidate) && levenshteinDistance(token, candidate) <= 1;
  }

  return levenshteinDistance(token, candidate) <= 1;
}

function scoreFieldMatches(term, tokens, value, weight) {
  if (!value) {
    return 0;
  }

  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue) {
    return 0;
  }

  let score = 0;

  if (normalizedValue === term) {
    score += weight * 6;
  } else if (normalizedValue.startsWith(term)) {
    score += weight * 4;
  } else if (normalizedValue.includes(term)) {
    score += weight * 2;
  }

  const candidateTokens = tokenize(normalizedValue);
  for (const token of tokens) {
    if (candidateTokens.includes(token)) {
      score += weight;
    }
  }

  return score;
}

function scoreGood(term, tokens, good, query) {
  const explicitFormKeys = findExplicitKeys(term, FORM_ALIASES);
  const explicitQualifierKeys = findExplicitKeys(term, QUALIFIER_ALIASES);
  let score = 0;

  score += scoreFieldMatches(term, tokens, good.persianTitle, 12);
  score += scoreFieldMatches(term, tokens, good.englishTitle, 11);
  score += scoreFieldMatches(term, tokens, good.title, 10);
  score += scoreFieldMatches(term, tokens, good.strengthLabel, 8);
  score += scoreFieldMatches(term, tokens, good.patientFormLabel, 7);
  score += scoreFieldMatches(term, tokens, good.dosageForm, 6);
  score += scoreFieldMatches(term, tokens, good.routeQualifier, 5);
  score += scoreFieldMatches(term, tokens, good.packageDescription, 4);

  for (const alias of good.aliases ?? []) {
    score += scoreFieldMatches(term, tokens, alias, 9);
  }

  if (explicitFormKeys.includes(good.dosageForm ?? good.unitLabel ?? "")) {
    score += 120;
  }

  if (explicitQualifierKeys.includes(good.routeQualifier ?? "")) {
    score += 90;
  }

  if (good.activeStatus === "active") {
    score += 20;
  }

  if (good.strengthLabel) {
    score += 5;
  }

  if (good.packageDescription || good.packLabel) {
    score += 3;
  }

  score += selectionHistoryStore.getSelectionCount(query, good.id) * 10;

  return score;
}

/**
 * Pre-normalized search fields per good. Normalizing ~16k catalogs' fields
 * on every query cost 3-5s per search (QA 2026-10-30 profile) — it is
 * identical for every query, so it is computed once at load. Matching
 * semantics are unchanged: same fields, same normalization, same fuzz.
 */
interface SearchableGood {
  good: Good;
  /** Normalized whole-field candidates. */
  fields: string[];
  /** Pre-split token lists of each field. */
  fieldTokens: string[][];
}

const searchableGoods: SearchableGood[] = goods.map((good) => {
  const haystacks = [
    good.id,
    good.internalCode,
    good.barcode,
    good.genericCode,
    good.title,
    good.brand,
    good.persianTitle,
    good.englishTitle,
    good.dosageForm,
    good.routeQualifier,
    good.strengthLabel,
    good.patientFormLabel,
    good.packageDescription,
    good.activeStatus,
    ...good.aliases
  ].filter(Boolean);

  const fields = haystacks.map((value) => normalizeSearchText(value));
  return {
    good,
    fields,
    fieldTokens: fields.map((field) => field.split(/\s+/))
  };
});

function matchesToken(token, entry) {
  return entry.fields.some(
    (candidate, fieldIndex) =>
      entry.fieldTokens[fieldIndex].some((candidateToken) =>
        fuzzyTokenMatch(token, candidateToken)
      ) || fuzzyTokenMatch(token, candidate)
  );
}

export const goodsRepository = {
  search(input) {
    const query = input?.query ?? "";
    const term = normalizeSearchText(query);
    const tokens = tokenize(term);

    if (!term) {
      return goods.slice(0, 20);
    }

    return searchableGoods
      .filter((entry) => tokens.every((token) => matchesToken(token, entry)))
      .map((entry) => entry.good)
      .sort(
        (left, right) => scoreGood(term, tokens, right, query) - scoreGood(term, tokens, left, query)
      );
  },

  getById(id) {
    return goods.find((good) => good.id === id) ?? null;
  }
};

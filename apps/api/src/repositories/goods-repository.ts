import { readFileSync, statSync } from "node:fs";
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
// vendor REST API by rest_cycle.py. Merge order follows snapshot
// freshness: a NEWER REST snapshot updates prices of code-matched items
// (identity stays primary) and appends items the primary lacks; an older
// or undated REST snapshot is fill-only. A missing or malformed REST file
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

export interface ComplementFreshness {
  /** Snapshot time (ms) of the primary catalog file. */
  baseAt?: number;
  /** Snapshot time (ms) of the REST dataset (meta pulled_at, else file mtime). */
  restAt?: number;
}

export function mergeRestComplement(base: Good[], rest: Good[], freshness: ComplementFreshness = {}): Good[] {
  if (rest.length === 0) return base;
  const keyOf = (good: Good) => (good.internalCode || "").trim();
  const titleKeysOf = (good: Good) =>
    [good.persianTitle, good.title, good.englishTitle]
      .map((t) => normalizeSearchText(t || ""))
      .filter((t) => t.length > 0);

  // Freshness order (owner's strategy): when the REST snapshot is NEWER
  // than the primary snapshot, code-matched items take the REST price —
  // the identity (titles, codes) always stays with the primary item, and
  // title-only matches are never price-swapped (identity ambiguity).
  // Otherwise the merge is fill-only, exactly as before.
  const restFresher =
    typeof freshness.restAt === "number" &&
    typeof freshness.baseAt === "number" &&
    freshness.restAt > freshness.baseAt;
  let effectiveBase = base;
  if (restFresher) {
    // The vendor data contains duplicate codes (the same numeric code on
    // two different records). Group candidates per code and disambiguate
    // by title: a candidate whose normalized title matches the base item
    // wins; only when none matches does the first candidate apply.
    const restByCode = new Map<string, Good[]>();
    for (const good of rest) {
      const code = keyOf(good);
      if (!code) continue;
      const list = restByCode.get(code);
      if (list) list.push(good);
      else restByCode.set(code, [good]);
    }
    const pickCandidate = (baseGood: Good, candidates: Good[]): Good => {
      if (candidates.length === 1) return candidates[0];
      const baseTitles = new Set(titleKeysOf(baseGood));
      return candidates.find((c) => titleKeysOf(c).some((t) => baseTitles.has(t))) ?? candidates[0];
    };
    let overrides = 0;
    effectiveBase = base.map((good) => {
      const code = keyOf(good);
      const candidates = code ? restByCode.get(code) : undefined;
      const fresher = candidates ? pickCandidate(good, candidates) : undefined;
      // A fresher price of 0 is "no price signal" (sanitize coerces a
      // missing/mistyped REST price to 0) — it must never erase a real
      // primary price.
      if (!fresher || fresher.sellPrice <= 0 || fresher.sellPrice === good.sellPrice) return good;
      overrides++;
      const lo = Math.min(good.sellPrice, fresher.sellPrice);
      const hi = Math.max(good.sellPrice, fresher.sellPrice);
      if (lo > 0 && hi / lo > 5) {
        // Observability only: a >5x cross-channel delta is worth a human
        // look later; the freshness rule still applies.
        console.warn(`[goods] REST price override code=${code} ratio=${(hi / lo).toFixed(1)}`);
      }
      return { ...good, sellPrice: fresher.sellPrice, crawledAt: fresher.crawledAt ?? good.crawledAt };
    });
    if (overrides > 0) {
      console.log(`[goods] REST fresher: ${overrides} prices updated from REST snapshot`);
    }
  }

  const codes = new Set<string>();
  const titles = new Set<string>();
  for (const good of effectiveBase) {
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
    console.log(`[goods] REST complement: +${additions.length} items over base ${effectiveBase.length}`);
  }
  if (additions.length > 0) return [...effectiveBase, ...additions];
  return effectiveBase;
}

function fileTimeMs(path: string | undefined): number | undefined {
  if (!path) return undefined;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return undefined;
  }
}

function restPulledAtMs(restPath: string | undefined): number | undefined {
  if (!restPath) return undefined;
  const metaPath = restPath.replace(/rest-goods\.json$/, "rest-goods-meta.json");
  if (metaPath !== restPath) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { pulled_at?: string };
      const ms = meta.pulled_at ? Date.parse(meta.pulled_at) : NaN;
      if (!Number.isNaN(ms)) return ms;
    } catch {
      // fall through to the dataset's own mtime
    }
  }
  return fileTimeMs(restPath);
}

function stampMissing(items: Good[], atMs: number | undefined): Good[] {
  if (typeof atMs !== "number" || !Number.isFinite(atMs)) return items;
  const iso = new Date(atMs).toISOString();
  if (items.every((g) => g.crawledAt)) return items;
  return items.map((g) => (g.crawledAt ? g : { ...g, crawledAt: iso }));
}

const baseGoodsRaw: Good[] = loadGoods();
const restGoodsRaw: Good[] = loadRestGoods();
const baseAtMs = fileTimeMs(process.env.QANUN_GOODS_PATH);
const restAtMs = restGoodsRaw.length > 0 ? restPulledAtMs(process.env.REST_GOODS_PATH) : undefined;
const baseGoods: Good[] = stampMissing(baseGoodsRaw, baseAtMs);
let goods: Good[] = baseGoods;
try {
  goods = mergeRestComplement(baseGoods, stampMissing(restGoodsRaw, restAtMs), {
    baseAt: baseAtMs,
    restAt: restAtMs,
  });
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
  "اسپری",
  "محلول",
  "لوسیون",
  "ژل",
  "سوسپانسیون",
  "پودر",
  "استنشاقی",
  "tablet",
  "capsule",
  "syrup",
  "drop",
  "drops",
  "ointment",
  "cream",
  "suppository",
  "injection",
  "spray",
  "solution",
  "lotion",
  "gel",
  "suspension",
  "powder",
  "inhaler"
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

export function fuzzyTokenMatch(token, candidate, { editAllowed = true } = {}) {
  if (!token || !candidate) {
    return false;
  }

  if (candidate.includes(token)) {
    return true;
  }

  if (!editAllowed) {
    return false;
  }

  // Levenshtein distance is at least the length difference, so candidates
  // further than 1 char away can never fuzzy-match — skip the O(n*m) table.
  if (Math.abs(token.length - candidate.length) > 1) {
    return false;
  }

  if (token.length < 5 || candidate.length < 5) {
    return DOSAGE_FORM_TOKENS.has(candidate) && levenshteinDistance(token, candidate) <= 1;
  }

  // Both long: a dosage-form candidate never bridges by edit distance.
  // «اسپری» (spray) is Levenshtein-1 from «اسپرین» (aspirin) — with
  // Persian-rich titles, every spray in the catalog would flood an
  // aspirin query. Form words match exactly/by substring, or through
  // the alias tables — never by a one-letter guess.
  if (DOSAGE_FORM_TOKENS.has(candidate)) {
    return false;
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
  /** Prefix-run concatenations of each field's tokens (joined compounds). */
  joinedTokens: string[];
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
  const fieldTokens = fields.map((field) => field.split(/\s+/));
  // ZWNJ/space-split compounds («آموکسی‌سیلین» → tokens اموکسی + سیلین)
  // are invisible to a patient who types the name joined
  // («آموکسیسیلین», one token). For each field, add its prefix-run
  // concatenations (اموکسی, اموکسیسیلین, اموکسیسیلین500, …) as joined
  // candidates. They are matched ONLY by equality or edit distance —
  // never by substring: a whole-field join would let «اسپرین» match
  // across the اسپری+نازال boundary of an unrelated nasal spray.
  const joinedTokens: string[] = [];
  for (const tokens of fieldTokens) {
    let run = "";
    for (let i = 0; i < tokens.length; i += 1) {
      run += tokens[i];
      if (i >= 1) {
        joinedTokens.push(run);
      }
    }
  }
  return { good, fields, fieldTokens, joinedTokens };
});

/**
 * Every field token in the catalog. Drives exact-match precedence: when
 * the patient's token IS a real catalog token, it names a real drug —
 * a Levenshtein-1 neighbour is then a DIFFERENT drug, not a typo
 * (آسپرین exact-matches aspirin; آسپتین/SEPTIBODY must not leak in).
 * Edit-distance matching stays on for tokens with no exact home.
 */
const tokenUniverse = new Set<string>();
for (const entry of searchableGoods) {
  for (const tokens of entry.fieldTokens) {
    for (const token of tokens) {
      if (token) {
        tokenUniverse.add(token);
      }
    }
  }
  for (const joined of entry.joinedTokens) {
    tokenUniverse.add(joined);
  }
}

export function hasExactTokenMatch(token: string): boolean {
  return tokenUniverse.has(token);
}

/** Joined-compound matching: equality, or a guarded edit distance. Never substring. */
function joinedTokenMatch(token, joined, editAllowed) {
  if (joined === token) {
    return true;
  }
  if (!editAllowed || token.length < 5 || joined.length < 5) {
    return false;
  }
  if (Math.abs(token.length - joined.length) > 1) {
    return false;
  }
  return levenshteinDistance(token, joined) <= 1;
}

function matchesToken(token, entry, editAllowed = true) {
  const inFields = entry.fields.some(
    (candidate, fieldIndex) =>
      entry.fieldTokens[fieldIndex].some((candidateToken) =>
        fuzzyTokenMatch(token, candidateToken, { editAllowed })
      ) || fuzzyTokenMatch(token, candidate, { editAllowed })
  );
  if (inFields) {
    return true;
  }
  return entry.joinedTokens.some((joined) => joinedTokenMatch(token, joined, editAllowed));
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
      .filter((entry) =>
        tokens.every((token) => matchesToken(token, entry, !hasExactTokenMatch(token)))
      )
      .map((entry) => entry.good)
      .sort(
        (left, right) => scoreGood(term, tokens, right, query) - scoreGood(term, tokens, left, query)
      );
  },

  getById(id) {
    return goods.find((good) => good.id === id) ?? null;
  }
};

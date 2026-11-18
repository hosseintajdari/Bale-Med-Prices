import { readFileSync, statSync } from "node:fs";
import { goods as mockGoods } from "../data/mock-data.ts";
import type { Good } from "../../../../packages/domain/src/types.ts";

function loadGoods(): { goods: Good[]; fromFile: boolean } {
  const path = process.env.QANUN_GOODS_PATH;
  if (path && process.env.NODE_ENV !== "test") {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { goods: parsed as Good[], fromFile: true };
      }
    } catch {
      // fall through to the bundled mock data
    }
  }
  return { goods: mockGoods, fromFile: false };
}

// REST channel (read-only): a separate dataset pulled over the vendor
// REST API by rest_cycle.py. Since the Scan-B verdict (2026-11-18 —
// record-level REST≡token price identity, the old deltas were a
// code-reuse matching artifact) REST is the PRIMARY catalog: it defines
// identity and coverage. The token catalog is the fallback complement:
// it appends items REST lacks and, when its snapshot is fresher,
// updates prices of code-matched items under the same guards. A missing
// or malformed file on either side is not an error: the other catalog
// is served alone.
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
  /** Snapshot time (ms) of the primary catalog. */
  baseAt?: number;
  /** Snapshot time (ms) of the complement dataset. */
  restAt?: number;
  /** Log label for the complement channel (default "REST"). */
  complementLabel?: string;
}

export function mergeRestComplement(base: Good[], rest: Good[], freshness: ComplementFreshness = {}): Good[] {
  if (rest.length === 0) return base;
  const complementLabel = freshness.complementLabel ?? "REST";
  const keyOf = (good: Good) => (good.internalCode || "").trim();
  const titleKeysOf = (good: Good) =>
    [good.persianTitle, good.title, good.englishTitle]
      .map((t) => normalizeSearchText(t || ""))
      .filter((t) => t.length > 0);

  // Freshness order: when the complement snapshot is NEWER than the
  // primary snapshot, code-matched items take the complement price —
  // the identity (titles, codes) always stays with the primary item, and
  // title-only matches are never price-swapped (identity ambiguity).
  // Otherwise the merge is fill-only.
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
        console.warn(`[goods] ${complementLabel} price override code=${code} ratio=${(hi / lo).toFixed(1)}`);
      }
      return { ...good, sellPrice: fresher.sellPrice, crawledAt: fresher.crawledAt ?? good.crawledAt };
    });
    if (overrides > 0) {
      console.log(`[goods] ${complementLabel} fresher: ${overrides} prices updated from ${complementLabel} snapshot`);
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
    console.log(`[goods] ${complementLabel} complement: +${additions.length} items over base ${effectiveBase.length}`);
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

export interface CatalogChannels {
  /** Token-channel catalog (fallback since 2026-11-18). */
  tokenGoods: Good[];
  /** True only when the token goods came from the real catalog file —
   * the bundled mock data must never fill into a REST-primary catalog. */
  tokenFromFile: boolean;
  tokenAt?: number;
  /** REST catalog (primary since the Scan-B verdict, 2026-11-18). */
  restGoods: Good[];
  restAt?: number;
}

/**
 * Assemble the served catalog from the two channels. REST is primary
 * (identity + coverage); the token catalog is the complement under the
 * exact guards mergeRestComplement has always enforced (fresher-wins on
 * code+title-matched prices, ≤0 never overrides, >5x logged, fill-only
 * otherwise). Degradation is one-directional and safe: no REST → token
 * alone; no real token file → REST alone; a throwing merge → primary.
 */
export function assembleCatalog(channels: CatalogChannels): Good[] {
  const { tokenGoods, tokenFromFile, tokenAt, restGoods, restAt } = channels;
  if (restGoods.length === 0) return tokenGoods;
  if (!tokenFromFile || tokenGoods.length === 0) return restGoods;
  try {
    return mergeRestComplement(restGoods, tokenGoods, {
      baseAt: restAt,
      restAt: tokenAt,
      complementLabel: "token",
    });
  } catch {
    return restGoods;
  }
}

const tokenLoaded = loadGoods();
const restGoodsRaw: Good[] = loadRestGoods();
const tokenAtMs = fileTimeMs(process.env.QANUN_GOODS_PATH);
const restAtMs = restGoodsRaw.length > 0 ? restPulledAtMs(process.env.REST_GOODS_PATH) : undefined;
const goods: Good[] = assembleCatalog({
  tokenGoods: stampMissing(tokenLoaded.goods, tokenAtMs),
  tokenFromFile: tokenLoaded.fromFile,
  tokenAt: tokenAtMs,
  restGoods: stampMissing(restGoodsRaw, restAtMs),
  restAt: restAtMs,
});
import { normalizeSearchText, tokenizeSearchText } from "../search/search-normalization.ts";
import {
  formCorrectionFor,
  formKeysOfTokens,
  formSurfaceTokens,
  isFuzzyCandidate,
  isHardToken
} from "../search/fuzzy-match.ts";
import { selectionHistoryStore } from "../services/selection-history-store.ts";
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

/**
 * Exact token match (F2): equality, substring containment, or the
 * precomputed adjacent-token concatenation («آموکسیسیلین» written joined
 * matches the catalog's two tokens «آموکسی»+«سیلین»). NO edit distance
 * lives here any more — before F2 a Levenshtein≤1 check sat inside the
 * exact path, so a typo silently returned a neighbouring product's price
 * as if it were the answer (Prime R2-4: «آسپرین» → 380 junk hits, the
 * aseptine douche among them; «سیتریزین» → only the wrong «ستریزین»
 * capsule). Typos are now the guarded fuzzy tier's job (searchFuzzy).
 */
function exactTokenMatch(token, candidateToken) {
  return candidateToken === token || candidateToken.includes(token);
}

function matchesToken(token, entry) {
  if (entry.concatTokens.has(token)) {
    return true;
  }
  return (
    entry.fieldTokens.some((tokens) =>
      tokens.some((candidateToken) => exactTokenMatch(token, candidateToken))
    ) || entry.fields.some((field) => field.includes(token))
  );
}

/**
 * One entry against the fuzzy plan. Returns the per-token correction map
 * when the entry matches, null otherwise. Guards (all hard):
 * - form guard: a form stated in the query must be the entry's form —
 *   an entry whose form cannot be verified is rejected, not guessed;
 * - hard tokens (strengths, units, forms) match exactly or not at all;
 * - soft tokens match exactly or within Damerau distance 1.
 * The returned map holds only the tokens that actually used the fuzz;
 * the caller decides whether a hit counts as a fuzzy result at all.
 */
function fuzzyEntryMatch(entry, hardTokens, softTokens, queryFormKeys, headTokens) {
  if (queryFormKeys.length > 0) {
    if (entry.formKeys.length === 0) {
      return null;
    }
    if (!queryFormKeys.some((key) => entry.formKeys.includes(key))) {
      return null;
    }
  }
  for (const token of hardTokens) {
    if (!matchesToken(token, entry)) {
      return null;
    }
  }
  const corrections = new Map();
  for (const token of softTokens) {
    if (matchesToken(token, entry)) {
      continue;
    }
    const candidates = new Set();
    for (const tokens of entry.fieldTokens) {
      for (const candidateToken of tokens) {
        // Generic-position candidates only: a correction may land on a
        // token that heads a catalog title (a generic name), never on a
        // brand-only token. «آسپرین» → «آسپتین» (a douche brand that
        // heads nothing) is the leak this rule exists to close — under
        // the hard guard, that query is an honest miss, not a labeled
        // suggestion carrying the wrong product's price.
        if (headTokens.has(candidateToken) && isFuzzyCandidate(token, candidateToken)) {
          candidates.add(candidateToken);
        }
      }
    }
    // Joined generic names: «اموکسیسیلین» typed as one word (with a
    // one-edit slip) against the title's leading pair — the pair is
    // head-anchored by construction, so the same guard holds.
    for (const concat of entry.titleConcatTokens) {
      if (isFuzzyCandidate(token, concat)) {
        candidates.add(concat);
      }
    }
    if (candidates.size === 0) {
      return null;
    }
    corrections.set(token, candidates);
  }
  return corrections;
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
 * identical for every query, so it is computed once at load. F2 adds two
 * precomputed indexes per entry: adjacent-token concatenations (joined
 * spellings) and the entry's dosage-form keys (the fuzzy form guard).
 */
interface SearchableGood {
  good: Good;
  /** Normalized whole-field candidates. */
  fields: string[];
  /** Pre-split token lists of each field. */
  fieldTokens: string[][];
  /** Adjacent token pairs of each field, joined («آموکسی»+«سیلین»). */
  concatTokens: Set<string>;
  /**
   * The LEADING adjacent pair of each title («آموکسی»+«سیلین» from
   * «آموکسی سیلین 500…») — the generic name written as one word. The
   * only concat the fuzzy tier may target: head-anchored by
   * construction, so a joined brand pair can never carry a correction.
   */
  titleConcatTokens: Set<string>;
  /** Canonical dosage-form keys this entry carries. */
  formKeys: string[];
}

export function buildSearchableEntry(good: Good): SearchableGood {
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
  const fieldTokens = fields.map((field) => field.split(/\s+/).filter(Boolean));
  const concatTokens = new Set<string>();
  for (const tokens of fieldTokens) {
    for (let i = 0; i < tokens.length - 1; i++) {
      concatTokens.add(tokens[i] + tokens[i + 1]);
    }
  }
  const titleConcatTokens = new Set<string>();
  for (const title of [good.persianTitle, good.englishTitle]) {
    const tokens = normalizeSearchText(title ?? "")
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length >= 2) {
      titleConcatTokens.add(tokens[0] + tokens[1]);
    }
  }
  return {
    good,
    fields,
    fieldTokens,
    concatTokens,
    titleConcatTokens,
    formKeys: formKeysOfTokens(fieldTokens.flat())
  };
}

const searchableGoods: SearchableGood[] = goods.map(buildSearchableEntry);

/** Exact tier over an explicit entry list (the seam tests run against). */
export function exactSearchEntries(entries: SearchableGood[], query: string): Good[] {
  const term = normalizeSearchText(query ?? "");
  const tokens = tokenize(term);

  if (!term) {
    return entries.slice(0, 20).map((entry) => entry.good);
  }

  return entries
    .filter((entry) => tokens.every((token) => matchesToken(token, entry)))
    .map((entry) => entry.good)
    .sort(
      (left, right) => scoreGood(term, tokens, right, query) - scoreGood(term, tokens, left, query)
    );
}

const headTokensCache = new WeakMap<SearchableGood[], Set<string>>();

/** First tokens of the catalog's titles (the generic names), cached per entry list. */
function headTokensOf(entries: SearchableGood[]): Set<string> {
  let heads = headTokensCache.get(entries);
  if (!heads) {
    heads = new Set<string>();
    for (const entry of entries) {
      for (const title of [entry.good.persianTitle, entry.good.englishTitle]) {
        const head = normalizeSearchText(title ?? "").split(" ")[0];
        if (head) {
          heads.add(head);
        }
      }
    }
    headTokensCache.set(entries, heads);
  }
  return heads;
}

export interface FuzzyOutcome {
  /** The corrected token (single-token corrections) or corrected query; null when ambiguous. */
  matchedTerm: string | null;
  /** True when the typo maps to more than one distinct catalog token — suggestions, never one price. */
  ambiguous: boolean;
  corrections: { from: string; to: string[] }[];
}

/**
 * Guarded fuzzy tier over an explicit entry list. Runs ONLY when the
 * exact tier found nothing (the caller enforces that order). Returns the
 * matched goods plus the correction report the presenters label with —
 * fuzzy results are «نتیجه‌ی نزدیک», never silent exact answers.
 */
export function searchFuzzyEntries(
  entries: SearchableGood[],
  query: string
): { goods: Good[]; fuzzy: FuzzyOutcome | null } {
  const term = normalizeSearchText(query ?? "");
  const tokens = tokenize(term);
  if (!term || tokens.length === 0) {
    return { goods: [], fuzzy: null };
  }
  const hardTokens = tokens.filter((token) => isHardToken(token));
  const softTokens = tokens.filter((token) => !isHardToken(token));
  if (softTokens.length === 0) {
    return { goods: [], fuzzy: null };
  }
  const queryFormKeys = formKeysOfTokens(tokens);

  // Head tokens = first tokens of catalog titles (the generic names).
  // Fuzzy corrections may only target these (see fuzzyEntryMatch), so a
  // brand-only near-token can never carry a hit at all.
  const headTokens = headTokensOf(entries);

  // Mistyped form words («قرث») resolve inside the closed form
  // vocabulary before matching: the token leaves the identity set, its
  // family joins the form guard, and the correction is reported like
  // any other. A token that heads a catalog title is a real generic
  // («کروم» — Damerau-1 from the cream surface «کرم») and is never
  // stolen into a form family.
  const identityTokens: string[] = [];
  const formCorrections: { from: string; to: string[] }[] = [];
  for (const token of softTokens) {
    const family = headTokens.has(token) ? null : formCorrectionFor(token);
    if (family) {
      if (!queryFormKeys.includes(family)) {
        queryFormKeys.push(family);
      }
      const surfaces = formSurfaceTokens(family);
      const surface = surfaces.find((s) => /[^\x00-\x7F]/.test(s)) ?? surfaces[0] ?? family;
      formCorrections.push({ from: token, to: [surface] });
    } else {
      identityTokens.push(token);
    }
  }
  if (identityTokens.length === 0) {
    // No drug identity at all: every soft token was a (mistyped) form
    // word — «قرث», «قرث 500». A form alone names no drug; answering
    // with every tablet in the catalog is a confident wrong answer at
    // scale (thousands of priced hits, seconds of scoring). Honest
    // miss — the same zero-identity discipline as the web adapter.
    return { goods: [], fuzzy: null };
  }

  const hits: SearchableGood[] = [];
  const union = new Map<string, Set<string>>();
  for (const entry of entries) {
    const corrections = fuzzyEntryMatch(entry, hardTokens, identityTokens, queryFormKeys, headTokens);
    if (!corrections) {
      continue;
    }
    // A form correction alone is a real fuzzy use; an entry that matched
    // every identity token exactly still counts when a form word was
    // corrected — but not when nothing was corrected at all.
    if (corrections.size === 0 && formCorrections.length === 0) {
      continue;
    }
    hits.push(entry);
    for (const [from, candidates] of corrections) {
      const set = union.get(from) ?? new Set<string>();
      for (const candidate of candidates) {
        set.add(candidate);
      }
      union.set(from, set);
    }
  }
  if (hits.length === 0) {
    return { goods: [], fuzzy: null };
  }

  const corrections = [
    ...formCorrections,
    ...[...union.entries()].map(([from, set]) => ({ from, to: [...set] }))
  ];
  const ambiguous = corrections.some((c) => c.to.length > 1);
  let matchedTerm: string | null = null;
  if (!ambiguous) {
    // The full corrected query, token by token. Naming only the single
    // corrected token would ask «منظورتان «قرص» بود؟» when the drug
    // name was typed correctly and only its form word slipped.
    const byToken = new Map(corrections.map((c) => [c.from, c.to[0]]));
    matchedTerm = tokens.map((token) => byToken.get(token) ?? token).join(" ");
  }

  const sorted = hits
    .map((entry) => entry.good)
    .sort(
      (left, right) => scoreGood(term, tokens, right, query) - scoreGood(term, tokens, left, query)
    );
  return { goods: sorted, fuzzy: { matchedTerm, ambiguous, corrections } };
}

export const goodsRepository = {
  search(input) {
    return exactSearchEntries(searchableGoods, input?.query ?? "");
  },

  /** Guarded fuzzy tier over the live catalog — see searchFuzzyEntries. */
  searchFuzzy(input) {
    return searchFuzzyEntries(searchableGoods, input?.query ?? "");
  },

  getById(id) {
    return goods.find((good) => good.id === id) ?? null;
  }
};

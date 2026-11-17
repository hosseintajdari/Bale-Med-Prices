/**
 * Guarded fuzzy token matching (F2 — Prime R2-3/R2-4).
 *
 * The fuzzy tier exists for ONE purpose: a common typo must not lose a
 * drug that the catalog actually carries. Its hard rule, from the
 * decisions registry: a wrong price is worse than "not found", so this
 * module only ever answers "within one edit" — Damerau distance ≤ 1,
 * where an adjacent transposition (سیتریزین ↔ ستیریزین) counts as one
 * edit. Plain Levenshtein scores a transposition as 2, which is why the
 * old matcher caught prefix typos only (~25% of the typo class).
 *
 * Callers own the rest of the guard (form/strength/ambiguity checks in
 * goods-repository); this module owns the distance and the token classes:
 * strength, dose-unit and dosage-form tokens are HARD — they may never
 * be fuzzed, because a fuzzed "80" or "شربت" changes the product, not
 * the spelling.
 */
import { normalizeSearchText } from "./search-normalization.ts";

/** Canonical dosage-form keys and their Persian/English surface tokens (post-normalization). */
export const FORM_ALIASES: ReadonlyMap<string, readonly string[]> = new Map([
  ["tablet", ["tablet", "tab", "قرص"]],
  ["capsule", ["capsule", "cap", "کپسول"]],
  ["softgel", ["softgel", "سافت ژل", "سافت‌ژل", "سافت"]],
  ["syrup", ["syrup", "شربت"]],
  ["drop", ["drop", "drops", "قطره"]],
  ["ointment", ["ointment", "پماد"]],
  ["cream", ["cream", "کرم"]],
  ["suppository", ["suppository", "supp", "شیاف"]],
  ["injection", ["injection", "ampule", "ampoule", "آمپول", "تزریقی", "ویال"]],
  ["spray", ["spray", "اسپری"]],
  ["powder", ["powder", "پودر"]],
  ["sachet", ["sachet", "ساشه"]],
  ["solution", ["solution", "محلول"]],
  ["gel", ["gel", "ژل"]],
  ["lotion", ["lotion", "لوسیون"]],
  ["shampoo", ["shampoo", "شامپو"]]
]);

const FORM_TOKEN_TO_KEY = new Map<string, string>();
for (const [key, aliases] of FORM_ALIASES) {
  for (const alias of aliases) {
    FORM_TOKEN_TO_KEY.set(normalizeSearchText(alias), key);
  }
}

/** Dose/unit tokens: they pin down strength or pack size, never identity. */
const UNIT_TOKENS = new Set([
  "mg", "ml", "gr", "g", "iu", "mcg",
  "میلی", "گرم", "لیتر", "میلیلیتر", "میلی‌لیتر", "واحد",
  "عددی", "عدد", "درصد", "%"
]);

/** Canonical form key for one normalized token, or undefined. */
export function formKeyOfToken(token: string): string | undefined {
  return FORM_TOKEN_TO_KEY.get(token);
}

/**
 * Correct a mistyped dosage-form word («قرث» → قرص/tablet). This is the
 * ONE place a short token may fuzz, and it is safe by construction: the
 * candidates are the closed form vocabulary only (never catalog identity
 * tokens), the correction must resolve to exactly ONE form family, and
 * the caller still requires the drug's identity tokens to match on their
 * own merits. Returns the canonical family key, or null.
 */
export function formCorrectionFor(token: string): string | null {
  if (!token || token.length < 3 || FORM_TOKEN_TO_KEY.has(token)) {
    return null;
  }
  const families = new Set<string>();
  for (const [vocabToken, family] of FORM_TOKEN_TO_KEY) {
    if (Math.abs(vocabToken.length - token.length) <= 1 && damerauWithinOne(token, vocabToken)) {
      families.add(family);
    }
  }
  return families.size === 1 ? [...families][0] : null;
}

/** Surface tokens of one form family (for correction reporting). */
export function formSurfaceTokens(family: string): string[] {
  return [...(FORM_ALIASES.get(family) ?? [])];
}

/** Canonical form keys named by a token list (query or title), in first-seen order. */
export function formKeysOfTokens(tokens: readonly string[]): string[] {
  const keys: string[] = [];
  for (const token of tokens) {
    const key = FORM_TOKEN_TO_KEY.get(token);
    if (key && !keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * A hard token pins the product down (strength number, unit, dosage
 * form). Hard tokens must match exactly — fuzzing one is how «آسپرین ۸۰»
 * ends up priced as a 140 ml antiseptic.
 */
export function isHardToken(token: string): boolean {
  if (!token) return true;
  if (/^\d+$/.test(token)) return true;
  if (UNIT_TOKENS.has(token)) return true;
  return FORM_TOKEN_TO_KEY.has(token);
}

/** An identity token is what a fuzzy match is allowed to be ABOUT. */
export function isIdentityToken(token: string): boolean {
  return token.length > 1 && !isHardToken(token);
}

/**
 * True when `left` and `right` are within Damerau distance 1: equal, one
 * substitution, one insertion/deletion, or one adjacent transposition.
 * Bounded by construction — no DP table, O(n) per pair.
 */
export function damerauWithinOne(left: string, right: string): boolean {
  if (left === right) return true;
  const a = [...left];
  const b = [...right];
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  if (la === lb) {
    // Substitution (one differing position) or adjacent transposition
    // (two differing positions that are swaps of each other).
    let first = -1;
    let second = -1;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        if (first === -1) first = i;
        else if (second === -1) second = i;
        else return false;
      }
    }
    if (second === -1) return first !== -1; // exactly one substitution
    return second === first + 1 && a[first] === b[second] && a[second] === b[first];
  }

  // One insertion/deletion: walk the shorter over the longer, one skip.
  const short = la < lb ? a : b;
  const long = la < lb ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
    } else {
      if (skipped) return false;
      skipped = true;
      j++;
    }
  }
  return true;
}

/**
 * The fuzzy gate for one token pair: both sides long enough to carry a
 * drug name (≥5 chars — shorter tokens fuzz into unrelated words), length
 * gap ≤ 1, Damerau distance ≤ 1. Exact equality is the caller's exact
 * tier, not this one, but returns true here as well for convenience.
 */
export function isFuzzyCandidate(token: string, candidate: string): boolean {
  if (!token || !candidate) return false;
  if (token.length < 5 || candidate.length < 5) return false;
  if (Math.abs(token.length - candidate.length) > 1) return false;
  return damerauWithinOne(token, candidate);
}

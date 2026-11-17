import { normalizeSearchText, tokenizeSearchText } from "./search-normalization.ts";

/**
 * Conversational filler tokens (post-normalization form). Real users ask
 * like pharmacists' customers talk — «قیمت آموکسی‌سیلین چنده» — and the
 * catalog contains no product named «چنده», so an unstripped sentence
 * matches nothing (Prime QA round 2, class A10: 0/8). These tokens carry
 * no product identity and are dropped before matching. Deliberately NOT
 * included: «چند» (can belong to a strength/count question). Known
 * tradeoff: «من»/«می»/«برای» also occur inside a few product names
 * («اکتی من», «بیوتی می», «… برای سوسپانسیون») — safe because the raw
 * query always searches first; stripping only shapes the RETRY query,
 * where the pronoun reading is the common one.
 */
const FILLER_TOKENS = new Set([
  "قیمت",
  "چنده",
  "چقدر",
  "دارید",
  "دارین",
  "داره",
  "داری",
  "دارم",
  "میخوام",
  "خوام",
  "خواستم",
  "می",
  "بگید",
  "بگو",
  "میشه",
  "سلام",
  "لطفا",
  "برای",
  "من",
  "رو",
  "را",
  "هزینه",
  "موجود",
  "است",
  "هست",
  "ممنون"
]);

const MAX_RAW_LENGTH = 100;
const MAX_QUERY_TOKENS = 6;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Reduce a free-form user message to the drug-identifying core query:
 * filler words and symbol-only tokens (emoji, `_`, `%`, quotes) removed,
 * length and token count capped. Returns "" when nothing drug-like
 * remains — callers treat that as an honest not-found WITHOUT scanning
 * the catalog or fanning out to the web (the symbol-only queries were
 * the Prime R2-5 hang class).
 */
export function normalizeUserQuery(raw) {
  const capped = String(raw ?? "").slice(0, MAX_RAW_LENGTH);
  const tokens = tokenizeSearchText(capped)
    .map((token) => token.replace(/[؟?!.]+$/u, ""))
    .filter((token) => HAS_LETTER_OR_DIGIT.test(token) && !FILLER_TOKENS.has(token));
  return tokens.slice(0, MAX_QUERY_TOKENS).join(" ");
}

/**
 * Split a normalized query on the conjunction tokens «و» / «یا» so a
 * two-drug question («متفورمین و لوزارتان») can be answered by merging
 * per-part results. Only used as a fallback after the whole query found
 * nothing, so real combination products («استامینوفن و کافئین», which DO
 * match whole) are never split apart.
 */
export function splitCompoundQuery(normalizedQuery) {
  const tokens = String(normalizedQuery ?? "").split(/\s+/).filter(Boolean);
  const parts = [[]];
  for (const token of tokens) {
    if (token === "و" || token === "یا") {
      parts.push([]);
    } else {
      parts[parts.length - 1].push(token);
    }
  }
  const joined = parts.map((part) => part.join(" ")).filter(Boolean);
  return joined.length >= 2 ? joined : [];
}

export function normalizedFormOf(raw) {
  return tokenizeSearchText(String(raw ?? "")).join(" ");
}

export { normalizeSearchText };

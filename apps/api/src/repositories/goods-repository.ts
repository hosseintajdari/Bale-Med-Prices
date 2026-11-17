import { goods } from "../data/mock-data.ts";
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

const MAX_QUERY_LENGTH = 200;
const MAX_SEARCH_RESULTS = 50;
const FUZZY_MAX_DISTANCE = 1;

/**
 * Fixes #23 (part): edit distance with early exit — bails as soon as the
 * current DP row's minimum exceeds maxDistance instead of computing the full
 * O(m·n) matrix for every token pair.
 */
function levenshteinWithin(left, right, maxDistance) {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return false;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      );

      current[rightIndex] = value;

      if (value < rowMinimum) {
        rowMinimum = value;
      }
    }

    if (rowMinimum > maxDistance) {
      return false;
    }

    previous = current;
  }

  return previous[right.length] <= maxDistance;
}

function fuzzyTokenMatch(token, candidate) {
  if (!token || !candidate) {
    return false;
  }

  if (candidate.includes(token)) {
    return true;
  }

  if (token.length < 5 || candidate.length < 5) {
    return DOSAGE_FORM_TOKENS.has(candidate) && levenshteinWithin(token, candidate, FUZZY_MAX_DISTANCE);
  }

  return levenshteinWithin(token, candidate, FUZZY_MAX_DISTANCE);
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

export const goodsRepository = {
  search(input) {
    // Fixes #23 (part): cap the query length so a very long `q` cannot burn
    // CPU in the fuzzy matcher.
    const query = String(input?.query ?? "").slice(0, MAX_QUERY_LENGTH);
    const term = normalizeSearchText(query);
    const tokens = tokenize(term);

    if (!term) {
      return goods.slice(0, 20);
    }

    return goods
      .filter((good) => {
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
          // Fixes #24: a catalog record missing `aliases` used to throw a
          // TypeError here and (via the synchronous controller call) crash
          // the whole Node process.
          ...(good.aliases ?? [])
        ].filter(Boolean);

        const searchableTerms = haystacks.map((value) => normalizeSearchText(value));
        return tokens.every((token) =>
          searchableTerms.some((candidate) =>
            candidate
              .split(/\s+/)
              .some((candidateToken) => fuzzyTokenMatch(token, candidateToken)) ||
            fuzzyTokenMatch(token, candidate)
          )
        );
      })
      .sort(
        (left, right) => scoreGood(term, tokens, right, query) - scoreGood(term, tokens, left, query)
      )
      // Fixes #23 (part): cap the result set — no pagination yet, but a
      // single query can no longer return an unbounded list.
      .slice(0, MAX_SEARCH_RESULTS);
  },

  getById(id) {
    return goods.find((good) => good.id === id) ?? null;
  }
};

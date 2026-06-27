import { goods } from "../data/mock-data.ts";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
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

function normalizeDigits(value) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    if (persianIndex >= 0) {
      return String(persianIndex);
    }

    return String(ARABIC_DIGITS.indexOf(digit));
  });
}

function normalizeText(value) {
  return normalizeDigits(String(value ?? ""))
    .trim()
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\/\\|,;:_+()[\]{}<>]/g, " ")
    .replace(/(?<=\p{L})[-.](?=\d)/gu, " ")
    .replace(/(?<=\d)[-.](?=\p{L})/gu, " ")
    .replace(/(\p{L})(\d)/gu, "$1 $2")
    .replace(/(\d)(\p{L})/gu, "$1 $2")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌\u200c]/g, " ")
    .replace(/میلی\s*گرم/g, "mg")
    .replace(/م\s*\.?\s*گ/g, "mg")
    .replace(/milligrams?/g, "mg")
    .replace(/\s+/g, " ");
}

function tokenize(term) {
  return normalizeText(term)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
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

  if (token.length < 5 || candidate.length < 5) {
    return DOSAGE_FORM_TOKENS.has(candidate) && levenshteinDistance(token, candidate) <= 1;
  }

  return levenshteinDistance(token, candidate) <= 1;
}

export const goodsRepository = {
  search(input) {
    const term = normalizeText(input?.query ?? "");
    const tokens = tokenize(term);

    if (!term) {
      return goods.slice(0, 20);
    }

    return goods.filter((good) => {
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

      const searchableTerms = haystacks.map((value) => normalizeText(value));
      return tokens.every((token) =>
        searchableTerms.some((candidate) =>
          candidate
            .split(/\s+/)
            .some((candidateToken) => fuzzyTokenMatch(token, candidateToken)) ||
          fuzzyTokenMatch(token, candidate)
        )
      );
    });
  },

  getById(id) {
    return goods.find((good) => good.id === id) ?? null;
  }
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeSearchDigits(value) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    if (persianIndex >= 0) {
      return String(persianIndex);
    }

    return String(ARABIC_DIGITS.indexOf(digit));
  });
}

export function normalizeSearchText(value) {
  return normalizeSearchDigits(String(value ?? ""))
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

export function tokenizeSearchText(term) {
  return normalizeSearchText(term)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * Shared price formatting — the دکترپسند contract for مد اگریگیتور.
 *
 * Single home for how a price is written, used by web and every bot
 * (Telegram, Bale, WhatsApp). Hard rules:
 * - a price is ALWAYS labeled in Rial; a bare number is forbidden
 * - toman is shown in parentheses (rial / 10)
 * - Persian digits with ٬ thousands separators
 * - every price carries its age: «قیمت امروز» / «قیمت دیروز» / «قیمت N روز پیش»
 */

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Latin digits → Persian digits. */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** 450000 → "450,000" with ٬ separators (Latin digits, separator only). */
function groupThousands(latin: string): string {
  return latin.replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
}

/**
 * 450000 → "۴۵۰٬۰۰۰". Throws on non-finite or negative input —
 * a bad price must fail loud, never render silently wrong.
 */
export function formatGroupedFa(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`formatGroupedFa: expected a finite non-negative number, got ${n}`);
  }
  return toPersianDigits(groupThousands(String(Math.round(n))));
}

/**
 * The canonical price line: «۴۵۰٬۰۰۰ ریال (۴۵٬۰۰۰ تومان)».
 * Rial is primary (official), toman parenthesized (pharmacy counter speech).
 */
export function formatPriceFa(priceRial: number): string {
  if (!Number.isFinite(priceRial) || priceRial < 0) {
    throw new Error(`formatPriceFa: expected a finite non-negative rial price, got ${priceRial}`);
  }
  const rial = Math.round(priceRial);
  const toman = Math.round(rial / 10);
  return `${formatGroupedFa(rial)} ریال (${formatGroupedFa(toman)} تومان)`;
}

/**
 * Display labels for price sources — the pharmacist recognizes «داروکده»,
 * not the raw adapter id "darukade". Unknown ids pass through unchanged.
 */
const SOURCE_LABELS_FA: Record<string, string> = {
  darukade: "داروکده",
  delgarm: "دلگرم",
  torob: "ترب"
};

export function sourceLabelFa(sourceName: string | undefined): string {
  const name = (sourceName ?? "").trim();
  return SOURCE_LABELS_FA[name] ?? name;
}

/** Prices at least this old are stale: labelled «کهنه» and demoted (D2). */
export const STALE_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between a crawl timestamp and now; null when unusable. */
export function priceAgeDays(crawledAtIso: string | undefined, nowMs: number = Date.now()): number | null {
  if (!crawledAtIso) {
    return null;
  }
  const crawledMs = Date.parse(crawledAtIso);
  if (Number.isNaN(crawledMs)) {
    return null;
  }
  return Math.max(0, Math.floor((nowMs - crawledMs) / DAY_MS));
}

export function isStalePrice(crawledAtIso: string | undefined, nowMs: number = Date.now()): boolean {
  const days = priceAgeDays(crawledAtIso, nowMs);
  return days !== null && days >= STALE_AFTER_DAYS;
}

// --- Gregorian → Jalali (standard arithmetic conversion, no dependency) ---
const JALALI_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
];

function div(a: number, b: number): number {
  return Math.floor(a / b);
}

function toJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const jy = gy <= 1600 ? 0 : 979;
  const gy2 = gy <= 1600 ? gy - 621 : gy - 1600;
  const days =
    365 * gy2 + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + gdm[gm - 1];
  let j = jy + 33 * div(days, 12053);
  let d = days % 12053;
  j += 4 * div(d, 1461);
  d %= 1461;
  if (d >= 366) {
    j += div(d - 1, 365);
    d = (d - 1) % 365;
  }
  const jm = d < 186 ? 1 + div(d, 31) : 7 + div(d - 186, 30);
  const jd = 1 + (d < 186 ? d % 31 : (d - 186) % 30);
  return { jy: j, jm, jd };
}

/** ISO timestamp → «۲۳ مهر ۱۴۰۵» (Jalali, Persian digits); null when unusable. */
export function formatJalaliDateFa(iso: string | undefined): string | null {
  if (!iso) {
    return null;
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return null;
  }
  const date = new Date(ms);
  const { jy, jm, jd } = toJalali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return `${toPersianDigits(jd)} ${JALALI_MONTHS_FA[jm - 1]} ${toPersianDigits(jy)}`;
}

/**
 * The meta line under every price (owner order 2026-10-29): the UPDATE DATE
 * replaces the source name — drug prices are updated in TTAC (تیتک); whoever
 * carried the price (واسط) is irrelevant to the reader. Stale prices keep
 * their «کهنه» flag. Missing/invalid date → «تاریخ به‌روزرسانی نامشخص»
 * (honest, never silent).
 */
export function formatUpdateLine(crawledAtIso: string | undefined, nowMs: number = Date.now()): string {
  const fa = formatJalaliDateFa(crawledAtIso);
  if (!fa) {
    return "تاریخ به‌روزرسانی نامشخص";
  }
  const stale = isStalePrice(crawledAtIso, nowMs) ? " — کهنه" : "";
  return `به‌روزرسانی: ${fa}${stale}`;
}

/**
 * Price age in plain Persian. The bot must NEVER stay silent about staleness.
 * Invalid/missing timestamp → «تاریخ نامشخص» (honest, not silent).
 */
export function priceAgeFa(crawledAtIso: string | undefined, nowMs: number = Date.now()): string {
  if (!crawledAtIso) {
    return "تاریخ نامشخص";
  }
  const crawledMs = Date.parse(crawledAtIso);
  if (Number.isNaN(crawledMs)) {
    return "تاریخ نامشخص";
  }
  const days = Math.max(0, Math.floor((nowMs - crawledMs) / DAY_MS));
  if (days === 0) {
    return "قیمت امروز";
  }
  if (days === 1) {
    return "قیمت دیروز";
  }
  return `قیمت ${toPersianDigits(days)} روز پیش`;
}

export interface PriceBlockInput {
  productName: string;
  priceRial: number;
  /** Display label of the source, e.g. "داروکده" or adapter name. */
  sourceLabel: string;
  crawledAt?: string;
}

/**
 * One full doctor-friendly price block:
 *   آموکسی‌سیلین ۵۰۰
 *   ۴۵۰٬۰۰۰ ریال (۴۵٬۰۰۰ تومان)
 *   منبع: داروکده — قیمت ۳ روز پیش
 */
export function formatPriceBlock(input: PriceBlockInput, nowMs: number = Date.now()): string {
  const name = (input.productName ?? "").trim() || "نامشخص";
  const price = formatPriceFa(input.priceRial);
  // Owner order 2026-10-29: update date instead of the source name —
  // `sourceLabel` stays in the input contract for other surfaces, but the
  // doctor-grade block no longer prints the intermediary's name.
  return `${name}\n${price}\n${formatUpdateLine(input.crawledAt, nowMs)}`;
}

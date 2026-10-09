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

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const source = (input.sourceLabel ?? "").trim() || "نامشخص";
  const age = priceAgeFa(input.crawledAt, nowMs);
  return `${name}\n${price}\nمنبع: ${source} — ${age}`;
}

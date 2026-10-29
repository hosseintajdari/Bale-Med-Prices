import test from "node:test";
import assert from "node:assert/strict";
import {
  toPersianDigits,
  formatGroupedFa,
  formatPriceFa,
  priceAgeFa,
  formatPriceBlock,
  formatJalaliDateFa,
  formatUpdateLine,
  sourceLabelFa
} from "./format-price.ts";

test("toPersianDigits converts Latin digits", () => {
  assert.equal(toPersianDigits(450000), "۴۵۰۰۰۰");
  assert.equal(toPersianDigits("abc123"), "abc۱۲۳");
});

test("formatGroupedFa groups thousands with ٬", () => {
  assert.equal(formatGroupedFa(450000), "۴۵۰٬۰۰۰");
  assert.equal(formatGroupedFa(999), "۹۹۹");
  assert.equal(formatGroupedFa(0), "۰");
});

test("formatGroupedFa rejects bad input loudly", () => {
  assert.throws(() => formatGroupedFa(-5), /finite non-negative/);
  assert.throws(() => formatGroupedFa(NaN), /finite non-negative/);
});

test("formatPriceFa renders the canonical دکترپسند line", () => {
  assert.equal(formatPriceFa(450000), "۴۵۰٬۰۰۰ ریال (۴۵٬۰۰۰ تومان)");
  assert.equal(formatPriceFa(1240000), "۱٬۲۴۰٬۰۰۰ ریال (۱۲۴٬۰۰۰ تومان)");
});

test("formatPriceFa rejects a bare/invalid price", () => {
  assert.throws(() => formatPriceFa(-1), /non-negative rial price/);
  assert.throws(() => formatPriceFa(Infinity), /non-negative rial price/);
});

test("priceAgeFa labels freshness in Persian", () => {
  const now = new Date("2026-10-09T12:00:00Z").getTime();
  assert.equal(priceAgeFa("2026-10-09T08:00:00Z", now), "قیمت امروز");
  assert.equal(priceAgeFa("2026-10-08T08:00:00Z", now), "قیمت دیروز");
  assert.equal(priceAgeFa("2026-10-06T08:00:00Z", now), "قیمت ۳ روز پیش");
  assert.equal(priceAgeFa("2026-09-01T08:00:00Z", now), "قیمت ۳۸ روز پیش");
});

test("priceAgeFa never stays silent on bad dates", () => {
  assert.equal(priceAgeFa(undefined), "تاریخ نامشخص");
  assert.equal(priceAgeFa("not-a-date"), "تاریخ نامشخص");
});

test("formatPriceBlock composes the full block", () => {
  const now = new Date("2026-10-09T12:00:00Z").getTime();
  const block = formatPriceBlock(
    {
      productName: "آموکسی‌سیلین ۵۰۰",
      priceRial: 450000,
      sourceLabel: "داروکده",
      crawledAt: "2026-10-06T08:00:00Z"
    },
    now
  );
  assert.equal(
    block,
    "آموکسی‌سیلین ۵۰۰\n۴۵۰٬۰۰۰ ریال (۴۵٬۰۰۰ تومان)\nبه‌روزرسانی: ۱۴ مهر ۱۴۰۵"
  );
});

test("formatJalaliDateFa converts and formatUpdateLine flags stale prices", () => {
  assert.equal(formatJalaliDateFa("2026-10-06T08:00:00Z"), "۱۴ مهر ۱۴۰۵");
  assert.equal(formatJalaliDateFa("2026-03-21T00:00:00Z"), "۱ فروردین ۱۴۰۵");
  assert.equal(formatJalaliDateFa(undefined), null);
  assert.equal(formatJalaliDateFa("not-a-date"), null);
  const now = new Date("2026-10-29T00:00:00Z").getTime();
  assert.equal(formatUpdateLine("2026-10-28T00:00:00Z", now), "به‌روزرسانی: ۶ آبان ۱۴۰۵");
  assert.equal(formatUpdateLine("2026-10-06T00:00:00Z", now), "به‌روزرسانی: ۱۴ مهر ۱۴۰۵ — کهنه");
  assert.equal(formatUpdateLine(undefined, now), "تاریخ به‌روزرسانی نامشخص");
});

test("sourceLabelFa maps adapter ids to the names pharmacists know", () => {
  assert.equal(sourceLabelFa("darukade"), "داروکده");
  assert.equal(sourceLabelFa("delgarm"), "دلگرم");
  assert.equal(sourceLabelFa("torob"), "ترب");
  assert.equal(sourceLabelFa("ttac"), "ttac");
  assert.equal(sourceLabelFa(undefined), "");
});

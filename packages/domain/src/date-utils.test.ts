import test from "node:test";
import assert from "node:assert/strict";
import { toComparableDate, isDateOnOrAfter, compareDatesDesc } from "./date-utils.ts";
import { calculateTax } from "./rules/calculate-tax.ts";

test("toComparableDate zero-pads non-padded DateStrings (#48)", () => {
  assert.equal(toComparableDate("2024-1-15"), "2024-01-15");
  assert.equal(toComparableDate("2024-01-15"), "2024-01-15");
});

test("isDateOnOrAfter compares non-padded dates correctly (#48)", () => {
  assert.equal(isDateOnOrAfter("2024-1-15", "2024-01-09"), true);
  assert.equal(isDateOnOrAfter("2024-1-9", "2024-01-15"), false);
  assert.equal(isDateOnOrAfter("2024-01-15", "2024-1-15"), true);
});

test("compareDatesDesc orders non-padded dates correctly (#48)", () => {
  assert.ok(compareDatesDesc("2024-1-9", "2024-1-15") > 0);
  assert.ok(compareDatesDesc("2024-1-15", "2024-1-9") < 0);
});

test("calculateTax picks the right rate for non-padded dates (#48)", () => {
  const taxData = {
    code: "T",
    title: "T",
    averageTaxes: [
      { date: "2024-1-9", averageTax: 100 },
      { date: "2024-1-15", averageTax: 200 }
    ]
  };

  const result = calculateTax({
    quantity: 1,
    documentDate: "2024-1-20",
    taxData,
    taxMultiplier: 1,
    roundingRule: "round"
  });

  assert.equal(result.appliedRate.date, "2024-1-15");
  assert.equal(result.totalTax, 200);
});

test("calculateTax rejects an out-of-range taxMultiplier (#28)", () => {
  const taxData = {
    code: "T",
    title: "T",
    averageTaxes: [{ date: "2025-01-01", averageTax: 100 }]
  };
  const base = {
    quantity: 1,
    documentDate: "2025-06-01",
    taxData,
    roundingRule: "round"
  };

  assert.throws(() => calculateTax({ ...base, taxMultiplier: 1.5 }), /taxMultiplier/);
  assert.throws(() => calculateTax({ ...base, taxMultiplier: -0.1 }), /taxMultiplier/);
  assert.throws(() => calculateTax({ ...base, taxMultiplier: Number.NaN }), /taxMultiplier/);

  const ok = calculateTax({ ...base, taxMultiplier: 0.75 });
  assert.equal(ok.tollAmount, 25);
});

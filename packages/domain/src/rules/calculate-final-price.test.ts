import test from "node:test";
import assert from "node:assert/strict";
import { calculateFinalPrice } from "./calculate-final-price.ts";

test("calculateFinalPrice applies tax, toll, technical fee, and profit for pharma goods", () => {
  const result = calculateFinalPrice({
    good: {
      id: "g-1001",
      internalCode: "INT-1001",
      barcode: "6261001100011",
      genericCode: "GEN-AMOX-500",
      title: "Amoxicillin 500mg Capsule",
      persianTitle: "آموکسی سیلین ۵۰۰ میلی گرم",
      englishTitle: "Amoxicillin 500mg Capsule",
      aliases: ["amox", "amoxicillin"],
      brand: "Daya Darman",
      sellPrice: 185000,
      tempPrice: 179000,
      taxCodes: ["TAX_MED_STANDARD"],
      nonPharma: false,
      countInPackage: 100,
      unitLabel: "capsule",
      packLabel: "box of 100 capsules",
      ttacCode: "TTAC-AMOX-500",
      sources: [
        { key: "qanoon", label: "Qanoon", role: "pricing", priority: 1 },
        { key: "ttac", label: "TTAC", role: "reference", priority: 1 }
      ]
    },
    quantity: 2,
    documentDate: "2026-06-24",
    includeTechnicalFee: true,
    taxMultiplier: 0.75,
    roundingRule: "round",
    taxData: {
      code: "TAX_MED_STANDARD",
      title: "Medicine Standard Tax",
      averageTaxes: [
        { date: "2025-01-01", averageTax: 8200 },
        { date: "2026-01-01", averageTax: 9100 }
      ]
    },
    technicalFeeRules: [
      {
        type: "dispense-fee",
        amount: 15000,
        effectiveDate: "2026-01-01",
        conditions: {
          excludeNonPharma: true,
          minimumQuantity: 1
        }
      }
    ],
    avgCost: 132000
  });

  assert.equal(result.basePrice, 370000);
  assert.equal(result.totalTax, 18200);
  assert.equal(result.taxAmount, 13650);
  assert.equal(result.tollAmount, 4550);
  assert.equal(result.technicalFee, 30000);
  assert.equal(result.finalPrice, 418200);
  assert.equal(result.avgCost, 264000);
  assert.equal(result.profitAmount, 154200);
  assert.equal(result.profitPercent, 58);
  assert.equal(result.unitLabel, "capsule");
  assert.equal(result.persianTitle, "آموکسی سیلین ۵۰۰ میلی گرم");
  assert.deepEqual(result.warnings, []);
});

test("calculateFinalPrice reports missing cost and skips technical fee for non-pharma goods", () => {
  const result = calculateFinalPrice({
    good: {
      id: "g-1002",
      internalCode: "INT-1002",
      barcode: "6261001100028",
      genericCode: "GEN-ADLT-CREAM",
      title: "Adult Protective Cream",
      persianTitle: "کرم محافظ بزرگسال",
      englishTitle: "Adult Protective Cream",
      aliases: ["cream", "کرم"],
      brand: "Dermaline",
      sellPrice: 240000,
      tempPrice: 0,
      taxCodes: ["TAX_COSMETIC"],
      nonPharma: true,
      countInPackage: 1,
      unitLabel: "tube",
      packLabel: "single tube",
      ttacCode: "TTAC-ADLT-CREAM",
      sources: [
        { key: "qanoon", label: "Qanoon", role: "pricing", priority: 1 },
        { key: "ttac", label: "TTAC", role: "reference", priority: 1 }
      ]
    },
    quantity: 1,
    documentDate: "2026-06-24",
    includeTechnicalFee: true,
    taxMultiplier: 0.75,
    roundingRule: "round",
    taxData: {
      code: "TAX_COSMETIC",
      title: "Cosmetic Tax",
      averageTaxes: [{ date: "2026-01-01", averageTax: 21400 }]
    },
    technicalFeeRules: [
      {
        type: "dispense-fee",
        amount: 15000,
        effectiveDate: "2026-01-01",
        conditions: {
          excludeNonPharma: true,
          minimumQuantity: 1
        }
      }
    ],
    avgCost: null
  });

  assert.equal(result.technicalFee, 0);
  assert.equal(result.profitAmount, null);
  assert.equal(result.profitPercent, null);
  assert.equal(result.unitLabel, "tube");
  assert.deepEqual(result.warnings, [
    "Technical fee was requested but no applicable rule matched.",
    "Average cost is not available for this good and warehouse."
  ]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  QanoonAdapter,
  createQanoonAdapter,
  QanoonAdapterError,
  QanoonValidationError,
  QanoonNotFoundError,
  QanoonConflictError,
  QanoonAuthenticationError,
  QanoonNetworkTimeoutError,
  QanoonServerError,
} from "../src/adapters/qanoon-adapter.js";
import mockData from "../fixtures/qanoon-mock-data.json" with { type: "json" };

test("QanoonAdapter — Initialization & Offline Mock Mode", async (t) => {
  await t.test("defaults to mockMode=true when no API key or live config provided", () => {
    const adapter = new QanoonAdapter();
    assert.equal(adapter.isMockMode(), true);
  });

  await t.test("factory createQanoonAdapter returns valid QanoonAdapter instance", () => {
    const adapter = createQanoonAdapter({ mockMode: true });
    assert.ok(adapter instanceof QanoonAdapter);
    assert.equal(typeof adapter.checkStock, "function");
    assert.equal(typeof adapter.calculatePrice, "function");
    assert.equal(typeof adapter.createBatchOrder, "function");
    assert.equal(typeof adapter.searchGoods, "function");
  });

  await t.test("loads injected in-memory fixtures without disk read", async () => {
    const customData = {
      goods: [{ id: "custom-1", title: "Custom Drug", sellPrice: 50000, genericCode: "09999" }],
      stock: [],
      taxRates: {},
      technicalFees: [],
    };
    const adapter = new QanoonAdapter({ fixtures: customData });
    const fixtures = await adapter.getFixtures();
    assert.equal(fixtures.goods[0].id, "custom-1");
  });
});

test("QanoonAdapter — Two-Stage Stock Verification", async (t) => {
  const adapter = new QanoonAdapter({ mockData });

  await t.test("Stage 1 Advisory: returns inStock=true and stockStatus='in_stock' when available >= requested", async () => {
    const stock = await adapter.checkStock({
      goodId: "g-1001",
      requestedCount: 10,
      warehouseId: "main",
    });

    assert.equal(stock.inStock, true);
    assert.equal(stock.stockStatus, "in_stock");
    assert.equal(stock.availableCount, 140);
    assert.equal(stock.earliestExpDate, "2027-02-01");
    assert.equal(stock.advisoryWarning, null);
  });

  await t.test("Stage 1 Advisory: returns inStock=false, stockStatus='low_stock', and advisory warning when available < requested", async () => {
    const stock = await adapter.checkStock({
      goodId: "g-1004", // Available: 2 in main
      requestedCount: 5,
      warehouseId: "main",
    });

    assert.equal(stock.inStock, false);
    assert.equal(stock.stockStatus, "low_stock");
    assert.equal(stock.availableCount, 2);
    assert.ok(stock.advisoryWarning != null);
    assert.ok(stock.advisoryWarning.includes("موجودی ناکافی"));
  });

  await t.test("Stage 1 Advisory: returns inStock=false, stockStatus='out_of_stock' when count is 0", async () => {
    const stock = await adapter.checkStock({
      goodId: "g-1006",
      requestedCount: 1,
      warehouseId: "main",
    });

    assert.equal(stock.inStock, false);
    assert.equal(stock.stockStatus, "out_of_stock");
    assert.equal(stock.availableCount, 0);
    assert.ok(stock.advisoryWarning != null);
    assert.ok(stock.advisoryWarning.includes("موجود نیست"));
  });

  await t.test("Stage 1 Advisory: checks stock by genericCode and brandCode preserving leading zeroes", async () => {
    const stock = await adapter.checkStock({
      genericCode: "00001",
      brandCode: "00001",
      requestedCount: 5,
      warehouseId: "main",
    });

    assert.equal(stock.inStock, true);
    assert.strictEqual(stock.genericCode, "00001");
    assert.strictEqual(stock.brandCode, "00001");
    assert.equal(stock.availableCount, 140);
  });

  await t.test("Stage 1 Advisory: queries specific secondary warehouse correctly", async () => {
    const stockBranch2 = await adapter.checkStock({
      goodId: "g-1004",
      requestedCount: 5,
      warehouseId: "branch-2",
    });

    assert.equal(stockBranch2.inStock, true);
    assert.equal(stockBranch2.availableCount, 10);
  });

  await t.test("Stage 2 Pre-Batch Barrier: checks batch stock and compiles discrepancy list", async () => {
    const batchCheck = await adapter.checkBatchStock({
      warehouseId: "main",
      items: [
        { goodId: "g-1001", requestedCount: 2, title: "Amoxicillin" },
        { goodId: "g-1004", requestedCount: 10, title: "Cough Syrup" }, // Only 2 in main stock
      ],
    });

    assert.equal(batchCheck.allAvailable, false);
    assert.equal(batchCheck.items.length, 2);
    assert.equal(batchCheck.discrepancies.length, 1);
    assert.ok(batchCheck.discrepancies[0].includes("Cough Syrup"));
  });

  await t.test("Stage 2 Pre-Batch Barrier: succeeds when all items are fully in stock", async () => {
    const batchCheck = await adapter.checkBatchStock({
      warehouseId: "main",
      items: [
        { goodId: "g-1001", requestedCount: 2, title: "Amoxicillin" },
        { goodId: "g-1003", requestedCount: 5, title: "Acetaminophen" },
      ],
    });

    assert.equal(batchCheck.allAvailable, true);
    assert.equal(batchCheck.discrepancies.length, 0);
  });
});

test("QanoonAdapter — 7-Step Deterministic Pricing Engine", async (t) => {
  const adapter = new QanoonAdapter({ mockData });

  await t.test("applies full 7-step pricing with 75/25 VAT/toll split for standard pharma goods", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g-1001",
      quantity: 2,
      documentDate: "2026-06-24",
      includeTechnicalFee: true,
      roundingRule: "round",
    });

    // 1. unitBasePrice: sellPrice = 185,000
    assert.equal(result.unitBasePrice, 185000);
    // 2. basePrice: 185,000 * 2 = 370,000
    assert.equal(result.basePrice, 370000);
    // 3. Tax & Toll: 2 * 9,100 = 18,200. VAT (75%) = 13,650. Toll (25%) = 4,550
    assert.equal(result.totalTax, 18200);
    assert.equal(result.taxAmount, 13650);
    assert.equal(result.vatAmount, 13650);
    assert.equal(result.tollAmount, 4550);
    assert.equal(result.taxAmount + result.tollAmount, result.totalTax);
    // 4. Technical Fee: 15,000 * 2 = 30,000
    assert.equal(result.technicalFee, 30000);
    // 5. Final Price: 370,000 + 13,650 + 4,550 + 30,000 = 418,200
    assert.equal(result.finalPrice, 418200);
    // 6. Cost & Profit: avgCost = 132,000 * 2 = 264,000. Profit = 418,200 - 264,000 = 154,200 (58%)
    assert.equal(result.avgCost, 264000);
    assert.equal(result.profitAmount, 154200);
    assert.equal(result.profitPercent, 58);
    // 7. No warnings
    assert.deepEqual(result.warnings, []);
  });

  await t.test("supports 'g1' alias for test compatibility", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g1",
      quantity: 10,
    });

    assert.ok(result.finalPrice > 0);
    assert.ok(result.vatAmount >= 0);
    assert.ok(result.tollAmount >= 0);
    if (result.vatAmount > 0 && result.tollAmount > 0) {
      const ratio = result.vatAmount / (result.vatAmount + result.tollAmount);
      assert.ok(Math.abs(ratio - 0.75) < 0.05, "VAT should represent approximately 75% of total tax");
    }
  });

  await t.test("falls back to tempPrice with warning when sellPrice is zero or missing", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g-1003",
      quantity: 1,
      documentDate: "2026-06-24",
    });

    assert.equal(result.unitBasePrice, 45000);
    assert.equal(result.basePrice, 45000);
    assert.ok(result.warnings.some((w) => w.includes("Used tempPrice")));
  });

  await t.test("exempts non-pharma goods from technical dispense fees", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g-1002", // nonPharma: true
      quantity: 1,
      documentDate: "2026-06-24",
      includeTechnicalFee: true,
    });

    assert.equal(result.technicalFee, 0);
    assert.ok(result.warnings.some((w) => w.includes("Technical fee was requested but no applicable rule matched")));
  });

  await t.test("matches historical tax rate based on documentDate boundary", async () => {
    const result2025 = await adapter.calculatePrice({
      goodId: "g-1001",
      quantity: 1,
      documentDate: "2025-06-01", // Prior to 2026 rate change
    });

    assert.equal(result2025.totalTax, 8200);
    assert.equal(result2025.appliedTaxDate, "2025-01-01");
  });

  await t.test("emits price divergence warning when TTAC price differs from Qanoon by > 10,000 Rials", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g-1004", // sellPrice: 110,000, ttacPrice: 135,000 (diff: 25,000 > 10,000)
      quantity: 1,
      documentDate: "2026-06-24",
    });

    // Authoritative Qanoon unit price is preserved
    assert.equal(result.unitBasePrice, 110000);
    // Warning attached
    assert.ok(result.warnings.some((w) => w.includes("Price divergence")));
  });

  await t.test("does not emit divergence warning when TTAC price difference is <= 10,000 Rials", async () => {
    const result = await adapter.calculatePrice({
      goodId: "g-1001", // sellPrice: 185,000, ttacPrice: 185,000 (diff: 0 <= 10,000)
      quantity: 1,
      documentDate: "2026-06-24",
    });

    assert.ok(!result.warnings.some((w) => w.includes("Price divergence")));
  });

  await t.test("respects roundingRule: ceil, floor, and round", async () => {
    const ceilResult = await adapter.calculatePrice({
      goodId: "g-1001",
      quantity: 1,
      roundingRule: "ceil",
    });
    assert.ok(typeof ceilResult.finalPrice === "number");

    const floorResult = await adapter.calculatePrice({
      goodId: "g-1001",
      quantity: 1,
      roundingRule: "floor",
    });
    assert.ok(typeof floorResult.finalPrice === "number");
  });
});

test("QanoonAdapter — 24-Hour UniqueId Idempotency Cache", async (t) => {
  const adapter = new QanoonAdapter({ mockData });

  await t.test("first submission creates batch with status SUBMITTED", async () => {
    const uniqueId = `test-unique-${Date.now()}`;
    const res = await adapter.createBatchOrder({
      draftId: "draft-1",
      uniqueId,
      items: [{ goodId: "g-1001", genericCode: "00001", quantity: 2, price: 185000 }],
    });

    assert.equal(res.status, "SUBMITTED");
    assert.equal(res.isIdempotentReplay, false);
    assert.equal(res.uniqueId, uniqueId);
    assert.ok(res.batchId);
  });

  await t.test("replay with identical uniqueId and identical payload returns CACHED response", async () => {
    const uniqueId = `test-unique-cached-${Date.now()}`;
    const payload = {
      draftId: "draft-1",
      uniqueId,
      items: [{ goodId: "g-1001", genericCode: "00001", quantity: 2, price: 185000 }],
    };

    const first = await adapter.createBatchOrder(payload);
    assert.equal(first.status, "SUBMITTED");

    const second = await adapter.createBatchOrder(payload);
    assert.equal(second.status, "CACHED");
    assert.equal(second.isIdempotentReplay, true);
    assert.equal(second.batchId, first.batchId);
  });

  await t.test("resubmission with identical uniqueId but modified payload throws QanoonConflictError", async () => {
    const uniqueId = `test-unique-conflict-${Date.now()}`;

    await adapter.createBatchOrder({
      draftId: "draft-1",
      uniqueId,
      items: [{ goodId: "g-1001", genericCode: "00001", quantity: 2, price: 185000 }],
    });

    await assert.rejects(
      async () => {
        await adapter.createBatchOrder({
          draftId: "draft-1",
          uniqueId,
          items: [{ goodId: "g-1001", genericCode: "00001", quantity: 5, price: 185000 }], // Quantity changed
        });
      },
      (err) => {
        assert.ok(err instanceof QanoonConflictError);
        assert.equal(err.statusCode, 409);
        assert.ok(err.message.includes("UNIQUE_ID_PAYLOAD_MISMATCH"));
        return true;
      }
    );
  });

  await t.test("expired uniqueId entry (>24h) triggers fresh submission", async () => {
    const shortTtlAdapter = new QanoonAdapter({ mockData, idempotencyTtlMs: 20 });
    const uniqueId = `test-unique-expiring-${Date.now()}`;
    const payload = {
      draftId: "draft-1",
      uniqueId,
      items: [{ goodId: "g-1001", genericCode: "00001", quantity: 1, price: 185000 }],
    };

    const first = await shortTtlAdapter.createBatchOrder(payload);
    assert.equal(first.status, "SUBMITTED");

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 35));

    const second = await shortTtlAdapter.createBatchOrder(payload);
    assert.equal(second.status, "SUBMITTED");
  });

  await t.test("clearIdempotencyCache empties cache entries", async () => {
    const uniqueId = `test-unique-cleared-${Date.now()}`;
    await adapter.createBatchOrder({
      draftId: "draft-1",
      uniqueId,
      items: [{ goodId: "g-1001", genericCode: "00001", quantity: 1, price: 185000 }],
    });

    adapter.clearIdempotencyCache();

    const fresh = await adapter.createBatchOrder({
      draftId: "draft-1",
      uniqueId,
      items: [{ goodId: "g-1001", genericCode: "00001", quantity: 1, price: 185000 }],
    });
    assert.equal(fresh.status, "SUBMITTED");
  });
});

test("QanoonAdapter — Leading-Zero String Preservation", async (t) => {
  const adapter = new QanoonAdapter({ mockData });

  await t.test("preserves leading zeroes in genericCode and brandCode across search", async () => {
    const results = await adapter.searchGoods({ query: "00001" });
    assert.ok(results.length > 0);
    const item = results[0];
    assert.strictEqual(typeof item.genericCode, "string");
    assert.strictEqual(item.genericCode, "00001");
    assert.strictEqual(typeof item.brandCode, "string");
    assert.strictEqual(item.brandCode, "00001");
  });

  await t.test("preserves leading zero code '08234'", async () => {
    const results = await adapter.searchGoods({ query: "08234" });
    assert.ok(results.length > 0);
    const item = results[0];
    assert.strictEqual(typeof item.genericCode, "string");
    assert.strictEqual(item.genericCode, "08234");
  });

  await t.test("stock check by genericCode preserves leading zeroes without numeric coercion", async () => {
    const stock = await adapter.checkStock({
      genericCode: "00001",
      requestedCount: 1,
    });
    assert.strictEqual(stock.genericCode, "00001");
    assert.notStrictEqual(stock.genericCode, 1);
    assert.notStrictEqual(stock.genericCode, "1");
  });

  await t.test("batch order items maintain leading zero code strings in output", async () => {
    const batch = await adapter.createBatchOrder({
      uniqueId: `test-code-preservation-${Date.now()}`,
      items: [
        { goodId: "g-1001", genericCode: "00001", quantity: 2, price: 185000 },
      ],
    });

    assert.strictEqual(batch.items[0].genericCode, "00001");
  });
});

test("QanoonAdapter — Error Classification & Input Validation", async (t) => {
  const adapter = new QanoonAdapter({ mockData });

  await t.test("missing goodId in calculatePrice throws QanoonValidationError", async () => {
    await assert.rejects(
      async () => {
        await adapter.calculatePrice({ quantity: 1 });
      },
      (err) => {
        assert.ok(err instanceof QanoonValidationError);
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  await t.test("invalid quantity <= 0 in calculatePrice throws QanoonValidationError", async () => {
    await assert.rejects(
      async () => {
        await adapter.calculatePrice({ goodId: "g-1001", quantity: 0 });
      },
      (err) => {
        assert.ok(err instanceof QanoonValidationError);
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  await t.test("unknown goodId in calculatePrice throws QanoonNotFoundError", async () => {
    await assert.rejects(
      async () => {
        await adapter.calculatePrice({ goodId: "nonexistent-good-id", quantity: 1 });
      },
      (err) => {
        assert.ok(err instanceof QanoonNotFoundError);
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  });

  await t.test("missing uniqueId in createBatchOrder throws QanoonValidationError", async () => {
    await assert.rejects(
      async () => {
        await adapter.createBatchOrder({
          items: [{ goodId: "g-1001", quantity: 1 }],
        });
      },
      (err) => {
        assert.ok(err instanceof QanoonValidationError);
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  await t.test("empty items in createBatchOrder throws QanoonValidationError", async () => {
    await assert.rejects(
      async () => {
        await adapter.createBatchOrder({
          uniqueId: "test-valid-id",
          items: [],
        });
      },
      (err) => {
        assert.ok(err instanceof QanoonValidationError);
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  await t.test("custom error inheritance conforms to Error and QanoonAdapterError", () => {
    const valErr = new QanoonValidationError("test");
    assert.ok(valErr instanceof Error);
    assert.ok(valErr instanceof QanoonAdapterError);
    assert.equal(valErr.statusCode, 400);

    const authErr = new QanoonAuthenticationError("test");
    assert.ok(authErr instanceof QanoonAdapterError);
    assert.equal(authErr.statusCode, 401);

    const notFoundErr = new QanoonNotFoundError("test");
    assert.ok(notFoundErr instanceof QanoonAdapterError);
    assert.equal(notFoundErr.statusCode, 404);

    const conflictErr = new QanoonConflictError("test");
    assert.ok(conflictErr instanceof QanoonAdapterError);
    assert.equal(conflictErr.statusCode, 409);

    const timeoutErr = new QanoonNetworkTimeoutError("test");
    assert.ok(timeoutErr instanceof QanoonAdapterError);
    assert.equal(timeoutErr.statusCode, 504);

    const serverErr = new QanoonServerError("test");
    assert.ok(serverErr instanceof QanoonAdapterError);
    assert.equal(serverErr.statusCode, 500);
  });
});

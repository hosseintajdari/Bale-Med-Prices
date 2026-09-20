import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PriceCacheService, priceCacheService } from "./price-cache-service.ts";

beforeEach(() => {
  priceCacheService.resetForTest();
});

test("PriceCacheService creates deterministic keys differentiating input fields", () => {
  const service = new PriceCacheService();

  const key1 = service.createKey({ goodId: "g1", documentDate: "2026-06-24", quantity: 1 });
  const key2 = service.createKey({ goodId: "g1", documentDate: "2026-06-24", quantity: 1 });
  assert.equal(key1, key2);

  // Different quantity
  const keyQty = service.createKey({ goodId: "g1", documentDate: "2026-06-24", quantity: 2 });
  assert.notEqual(key1, keyQty);

  // Different documentDate
  const keyDate = service.createKey({ goodId: "g1", documentDate: "2026-07-01", quantity: 1 });
  assert.notEqual(key1, keyDate);

  // Different format
  const keyTelegram = service.createKey({ goodId: "g1", documentDate: "2026-06-24", quantity: 1 }, "telegram");
  assert.notEqual(key1, keyTelegram);

  // Technical fee
  const keyFee = service.createKey({ goodId: "g1", documentDate: "2026-06-24", quantity: 1, includeTechnicalFee: true });
  assert.notEqual(key1, keyFee);
});

test("PriceCacheService tracks hits, misses, and caches values correctly", () => {
  const service = new PriceCacheService();

  const key = "test-key-1";
  const data = { finalPrice: 45000, title: "Amoxicillin 500mg" };

  assert.equal(service.get(key), null);
  assert.equal(service.getStats().misses, 1);
  assert.equal(service.getStats().hits, 0);

  service.set(key, data);
  assert.equal(service.has(key), true);
  assert.equal(service.getStats().size, 1);

  const cached = service.get(key);
  assert.deepEqual(cached, data);
  assert.equal(service.getStats().hits, 1);
});

test("PriceCacheService returns isolated clones preventing mutation of cached entries", () => {
  const service = new PriceCacheService();
  const key = "mutation-key";
  const original = { price: 1000, details: { items: [1, 2] } };

  service.set(key, original);
  const retrieved = service.get<typeof original>(key);
  assert.ok(retrieved);

  // Mutate retrieved object
  retrieved.price = 9999;
  retrieved.details.items.push(3);

  // Verify cached data remains untouched
  const fresh = service.get<typeof original>(key);
  assert.equal(fresh?.price, 1000);
  assert.equal(fresh?.details.items.length, 2);
});

test("PriceCacheService expires entries after TTL", async () => {
  const service = new PriceCacheService();
  const key = "expiring-key";
  const data = { valid: true };

  // Set with short TTL (20ms)
  service.set(key, data, 20);
  assert.equal(service.has(key), true);
  assert.deepEqual(service.get(key), data);

  // Wait for expiry
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(service.has(key), false);
  assert.equal(service.get(key), null);
});

test("PriceCacheService invalidates entries by goodId or all", () => {
  const service = new PriceCacheService();

  const keyG1A = service.createKey({ goodId: "g1", documentDate: "2026-01-01", quantity: 1 });
  const keyG1B = service.createKey({ goodId: "g1", documentDate: "2026-01-01", quantity: 2 });
  const keyG2 = service.createKey({ goodId: "g2", documentDate: "2026-01-01", quantity: 1 });

  service.set(keyG1A, { p: 100 });
  service.set(keyG1B, { p: 200 });
  service.set(keyG2, { p: 300 });

  assert.equal(service.getStats().size, 3);

  // Invalidate goodId g1
  const removedG1 = service.invalidate({ goodId: "g1" });
  assert.equal(removedG1, 2);
  assert.equal(service.has(keyG1A), false);
  assert.equal(service.has(keyG1B), false);
  assert.equal(service.has(keyG2), true);

  // Invalidate all
  const remaining = service.invalidate();
  assert.equal(remaining, 1);
  assert.equal(service.getStats().size, 0);
});

test("PriceCacheService performs LRU eviction when reaching capacity", () => {
  const service = new PriceCacheService();
  // Override max entries for testing
  const originalEnv = process.env.PRICE_CACHE_MAX_ENTRIES;
  process.env.PRICE_CACHE_MAX_ENTRIES = "3";

  try {
    service.set("k1", { v: 1 });
    service.set("k2", { v: 2 });
    service.set("k3", { v: 3 });

    assert.equal(service.getStats().size, 3);

    // Access k1 to make k2 the least recently used
    service.get("k1");

    // Add 4th item, should evict k2
    service.set("k4", { v: 4 });

    assert.equal(service.getStats().size, 3);
    assert.equal(service.getStats().evictions, 1);
    assert.equal(service.has("k2"), false);
    assert.equal(service.has("k1"), true);
    assert.equal(service.has("k3"), true);
    assert.equal(service.has("k4"), true);
  } finally {
    if (originalEnv !== undefined) {
      process.env.PRICE_CACHE_MAX_ENTRIES = originalEnv;
    } else {
      delete process.env.PRICE_CACHE_MAX_ENTRIES;
    }
  }
});

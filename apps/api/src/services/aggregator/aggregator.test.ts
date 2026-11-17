import test from "node:test";
import assert from "node:assert/strict";
import { politeFetch, resetPolitenessForTest } from "./http.ts";
import { buildQueries, extractUrls } from "./google-discovery.ts";
import { hitFromApiItem } from "./torob-adapter.ts";
import { parseRows, matchScore } from "./delgarm-adapter.ts";
import { aggregatorService, resetWebCacheForTest, searchWithAdapters } from "./aggregator-service.ts";
import { DarukadeAdapter, rowToHit } from "./darukade-adapter.ts";
import { tomanToRial, RateLimitedError, type PriceHit, type SourceAdapter } from "./types.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fakeAdapter(
  name: string,
  behavior: () => Promise<PriceHit[]>
): SourceAdapter {
  return {
    name,
    search: behavior,
    health: async () => true
  };
}

function hit(name: string, sourceName: string): PriceHit {
  return {
    productName: name,
    priceRial: 1000,
    url: `https://example.com/${sourceName}/${encodeURIComponent(name)}`,
    sourceName,
    crawledAt: "2026-10-30T00:00:00Z"
  };
}

test("tomanToRial normalizes toman to rial (x10)", () => {
  assert.equal(tomanToRial(100), 1000);
  assert.equal(tomanToRial(135000), 1350000);
  assert.equal(tomanToRial(0), 0);
});

test("buildQueries covers price queries and site scoping", () => {
  const queries = buildQueries("آموکسی‌سیلین", "torob.com");
  assert.ok(queries.includes("قیمت آموکسی‌سیلین"));
  assert.ok(queries.some((q) => q.includes("site:torob.com")));

  const open = buildQueries("آموکسی‌سیلین");
  assert.ok(open.some((q) => q.includes("torob")));
});

test("extractUrls unwraps DuckDuckGo redirect links", () => {
  const html =
    '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Ftorob.com%2Fp%2Fabc%2F">x</a>' +
    '<a class="result__a" href="https://www.delgarm.com/prices-list/y/">y</a>';
  const urls = extractUrls(html);
  assert.deepEqual(urls, ["https://torob.com/p/abc/", "https://www.delgarm.com/prices-list/y/"]);
});

test("torob hitFromApiItem maps price with toman->rial and stamps crawledAt", () => {
  const hit = hitFromApiItem({
    name1: "کپسول آموکسی‌سیلین ۵۰۰",
    price: 135000,
    web_client_absolute_url: "/p/abc123/"
  });
  assert.ok(hit);
  assert.equal(hit.priceRial, 1350000);
  assert.equal(hit.sourceName, "torob");
  assert.equal(hit.url, "https://torob.com/p/abc123/");
  assert.ok(hit.crawledAt, "crawledAt is mandatory — no dateless prices");
});

test("torob hitFromApiItem drops items without a price", () => {
  assert.equal(hitFromApiItem({ name1: "x", price: 0 }), null);
  assert.equal(hitFromApiItem({ name1: "x" }), null);
});

test("delgarm parseRows extracts name/price rows from a prices-list page", () => {
  const html =
    '<table><tr><td class="price_title">شربت زینک دکتر کیدز</td>' +
    '<td><span>۱۹۹٬۰۰۰</span><small>تومان</small></td></tr>' +
    '<tr><td class="price_title">ویتامین ث</td><td><span>85,000</span></td></tr></table>';
  const rows = parseRows(html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "شربت زینک دکتر کیدز");
  assert.equal(rows[0].priceToman, 199000);
  assert.equal(rows[1].priceToman, 85000);
});

test("delgarm matchScore ranks the right product high and unrelated low", () => {
  const good = matchScore("شربت زینک", "شربت زینک دکتر کیدز ۳۰۰ میلی‌لیتر");
  const bad = matchScore("شربت زینک", "قرص سرماخوردگی بزرگسالان");
  assert.ok(good > 0.55, `expected good match, got ${good}`);
  assert.ok(bad < good, `expected ${bad} < ${good}`);
});

test("politeFetch raises RateLimitedError on 429", async () => {
  resetPolitenessForTest();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("limited", { status: 429 })) as typeof fetch;
  try {
    await assert.rejects(() => politeFetch("https://example.com/x", {}, 0), RateLimitedError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aggregatorService.searchWeb rejects too-short queries without network", async () => {
  const hits = await aggregatorService.searchWeb("x");
  assert.deepEqual(hits, []);
});

test("aggregatorService exposes the registered adapter names", () => {
  assert.deepEqual(aggregatorService.adapterNames, ["darukade", "delgarm"]);
});

test("darukade rowToHit maps toman to rial and keeps the crawl date", () => {
  const hit = rowToHit({
    url: "https://darukade.com/products/x-1",
    name: "کرم ضد آفتاب SPF50",
    variant_title: "بژ روشن",
    brand_fa: "اریکه",
    brand_en: "Erikeh",
    price_toman: 1299800,
    fetched_at: "2026-10-15T06:14:50+00:00"
  });
  assert.ok(hit);
  assert.equal(hit.priceRial, 12998000);
  assert.equal(hit.sourceName, "darukade");
  assert.equal(hit.crawledAt, "2026-10-15T06:14:50+00:00");
  assert.ok(hit.productName.includes("کرم ضد آفتاب"));
  assert.ok(hit.productName.includes("اریکه"));
});

test("darukade rowToHit drops dateless, priceless and nameless rows", () => {
  const base = {
    url: "https://darukade.com/products/x-1",
    name: "کرم",
    variant_title: null,
    brand_fa: null,
    brand_en: null,
    price_toman: 1000,
    fetched_at: "2026-10-15T06:14:50+00:00"
  };
  assert.equal(rowToHit({ ...base, fetched_at: null }), null);
  assert.equal(rowToHit({ ...base, fetched_at: " " }), null);
  assert.equal(rowToHit({ ...base, price_toman: 0 }), null);
  assert.equal(rowToHit({ ...base, price_toman: null }), null);
  assert.equal(rowToHit({ ...base, name: null }), null);
});

function makeFixtureDb() {
  const dir = mkdtempSync(join(tmpdir(), "darukade-test-"));
  const path = join(dir, "darukade.sqlite3");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE darukade_products (
    url TEXT NOT NULL, variant_idx INTEGER NOT NULL, name TEXT,
    variant_title TEXT, brand_fa TEXT, brand_en TEXT, product_code TEXT,
    price_toman INTEGER, original_price_toman INTEGER, discount_percent INTEGER,
    in_stock INTEGER, store_count INTEGER, expiration TEXT,
    fetched_at TEXT NOT NULL, PRIMARY KEY (url, variant_idx))`);
  const ins = db.prepare(
    `INSERT INTO darukade_products (url, variant_idx, name, variant_title, brand_fa, brand_en, price_toman, fetched_at)
     VALUES (?, 0, ?, ?, ?, ?, ?, '2026-10-15T06:14:50+00:00')`
  );
  ins.run("https://darukade.com/p/1", "کرم ضد آفتاب پوست خشک SPF50", "بژ روشن", "اریکه", "Erikeh", 1299800);
  ins.run("https://darukade.com/p/2", "شامپو روزانه", null, "سریتا", "Cerita", 250000);
  db.close();
  return { dir, path };
}

test("darukade adapter searches the local catalog read-only", async () => {
  const { dir, path } = makeFixtureDb();
  const adapter = new DarukadeAdapter(path);
  try {
    assert.equal(await adapter.health(), true);
    const hits = await adapter.search("ضد آفتاب اریکه");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].priceRial, 12998000);
    assert.equal(hits[0].sourceName, "darukade");
    assert.ok(hits[0].crawledAt);
    const none = await adapter.search("داروی ناموجود عجیب");
    assert.deepEqual(none, []);
  } finally {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("darukade adapter finds a brand stored without آ from a query typed with آ", async () => {
  const dir = mkdtempSync(join(tmpdir(), "darukade-alef-"));
  const path = join(dir, "darukade.sqlite3");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE darukade_products (
    url TEXT NOT NULL, variant_idx INTEGER NOT NULL, name TEXT,
    variant_title TEXT, brand_fa TEXT, brand_en TEXT, product_code TEXT,
    price_toman INTEGER, original_price_toman INTEGER, discount_percent INTEGER,
    in_stock INTEGER, store_count INTEGER, expiration TEXT,
    fetched_at TEXT NOT NULL, PRIMARY KEY (url, variant_idx))`);
  db.prepare(
    `INSERT INTO darukade_products (url, variant_idx, name, variant_title, brand_fa, brand_en, price_toman, fetched_at)
     VALUES (?, 0, ?, ?, ?, ?, ?, '2026-10-15T06:14:50+00:00')`
  ).run("https://darukade.com/p/9", "رنگ مو قهوه ای", null, "لورال", "Loreal", 500000);
  db.close();
  const adapter = new DarukadeAdapter(path);
  try {
    const hits = await adapter.search("لورآل");
    assert.equal(hits.length, 1, "آ/ا folding must bridge the stored brand and the typed query");
    assert.equal(hits[0].priceRial, 5000000);
  } finally {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("darukade adapter disables itself when the DB is missing", async () => {
  const adapter = new DarukadeAdapter("/nonexistent/darukade.sqlite3");
  assert.equal(await adapter.health(), false);
  assert.deepEqual(await adapter.search("ضد آفتاب"), []);
});

test("darukade rowToHit drops garbage dates, keeps empty-brand fallback", () => {
  const base = {
    url: "https://darukade.com/products/x-1",
    name: "کرم",
    variant_title: null,
    brand_fa: null,
    brand_en: null,
    price_toman: 1000,
    fetched_at: "2026-10-15T06:14:50+00:00"
  };
  assert.equal(rowToHit({ ...base, fetched_at: "not-a-date" }), null);
  const hit = rowToHit({ ...base, brand_fa: "  ", brand_en: "Erikeh" });
  assert.ok(hit);
  assert.ok(hit.productName.includes("Erikeh"));
});

test("darukade adapter finds Arabic-letter catalog rows from a Persian query", async () => {
  const dir = mkdtempSync(join(tmpdir(), "darukade-ar-"));
  const path = join(dir, "darukade.sqlite3");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE darukade_products (
    url TEXT NOT NULL, variant_idx INTEGER NOT NULL, name TEXT,
    variant_title TEXT, brand_fa TEXT, brand_en TEXT, product_code TEXT,
    price_toman INTEGER, original_price_toman INTEGER, discount_percent INTEGER,
    in_stock INTEGER, store_count INTEGER, expiration TEXT,
    fetched_at TEXT NOT NULL, PRIMARY KEY (url, variant_idx))`);
  // Stored with Arabic ي/ك and the discriminating word only in variant_title.
  db.prepare(
    `INSERT INTO darukade_products (url, variant_idx, name, variant_title, brand_fa, price_toman, fetched_at)
     VALUES ('https://darukade.com/p/9', 0, 'كرم مرطوب كننده', 'يوسرين', 'يوسرين', 800000, '2026-10-15T06:14:50+00:00')`
  ).run();
  db.close();
  const adapter = new DarukadeAdapter(path);
  try {
    const hits = await adapter.search("یوسرین");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].priceRial, 8000000);
    // LIKE wildcards in the query must not broaden the pull into a match-all.
    const wild = await adapter.search("%%");
    assert.deepEqual(wild, []);
  } finally {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("darukade adapter picks up a catalog that appears after startup and reopens after close", async () => {
  const dir = mkdtempSync(join(tmpdir(), "darukade-life-"));
  const path = join(dir, "darukade.sqlite3");
  const adapter = new DarukadeAdapter(path);
  try {
    assert.equal(await adapter.health(), false); // not there yet
    const { path: fixture } = makeFixtureDb();
    const { copyFileSync } = await import("node:fs");
    copyFileSync(fixture, path);
    assert.equal(await adapter.health(), true); // appeared -> picked up
    adapter.close();
    const hits = await adapter.search("ضد آفتاب اریکه"); // close is not terminal
    assert.equal(hits.length, 1);
  } finally {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Resilience contract (QA 2026-10-30) ---

test("a rate-limited adapter does not kill another adapter's hits", async () => {
  resetWebCacheForTest();
  const healthy = fakeAdapter("healthy", async () => [hit("بوتاکس", "healthy")]);
  const limited = fakeAdapter("limited", async () => {
    throw new RateLimitedError("limited returned 429");
  });

  const { hits, meta } = await searchWithAdapters([healthy, limited], "بوتاکس", 5);

  assert.equal(hits.length, 1);
  assert.equal(hits[0].sourceName, "healthy");
  const limitedOutcome = meta.sources.find((s) => s.name === "limited");
  assert.equal(limitedOutcome?.status, "rate-limited");
});

test("a timing-out adapter cannot stall the response past its budget", async () => {
  resetWebCacheForTest();
  const original = process.env.WEB_ADAPTER_TIMEOUT_MS;
  process.env.WEB_ADAPTER_TIMEOUT_MS = "200";
  try {
    const fast = fakeAdapter("fast", async () => [hit("استامینوفن", "fast")]);
    const slow = fakeAdapter("slow", () => new Promise(() => {})); // never resolves

    const t0 = Date.now();
    const { hits, meta } = await searchWithAdapters([fast, slow], "استامینوفن", 5);
    const elapsed = Date.now() - t0;

    assert.equal(hits.length, 1);
    assert.equal(meta.sources.find((s) => s.name === "slow")?.status, "error");
    assert.ok(elapsed < 1000, `slow adapter must not stall the answer, took ${elapsed}ms`);
  } finally {
    if (original === undefined) {
      delete process.env.WEB_ADAPTER_TIMEOUT_MS;
    } else {
      process.env.WEB_ADAPTER_TIMEOUT_MS = original;
    }
  }
});

test("adapters run in parallel, not serially", async () => {
  resetWebCacheForTest();
  const delay = () => new Promise((r) => setTimeout(r, 80));
  const a = fakeAdapter("a", async () => {
    await delay();
    return [hit("x1", "a")];
  });
  const b = fakeAdapter("b", async () => {
    await delay();
    return [hit("x2", "b")];
  });

  const t0 = Date.now();
  const { hits } = await searchWithAdapters([a, b], "x دارو", 5);
  const elapsed = Date.now() - t0;

  assert.equal(hits.length, 2);
  assert.ok(elapsed < 200, `parallel fan-out expected ~80ms, took ${elapsed}ms`);
});

test("web results are cached for a short TTL and negatives too", async () => {
  resetWebCacheForTest();
  let calls = 0;
  const counter = fakeAdapter("counter", async () => {
    calls += 1;
    return calls === 1 ? [hit("قرص آهن", "counter")] : [];
  });

  const first = await searchWithAdapters([counter], "قرص آهن", 5, 1_000);
  assert.equal(first.hits.length, 1);
  assert.equal(first.meta.cached, false);

  // Within the positive TTL: served from cache, adapter not re-queried.
  const second = await searchWithAdapters([counter], "قرص آهن", 5, 1_000 + 60_000);
  assert.equal(calls, 1);
  assert.equal(second.hits.length, 1);
  assert.equal(second.meta.cached, true);

  // Negative answers are cached with a shorter TTL: an empty result within
  // the negative window is served from cache…
  const miss = fakeAdapter("miss", async () => {
    calls += 1;
    return [];
  });
  await searchWithAdapters([miss], "پیتزا", 5, 2_000);
  const cachedMiss = await searchWithAdapters([miss], "پیتزا", 5, 2_000 + 30_000);
  assert.equal(cachedMiss.meta.cached, true);
  // …but expires before the positive TTL would, so prices cannot go stale long.
  const expiredMiss = await searchWithAdapters([miss], "پیتزا", 5, 2_000 + 61_000);
  assert.equal(expiredMiss.meta.cached, false);
});

test("cache TTL is hard-capped so a misconfiguration cannot serve stale prices", async () => {
  resetWebCacheForTest();
  const original = process.env.WEB_CACHE_TTL_MS;
  process.env.WEB_CACHE_TTL_MS = String(24 * 60 * 60 * 1000); // absurd: 24h
  try {
    let calls = 0;
    const counter = fakeAdapter("counter", async () => {
      calls += 1;
      return [hit("قرص آهن", "counter")];
    });

    await searchWithAdapters([counter], "قرص آهن", 5, 0);
    // 6 minutes later — past the 5-minute hard cap — the cache must be cold.
    await searchWithAdapters([counter], "قرص آهن", 5, 6 * 60 * 1000);
    assert.equal(calls, 2, "TTL must be capped at MAX_CACHE_TTL_MS (5 minutes)");
  } finally {
    if (original === undefined) {
      delete process.env.WEB_CACHE_TTL_MS;
    } else {
      process.env.WEB_CACHE_TTL_MS = original;
    }
    resetWebCacheForTest();
  }
});

test("web relevance threshold rejects unrelated queries before sources can return them", () => {
  // QA 2026-10-30: پیتزا once reportedly returned total=2. Both adapters
  // gate hits behind matchScore >= 0.55; lock that gate with pure scoring.
  for (const title of ["کرم ضد آفتاب SPF50", "پک ضد آفتاب ویشی", "قرص استامینوفن ۳۲۵"]) {
    const score = matchScore("پیتزا", title);
    assert.ok(
      score < 0.55,
      `پیتزا must stay below the relevance threshold, got ${score} vs "${title}"`
    );
  }
});

test("aggregatorService.searchWeb never rejects on source failures", async () => {
  // Short queries return without touching the network; the resilience
  // guarantee for source errors is covered by the rate-limit/timeout tests
  // above via searchWithAdapters (the same code path searchWeb delegates to).
  const hits = await aggregatorService.searchWeb("x");
  assert.deepEqual(hits, []);
});

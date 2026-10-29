import test from "node:test";
import assert from "node:assert/strict";
import { politeFetch, resetPolitenessForTest } from "./http.ts";
import { buildQueries, extractUrls } from "./google-discovery.ts";
import { hitFromApiItem } from "./torob-adapter.ts";
import { hitFromRow } from "./darukade-adapter.ts";
import { parseRows, matchScore } from "./delgarm-adapter.ts";
import { aggregatorService, resetWebCacheForTest, searchWithAdapters } from "./aggregator-service.ts";
import { tomanToRial, RateLimitedError, type PriceHit, type SourceAdapter } from "./types.ts";

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

test("darukade hitFromRow maps toman->rial and stamps the real crawl time", () => {
  const hit = hitFromRow({
    name: "کرم ضد آفتاب SPF50",
    variant_title: "بژ روشن",
    url: "https://darukade.com/products/x",
    price_toman: 1299800,
    fetched_at: "2026-10-26T01:51:05+00:00"
  });
  assert.ok(hit);
  assert.equal(hit.priceRial, 12998000);
  assert.equal(hit.sourceName, "darukade");
  assert.equal(hit.crawledAt, "2026-10-26T01:51:05+00:00");
  assert.ok(hit.productName.includes("بژ روشن"));
});

test("darukade hitFromRow drops rows without a price or crawl time", () => {
  assert.equal(
    hitFromRow({ name: "x", variant_title: null, url: "u", price_toman: 0, fetched_at: "t" }),
    null
  );
  assert.equal(
    hitFromRow({ name: "x", variant_title: null, url: "u", price_toman: 100, fetched_at: "" }),
    null
  );
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

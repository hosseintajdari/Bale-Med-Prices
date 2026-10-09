import test from "node:test";
import assert from "node:assert/strict";
import { politeFetch, resetPolitenessForTest } from "./http.ts";
import { buildQueries, extractUrls } from "./google-discovery.ts";
import { hitFromApiItem } from "./torob-adapter.ts";
import { parseRows, matchScore } from "./delgarm-adapter.ts";
import { aggregatorService } from "./aggregator-service.ts";
import { tomanToRial, RateLimitedError } from "./types.ts";

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
  assert.deepEqual(aggregatorService.adapterNames, ["torob", "delgarm"]);
});

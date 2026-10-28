import test from "node:test";
import assert from "node:assert/strict";
import { politeFetch, resetPolitenessForTest } from "./http.ts";
import { buildQueries, extractUrls } from "./google-discovery.ts";
import { hitFromApiItem } from "./torob-adapter.ts";
import { parseRows, matchScore } from "./delgarm-adapter.ts";
import { aggregatorService } from "./aggregator-service.ts";
import { DarukadeAdapter, rowToHit } from "./darukade-adapter.ts";
import { tomanToRial, RateLimitedError } from "./types.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("darukade adapter disables itself when the DB is missing", async () => {
  const adapter = new DarukadeAdapter("/nonexistent/darukade.sqlite3");
  assert.equal(await adapter.health(), false);
  assert.deepEqual(await adapter.search("ضد آفتاب"), []);
});

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// F2 supplement, isolated file on purpose: the Darukade adapter singleton
// reads DARUKADE_DB_PATH when the aggregator module first loads, so the
// fixture path must be in the environment before goods-service is
// imported — a fresh test process is the honest way to arrange that.

const dir = mkdtempSync(join(tmpdir(), "goods-f2-supp-"));
const dbPath = join(dir, "darukade.sqlite3");
{
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE darukade_products (
    url TEXT NOT NULL, variant_idx INTEGER NOT NULL, name TEXT,
    variant_title TEXT, brand_fa TEXT, brand_en TEXT, product_code TEXT,
    price_toman INTEGER, original_price_toman INTEGER, discount_percent INTEGER,
    in_stock INTEGER, store_count INTEGER, expiration TEXT,
    fetched_at TEXT NOT NULL, PRIMARY KEY (url, variant_idx))`);
  // A Darukade product whose bare name equals the mock catalog query:
  // the local answer exists (g-1003) and must NOT shadow this family.
  db.prepare(
    `INSERT INTO darukade_products (url, variant_idx, name, variant_title, brand_fa, brand_en, price_toman, fetched_at)
     VALUES ('https://darukade.com/p/9', 0, 'لوزارتان', '50 میلی گرم', 'سبحان', 'Sobhan', 12000, '2026-10-15T06:14:50+00:00')`
  ).run();
  db.close();
}
process.env.DARUKADE_DB_PATH = dbPath;

test("brand/bare-name query supplements a local answer with the Darukade family", async () => {
  const { goodsService } = await import("./goods-service.ts");
  try {
    const result = await goodsService.searchWithWebFallback({ query: "لوزارتان" });
    assert.equal(result.webFallback, false);
    assert.equal(result.webSupplemented, true);
    assert.equal(result.items[0].id, "g-1003"); // local (official) first
    assert.ok(result.items.some((item) => item.webSource), "darukade family missing");
    assert.equal(result.total, result.items.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a non-indexed query does not pay for a supplement", async () => {
  const { goodsService } = await import("./goods-service.ts");
  const result = await goodsService.searchWithWebFallback({ query: "آموکسی‌سیلین" });
  assert.equal(result.webSupplemented, undefined);
  assert.equal(result.webFallback, false);
  assert.ok(result.total >= 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { DarukadeAdapter } from "./darukade-adapter.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// F2 — Darukade reachability (Prime R2-2/R2-6) and the identity guard
// (R2-7 web side: «شربت سیتریزین» must not surface unrelated syrups).

function makeFixtureDb() {
  const dir = mkdtempSync(join(tmpdir(), "darukade-f2-"));
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
  // Brand-only identity: the name carries no brand word at all.
  ins.run("https://darukade.com/p/1", "کرم مرطوب کننده دست", null, "اریکه", "Erikeh", 500000);
  // An unrelated syrup — the «شربت سیتریزین» junk-hit shape.
  ins.run("https://darukade.com/p/2", "شربت سینوپرت", null, "بیونوریکا", "Bionorica", 900000);
  // A bare-name product family (R2-6): name without variant is the query.
  ins.run("https://darukade.com/p/3", "وانا آیرون", "60 عددی", "نورم لایف", "Norm Life", 166800);
  ins.run("https://darukade.com/p/4", "وانا آیرون", "30 عددی", "نورم لایف", "Norm Life", 36800);
  // Multi-word brand (R2-2 stems): patients type «Trec», catalog says «Trec Nutrition».
  ins.run("https://darukade.com/p/5", "پودر آمینو انرژی", null, "ترک نوتریشن", "Trec Nutrition", 250000);
  // Joined brand: box spelling «La Farrerr» (two tokens), catalog «Lafarrerr» (one).
  ins.run("https://darukade.com/p/6", "شامپو ماینوکسی موهای چرب", "250 میلی لیتر", "لافارر", "Lafarrerr", 809100);
  // Alef mismatch, stored with ا: patients type «لورآل», catalog says «لورال».
  ins.run("https://darukade.com/p/7", "رنگ موی کستینگ کرم", null, "لورال", "Loreal", 64300);
  // Alef mismatch, stored with آ: patients type «ابادیس», catalog says «آبادیس».
  ins.run("https://darukade.com/p/8", "شامپو روزانه ملایم", null, "آبادیس", "Abadis", 120000);
  db.close();
  return { dir, path };
}

test("darukade index: brand_en, brand_fa, bare name and joined forms are all indexed", async () => {
  const { dir, path } = makeFixtureDb();
  const adapter = new DarukadeAdapter(path);
  try {
    assert.equal(adapter.isIndexedQuery("erikeh"), true);
    assert.equal(adapter.isIndexedQuery("اریکه"), true);
    assert.equal(adapter.isIndexedQuery("norm life"), true);
    assert.equal(adapter.isIndexedQuery("normlife"), true);
    assert.equal(adapter.isIndexedQuery("trec"), true); // brand stem of «Trec Nutrition»
    assert.equal(adapter.isIndexedQuery("trec nutrition"), true);
    assert.equal(adapter.isIndexedQuery("لورآل"), true); // typed آ, stored ا
    assert.equal(adapter.isIndexedQuery("ابادیس"), true); // typed ا, stored آ
    assert.equal(adapter.isIndexedQuery("وانا آیرون"), true);
    assert.equal(adapter.isIndexedQuery("واناآیرون"), true);
    assert.equal(adapter.isIndexedQuery("vitabiotics"), false);
    assert.equal(adapter.isIndexedQuery("استامینوفن"), false);
  } finally {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("darukade index: a missing DB indexes nothing and never throws", () => {
  const adapter = new DarukadeAdapter("/nonexistent/darukade.sqlite3");
  assert.equal(adapter.isIndexedQuery("erikeh"), false);
});

test("darukade identity guard: a form word alone cannot carry a hit (شربت سیتریزین junk class)", async () => {
  const { dir, path } = makeFixtureDb();
  const adapter = new DarukadeAdapter(path);
  try {
    const hits = await adapter.search("شربت سیتریزین");
    assert.deepEqual(hits, []);
    // The same syrup IS reachable by its own identity.
    const own = await adapter.search("شربت سینوپرت");
    assert.equal(own.length, 1);
    assert.equal(own[0].priceRial, 9000000);
  } finally {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("darukade: two-token box spelling of a joined brand still scores the brand rows", async () => {
  const { dir, path } = makeFixtureDb();
  const adapter = new DarukadeAdapter(path);
  try {
    const hits = await adapter.search("La Farrerr");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].priceRial, 8091000);
    const stem = await adapter.search("Trec");
    assert.equal(stem.length, 1);
  } finally {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("darukade: form/unit-only queries name no product and return nothing", async () => {
  // Review BLOCK (2026-11-17): the identity guard used to be skipped
  // entirely when a query had no identity token, so «قرص» returned
  // every tablet matchScore could recall. Zero identity → no hits.
  const { dir, path } = makeFixtureDb();
  const adapter = new DarukadeAdapter(path);
  try {
    assert.deepEqual(await adapter.search("قرص"), []);
    assert.deepEqual(await adapter.search("میلی گرم 500"), []);
    assert.deepEqual(await adapter.search("شربت"), []);
  } finally {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("darukade: alef-mismatched brand queries reach their rows in both directions", async () => {
  const { dir, path } = makeFixtureDb();
  const adapter = new DarukadeAdapter(path);
  try {
    const typedAlef = await adapter.search("لورآل"); // typed آ, stored «لورال»
    assert.equal(typedAlef.length, 1);
    assert.equal(typedAlef[0].priceRial, 643000);
    const typedPlain = await adapter.search("ابادیس"); // typed ا, stored «آبادیس»
    assert.equal(typedPlain.length, 1);
    assert.equal(typedPlain[0].priceRial, 1200000);
  } finally {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("darukade: bare-name query returns the variant family", async () => {
  const { dir, path } = makeFixtureDb();
  const adapter = new DarukadeAdapter(path);
  try {
    const hits = await adapter.search("وانا آیرون");
    assert.equal(hits.length, 2);
  } finally {
    adapter.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

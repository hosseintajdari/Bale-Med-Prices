/**
 * Darukade adapter (darukade.com) — the production price backbone.
 *
 * Reads the locally harvested Darukade catalog (SQLite, harvested by the
 * server-side scraper cron from darukade.com's public Next.js data) —
 * it does NOT scrape at request time:
 *
 * - DB path from `DARUKADE_DB_PATH` (constructor arg wins for tests).
 * - Opened READ-ONLY (`node:sqlite`, readOnly) — this service never writes
 *   the catalog; the scraper owns it. Per-pharmacy data is never read here:
 *   this catalog is public price data only (ماده ۶ — no pooling, ever).
 * - Prices in the DB are Toman (`price_toman` = final/discounted price);
 *   hits are normalized to Rial via `tomanToRial`.
 * - `fetched_at` becomes `crawledAt` — a row without it is dropped
 *   (no dateless prices, ever).
 * - Missing/unreadable DB = adapter silently disabled: search → [],
 *   health → false. The bot must keep working on the remaining sources.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { normalizeSearchText } from "../../search/search-normalization.ts";
import { matchScore } from "./delgarm-adapter.ts";
import { tomanToRial, type PriceHit, type SourceAdapter } from "./types.ts";

const MATCH_THRESHOLD = 0.5;
const MAX_CANDIDATES = 500;

export interface DarukadeRow {
  url: string;
  name: string | null;
  variant_title: string | null;
  brand_fa: string | null;
  brand_en: string | null;
  price_toman: number | null;
  fetched_at: string | null;
}

/** Map one catalog row to a PriceHit; null when the row cannot be trusted. */
export function rowToHit(row: DarukadeRow): PriceHit | null {
  const name = (row.name ?? "").trim();
  const priceToman = Number(row.price_toman);
  const crawledAt = (row.fetched_at ?? "").trim();
  if (!name || !row.url || !crawledAt) {
    return null;
  }
  if (!Number.isFinite(priceToman) || priceToman <= 0) {
    return null;
  }
  const variant = (row.variant_title ?? "").trim();
  const brand = (row.brand_fa ?? row.brand_en ?? "").trim();
  const productName = [name, variant].filter(Boolean).join(" — ") + (brand ? ` (${brand})` : "");
  return {
    productName,
    priceRial: tomanToRial(priceToman),
    url: row.url,
    sourceName: "darukade",
    crawledAt
  };
}

export class DarukadeAdapter implements SourceAdapter {
  readonly name = "darukade";
  private readonly dbPath: string | undefined;
  private db: DatabaseSync | null | undefined; // undefined = not tried yet

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? process.env.DARUKADE_DB_PATH;
  }

  private open(): DatabaseSync | null {
    if (this.db !== undefined) {
      return this.db;
    }
    this.db = null;
    if (!this.dbPath || !existsSync(this.dbPath)) {
      return null;
    }
    try {
      this.db = new DatabaseSync(this.dbPath, { readOnly: true });
    } catch {
      this.db = null;
    }
    return this.db;
  }

  async search(product: string, topN = 5): Promise<PriceHit[]> {
    const db = this.open();
    if (!db) {
      return [];
    }
    const query = product.trim();
    if (query.length < 2) {
      return [];
    }
    // Candidate pull: any name/brand token match (raw LIKE on the longest
    // token keeps the pull small), then the shared fuzzy scorer ranks.
    const tokens = normalizeSearchText(query).split(" ").filter((t) => t.length > 1);
    const probe = tokens.sort((a, b) => b.length - a.length)[0] ?? query;
    let rows: DarukadeRow[];
    try {
      rows = db
        .prepare(
          `SELECT url, name, variant_title, brand_fa, brand_en, price_toman, fetched_at
           FROM darukade_products
           WHERE price_toman IS NOT NULL AND price_toman > 0
             AND fetched_at IS NOT NULL
             AND (name LIKE ? OR brand_fa LIKE ? OR brand_en LIKE ?)
           LIMIT ${MAX_CANDIDATES}`
        )
        .all(`%${probe}%`, `%${probe}%`, `%${probe}%`) as DarukadeRow[];
    } catch {
      return [];
    }
    const scored: { hit: PriceHit; score: number }[] = [];
    for (const row of rows) {
      const hit = rowToHit(row);
      if (!hit) {
        continue;
      }
      const score = Math.max(
        matchScore(query, row.name ?? ""),
        row.brand_en ? matchScore(query, row.brand_en) : 0,
        row.brand_fa ? matchScore(query, `${row.name ?? ""} ${row.brand_fa}`) : 0
      );
      if (score >= MATCH_THRESHOLD) {
        scored.push({ hit, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map((s) => s.hit);
  }

  async health(): Promise<boolean> {
    const db = this.open();
    if (!db) {
      return false;
    }
    try {
      const row = db.prepare("SELECT count(*) AS n FROM darukade_products").get() as { n: number };
      return Number(row?.n) > 0;
    } catch {
      return false;
    }
  }

  close(): void {
    try {
      this.db?.close();
    } catch {
      // already closed — nothing to do
    }
    this.db = null;
  }
}

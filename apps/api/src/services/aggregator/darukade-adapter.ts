/**
 * Darukade adapter (darukade.com) — serves prices from the local Darukade
 * catalog snapshot instead of live crawling.
 *
 * The snapshot is produced on this host by the scraper pipeline
 * (~/scrapers, daily cron) into a SQLite DB (table darukade_products,
 * prices in toman). This adapter opens it READ-ONLY per search:
 * - prices normalized to Rial (toman x 10), like every other adapter
 * - crawledAt = the row real fetched_at — no dateless prices
 * - rows with price_toman <= 0 are dropped (no price = no hit)
 * - name matching reuses delgarm matchScore (0.7 token recall + 0.3
 *   bigram similarity) with the same 0.55 threshold, so all sources
 *   rank consistently
 *
 * DB path: env DARUKADE_DB_PATH, default /app/data/scrapers/darukade.sqlite3
 * (mounted read-only into the api container by docker-compose).
 * Missing/unreadable DB -> empty array (never an error); health() reports
 * whether the snapshot is readable.
 */
import { DatabaseSync } from "node:sqlite";
import { matchScore } from "./delgarm-adapter.ts";
import { tomanToRial, type PriceHit, type SourceAdapter } from "./types.ts";

const MATCH_THRESHOLD = 0.55;
const DEFAULT_DB_PATH = "/app/data/scrapers/darukade.sqlite3";

export interface DarukadeRow {
  name: string | null;
  variant_title: string | null;
  url: string;
  price_toman: number;
  fetched_at: string;
}

export function hitFromRow(row: DarukadeRow): PriceHit | null {
  const priceToman = Number(row?.price_toman) || 0;
  if (!row || priceToman <= 0 || !row.name || !row.fetched_at) {
    return null;
  }
  const variant = (row.variant_title || "").trim();
  return {
    productName: variant ? `${row.name} (${variant})` : row.name,
    priceRial: tomanToRial(priceToman),
    url: row.url,
    sourceName: "darukade",
    crawledAt: row.fetched_at
  };
}

function dbPath(): string {
  return process.env.DARUKADE_DB_PATH || DEFAULT_DB_PATH;
}

function readRows(): DarukadeRow[] {
  const db = new DatabaseSync(dbPath(), { readOnly: true });
  try {
    const rows = db
      .prepare(
        "SELECT name, variant_title, url, price_toman, fetched_at FROM darukade_products WHERE price_toman > 0"
      )
      .all();
    return rows as unknown as DarukadeRow[];
  } finally {
    db.close();
  }
}

export class DarukadeAdapter implements SourceAdapter {
  readonly name = "darukade";

  async search(product: string, topN = 5): Promise<PriceHit[]> {
    let rows: DarukadeRow[];
    try {
      rows = readRows();
    } catch {
      return []; // snapshot missing/unreadable: nothing found, never an error
    }

    const scored: { hit: PriceHit; score: number }[] = [];
    const seenNames = new Set<string>();
    for (const row of rows) {
      const hit = hitFromRow(row);
      if (!hit || seenNames.has(hit.productName)) {
        continue;
      }
      const score = matchScore(product, hit.productName);
      if (score < MATCH_THRESHOLD) {
        continue;
      }
      seenNames.add(hit.productName);
      scored.push({ hit, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map((entry) => entry.hit);
  }

  async health(): Promise<boolean> {
    try {
      const db = new DatabaseSync(dbPath(), { readOnly: true });
      try {
        db.prepare("SELECT COUNT(*) AS n FROM darukade_products").get();
        return true;
      } finally {
        db.close();
      }
    } catch {
      return false;
    }
  }
}

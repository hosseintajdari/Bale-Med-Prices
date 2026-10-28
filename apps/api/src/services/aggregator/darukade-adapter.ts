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
import { existsSync, statSync } from "node:fs";
import { normalizeSearchText } from "../../search/search-normalization.ts";
import { matchScore } from "./delgarm-adapter.ts";
import { tomanToRial, type PriceHit, type SourceAdapter } from "./types.ts";

const MATCH_THRESHOLD = 0.5;
const MAX_CANDIDATES = 500;

export interface DarukadeRow {
  url: string;
  variant_idx?: number;
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
  if (!name || !row.url || !crawledAt || Number.isNaN(Date.parse(crawledAt))) {
    return null; // no dateless prices — and no garbage dates either
  }
  if (!Number.isFinite(priceToman) || priceToman <= 0) {
    return null;
  }
  const variant = (row.variant_title ?? "").trim();
  const brand = (row.brand_fa ?? "").trim() || (row.brand_en ?? "").trim();
  const productName = [name, variant].filter(Boolean).join(" — ") + (brand ? ` (${brand})` : "");
  return {
    productName,
    priceRial: tomanToRial(priceToman),
    url: row.url,
    sourceName: "darukade",
    crawledAt
  };
}

/** Escape LIKE wildcards so a query token is matched literally. */
function likeEscape(token: string): string {
  return token.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Probe forms for one token: the normalized form plus its Arabic-letter
 * variant (ی→ي، ک→ك), because catalog text is stored raw while queries are
 * normalized — the SQL pull must not miss rows the scorer would accept.
 */
function probeForms(token: string): string[] {
  const forms = new Set<string>([token]);
  const arabic = token.replace(/ی/g, "ي").replace(/ک/g, "ك");
  forms.add(arabic);
  return [...forms];
}

export class DarukadeAdapter implements SourceAdapter {
  readonly name = "darukade";
  private readonly dbPath: string | undefined;
  private db: DatabaseSync | null = null;
  private dbMtimeMs = -1; // mtime of the file the open handle points at

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? process.env.DARUKADE_DB_PATH;
  }

  /**
   * Open (or re-open) the catalog. The handle follows the file: if the
   * harvester replaces the DB (mtime changes) or the file appears after
   * startup, the next call picks it up — an API started before the first
   * harvest must not stay blind for its whole process life.
   */
  private open(): DatabaseSync | null {
    if (!this.dbPath || !existsSync(this.dbPath)) {
      this.closeHandle();
      return null;
    }
    let mtimeMs: number;
    try {
      mtimeMs = statSync(this.dbPath).mtimeMs;
    } catch {
      this.closeHandle();
      return null;
    }
    if (this.db && mtimeMs === this.dbMtimeMs) {
      return this.db;
    }
    this.closeHandle();
    try {
      this.db = new DatabaseSync(this.dbPath, { readOnly: true });
      this.dbMtimeMs = mtimeMs;
    } catch {
      this.db = null;
      this.dbMtimeMs = -1;
    }
    return this.db;
  }

  private closeHandle(): void {
    try {
      this.db?.close();
    } catch {
      // already closed — nothing to do
    }
    this.db = null;
    this.dbMtimeMs = -1;
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
    // Candidate pull: LIKE on EVERY query token (name, variant and brand
    // columns, both letter forms), deduplicated — then the shared fuzzy
    // scorer ranks. A single-probe pull would silently lose recall.
    const tokens = [...new Set(normalizeSearchText(query).split(" ").filter((t) => t.length > 1))].slice(0, 4);
    const probes = (tokens.length > 0 ? tokens : [query]).flatMap(probeForms);
    const likes = probes.map(() => "(name LIKE ? ESCAPE '\\' OR variant_title LIKE ? ESCAPE '\\' OR brand_fa LIKE ? ESCAPE '\\' OR brand_en LIKE ? ESCAPE '\\')").join(" OR ");
    const params = probes.flatMap((p) => {
      const like = `%${likeEscape(p)}%`;
      return [like, like, like, like];
    });
    let rows: DarukadeRow[];
    try {
      rows = db
        .prepare(
          `SELECT url, variant_idx, name, variant_title, brand_fa, brand_en, price_toman, fetched_at
           FROM darukade_products
           WHERE price_toman IS NOT NULL AND price_toman > 0
             AND fetched_at IS NOT NULL
             AND (${likes})
           LIMIT ${MAX_CANDIDATES}`
        )
        .all(...params) as DarukadeRow[];
    } catch {
      return [];
    }
    const seenRows = new Set<string>();
    rows = rows.filter((r) => {
      const key = `${r.url}|${r.variant_idx ?? ""}|${r.variant_title ?? ""}`;
      if (seenRows.has(key)) {
        return false;
      }
      seenRows.add(key);
      return true;
    });
    const scored: { hit: PriceHit; score: number }[] = [];
    for (const row of rows) {
      const hit = rowToHit(row);
      if (!hit) {
        continue;
      }
      const score = Math.max(
        matchScore(query, row.name ?? ""),
        row.variant_title ? matchScore(query, `${row.name ?? ""} ${row.variant_title}`) : 0,
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

  /** Close the handle; the adapter stays usable — the next call re-opens. */
  close(): void {
    this.closeHandle();
  }
}

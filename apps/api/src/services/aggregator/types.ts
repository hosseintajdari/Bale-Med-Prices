/**
 * Aggregator contracts — TypeScript port of scrapers/base.py.
 *
 * Every web price source implements `SourceAdapter`. Rules carried over:
 * - prices are normalized to Rial (toman × 10)
 * - `crawledAt` is REQUIRED on every hit: a dateless price cannot be built
 * - read-only public access: no login, no credentials
 * - 429/403 → RateLimitedError: stop and report, never blind-retry
 */

export interface PriceHit {
  /** Product name exactly as the source wrote it. */
  productName: string;
  /** Price in Rial (already normalized from toman). */
  priceRial: number;
  /** Source page URL. */
  url: string;
  /** Adapter name, e.g. "torob". */
  sourceName: string;
  /** ISO timestamp of the crawl. Mandatory — no dateless prices. */
  crawledAt: string;
  /** Source-side stock state when the source reports it (e.g. darukade). */
  inStock?: boolean;
}

export class RateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitedError";
  }
}

export interface SourceAdapter {
  readonly name: string;
  /**
   * Product name (Persian) → price hits. Empty array = nothing found,
   * never an error — except RateLimitedError, which must propagate.
   */
  search(product: string, topN?: number): Promise<PriceHit[]>;
  /** Is the source alive? For periodic monitoring. */
  health(): Promise<boolean>;
}

/** Toman → Rial. Torob/Delgarm quote in toman. */
export function tomanToRial(toman: number): number {
  return Math.round(toman) * 10;
}

export function nowIso(): string {
  return new Date().toISOString();
}

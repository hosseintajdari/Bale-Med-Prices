/**
 * Aggregator service — runs the registered web price adapters.
 *
 * This is the TypeScript home of the Python prototype's adapter contract:
 * adapters plug into the existing search flow (goods-service), not a
 * parallel system. Read-only public access; RateLimitedError propagates
 * so callers stop and report instead of blind-retrying.
 */
import { DarukadeAdapter } from "./darukade-adapter.ts";
import { DelgarmAdapter } from "./delgarm-adapter.ts";
import { RateLimitedError, type PriceHit, type SourceAdapter } from "./types.ts";

// Production adapter order (owner order 2026-10-26, wired on the server
// first, ported into the repo on gorgg/production):
// darukade = price backbone (local harvested catalog, trusted, dated);
// delgarm = live fallback. Torob is OUT of the live array — its adapter
// file stays on disk, shelved (owner verdict: drug prices aren't its
// thing; its API also captcha-blocks the server IP).
const adapters: SourceAdapter[] = [new DarukadeAdapter(), new DelgarmAdapter()];

export const aggregatorService = {
  /** Registered adapter names, in priority order. */
  adapterNames: adapters.map((adapter) => adapter.name),

  /**
   * Product name → deduplicated price hits across adapters.
   * Never throws for "not found" (empty array); RateLimitedError propagates.
   */
  async searchWeb(product: string, topN = 5): Promise<PriceHit[]> {
    const query = product.trim();
    if (query.length < 2) {
      return [];
    }

    const hits: PriceHit[] = [];
    const seen = new Set<string>();

    for (const adapter of adapters) {
      let partial: PriceHit[] = [];
      try {
        partial = await adapter.search(query, topN);
      } catch (error) {
        if (error instanceof RateLimitedError) {
          throw error;
        }
        continue; // this adapter failed; try the next one
      }

      for (const hit of partial) {
        const key = `${hit.sourceName}|${hit.productName}`;
        if (!seen.has(key)) {
          seen.add(key);
          hits.push(hit);
        }
        if (hits.length >= topN * adapters.length) {
          break;
        }
      }
    }

    return hits;
  },

  async health(): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const adapter of adapters) {
      result[adapter.name] = await adapter.health();
    }
    return result;
  }
};

/**
 * Aggregator service — runs the registered web price adapters.
 *
 * This is the TypeScript home of the Python prototype's adapter contract:
 * adapters plug into the existing search flow (goods-service), not a
 * parallel system. Read-only public access.
 *
 * Resilience contract (QA 2026-10-30: one slow/rate-limited adapter used to
 * kill or stall the whole answer):
 * - adapters run in PARALLEL, never serial
 * - each adapter has a time budget (min of WEB_ADAPTER_TIMEOUT_MS and
 *   WEB_FANOUT_BUDGET_MS); a slow adapter loses the race, it cannot stall
 *   the response
 * - adapter errors — including RateLimitedError — are isolated: hits from
 *   the healthy adapters still come back; searchWeb never throws for a
 *   source failure
 * - results are cached in-memory for a SHORT TTL (prices go stale; the cap
 *   is hard-limited to 5 minutes) so bursts don't hammer upstream sources
 *   into rate-limiting us
 */
import { normalizeSearchText } from "../../search/search-normalization.ts";
import { DarukadeAdapter } from "./darukade-adapter.ts";
import { DelgarmAdapter } from "./delgarm-adapter.ts";
import { RateLimitedError, type PriceHit, type SourceAdapter } from "./types.ts";

const adapters: SourceAdapter[] = [new DarukadeAdapter(), new DelgarmAdapter()];

const DEFAULT_ADAPTER_TIMEOUT_MS = 2500;
const DEFAULT_FANOUT_BUDGET_MS = 2500;
const DEFAULT_CACHE_TTL_MS = 120_000;
const NEGATIVE_CACHE_TTL_MS = 60_000;
/** Hard cap: stale prices are worse than no prices. Not configurable past this. */
const MAX_CACHE_TTL_MS = 300_000;
const MAX_ADAPTER_TIMEOUT_MS = 10_000;
const MAX_CACHE_ENTRIES = 200;

export type SourceStatus =
  | "ok"
  | "empty"
  | "cached"
  | "timeout"
  | "rate-limited"
  | "error";

export interface SourceOutcome {
  name: string;
  status: SourceStatus;
  hitCount: number;
  elapsedMs: number;
}

export interface WebSearchMeta {
  sources: SourceOutcome[];
  cached: boolean;
  elapsedMs: number;
}

export interface WebSearchResult {
  hits: PriceHit[];
  meta: WebSearchMeta;
}

interface CacheEntry {
  hits: PriceHit[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function envNumber(name: string, fallback: number, max: number): number {
  const parsed = Number(process.env[name] ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.round(parsed), max);
}

function adapterTimeoutMs(): number {
  return Math.min(
    envNumber("WEB_ADAPTER_TIMEOUT_MS", DEFAULT_ADAPTER_TIMEOUT_MS, MAX_ADAPTER_TIMEOUT_MS),
    envNumber("WEB_FANOUT_BUDGET_MS", DEFAULT_FANOUT_BUDGET_MS, MAX_ADAPTER_TIMEOUT_MS)
  );
}

export function cacheTtlMs(): number {
  return envNumber("WEB_CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS, MAX_CACHE_TTL_MS);
}

/** For tests: inject time and reset cached state. */
export function resetWebCacheForTest(): void {
  cache.clear();
}

function cacheKey(product: string): string {
  return normalizeSearchText(product);
}

function readCache(key: string, now: number): PriceHit[] | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return entry.hits;
}

function writeCache(key: string, hits: PriceHit[], now: number): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    for (const [staleKey, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(staleKey);
      }
    }
  }
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  const ttl = hits.length > 0 ? cacheTtlMs() : NEGATIVE_CACHE_TTL_MS;
  cache.set(key, { hits, expiresAt: now + ttl });
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function statusFor(error: unknown): SourceStatus {
  return error instanceof RateLimitedError ? "rate-limited" : "error";
}

/**
 * Core fan-out over an explicit adapter list — the seam tests (and future
 * callers) use to run the resilience logic against fake adapters.
 */
export async function searchWithAdapters(
  sourceAdapters: SourceAdapter[],
  product: string,
  topN = 5,
  now: number = Date.now()
): Promise<WebSearchResult> {
  const query = product.trim();
  if (query.length < 2) {
    return {
      hits: [],
      meta: { sources: [], cached: false, elapsedMs: 0 }
    };
  }

  const key = cacheKey(query);
  const cachedHits = readCache(key, now);
  if (cachedHits) {
    return {
      hits: cachedHits,
      meta: {
        sources: sourceAdapters.map((adapter) => ({
          name: adapter.name,
          status: "cached" as const,
          hitCount: 0,
          elapsedMs: 0
        })),
        cached: true,
        elapsedMs: 0
      }
    };
  }

  const timeoutMs = adapterTimeoutMs();
  const startedAt = now;

  const settled = await Promise.allSettled(
    sourceAdapters.map(async (adapter) => {
      const adapterStart = Date.now();
      try {
        const partial = await withTimeout(adapter.search(query, topN), timeoutMs, () =>
          new Error(`${adapter.name} timed out after ${timeoutMs}ms`)
        );
        return {
          outcome: {
            name: adapter.name,
            status: (partial.length > 0 ? "ok" : "empty") as SourceStatus,
            hitCount: partial.length,
            elapsedMs: Date.now() - adapterStart
          },
          partial
        };
      } catch (error) {
        return {
          outcome: {
            name: adapter.name,
            status: statusFor(error),
            hitCount: 0,
            elapsedMs: Date.now() - adapterStart
          },
          partial: [] as PriceHit[]
        };
      }
    })
  );

  const outcomes: SourceOutcome[] = [];
  const hits: PriceHit[] = [];
  const seen = new Set<string>();
  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue; // defensive: adapters already catch internally
    }
    outcomes.push(result.value.outcome);
    for (const hit of result.value.partial) {
      const dedupeKey = `${hit.sourceName}|${hit.productName}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        hits.push(hit);
      }
      if (hits.length >= topN * sourceAdapters.length) {
        break;
      }
    }
  }

  writeCache(key, hits, now);

  return {
    hits,
    meta: {
      sources: outcomes,
      cached: false,
      elapsedMs: Date.now() - startedAt
    }
  };
}

export const aggregatorService = {
  /** Registered adapter names, in priority order. */
  adapterNames: adapters.map((adapter) => adapter.name),

  /**
   * Product name → deduplicated price hits across adapters.
   * Never throws for "not found" (empty array) and never throws for a
   * source failure either (rate-limit/timeout of one source degrades the
   * answer, it does not kill it).
   */
  async searchWeb(product: string, topN = 5): Promise<PriceHit[]> {
    const { hits } = await this.searchWebWithMeta(product, topN);
    return hits;
  },

  /** Same fan-out, plus per-source outcomes for observability/degrade labels. */
  async searchWebWithMeta(product: string, topN = 5): Promise<WebSearchResult> {
    return searchWithAdapters(adapters, product, topN);
  },

  async health(): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const adapter of adapters) {
      result[adapter.name] = await adapter.health();
    }
    return result;
  }
};

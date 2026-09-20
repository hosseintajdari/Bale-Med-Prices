/**
 * Price Response Cache Service for Bale-Med-Prices.
 *
 * Provides in-memory LRU caching with configurable TTL and deterministic
 * key generation for medicine pricing calculations and response payloads.
 */

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_ENTRIES = 1000;

interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  createdAt: number;
  accessedAt: number;
  expiresAt: number;
}

interface PriceCacheStats {
  hits: number;
  misses: number;
  size: number;
  maxEntries: number;
  evictions: number;
  defaultTtlMs: number;
}

interface PricingKeyInput {
  goodId?: string;
  documentDate?: string;
  quantity?: number | string;
  warehouseId?: string;
  includeTechnicalFee?: boolean | string;
  [key: string]: unknown;
}

function now(): number {
  return Date.now();
}

function getConfiguredTtlMs(): number {
  const configured = Number(process.env.PRICE_CACHE_TTL_MS ?? "");
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_CACHE_TTL_MS;
  }
  return configured;
}

function getConfiguredMaxEntries(): number {
  const configured = Number(process.env.PRICE_CACHE_MAX_ENTRIES ?? "");
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_ENTRIES;
  }
  return configured;
}

export class PriceCacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;
  private accessCounter: number = 0;

  /**
   * Generates a deterministic cache key for pricing input.
   */
  createKey(input: PricingKeyInput, format?: string): string {
    const goodId = String(input.goodId ?? "").trim();
    const documentDate = String(input.documentDate ?? "").trim();
    const quantity = Number(input.quantity ?? 1);
    const warehouseId = String(input.warehouseId ?? "main").trim();
    const includeFee = Boolean(input.includeTechnicalFee);
    const fmt = format ? String(format).trim().toLowerCase() : "standard";

    return `price:${goodId}:${documentDate}:q${quantity}:w${warehouseId}:fee${includeFee ? 1 : 0}:fmt${fmt}`;
  }

  /**
   * Retrieves a cached entry if available and not expired.
   */
  get<T = unknown>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (entry.expiresAt <= now()) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Refresh access sequence for LRU
    entry.accessedAt = ++this.accessCounter;
    this.hits++;

    // Return deep clone or copy to prevent mutation of cached data
    return JSON.parse(JSON.stringify(entry.data)) as T;
  }

  /**
   * Stores a response in the cache with optional custom TTL.
   */
  set<T = unknown>(key: string, data: T, ttlMs: number = getConfiguredTtlMs()): void {
    const maxEntries = getConfiguredMaxEntries();

    // Evict oldest accessed entry if at capacity
    if (this.cache.size >= maxEntries && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    const currentTime = now();
    const entry: CacheEntry = {
      key,
      data: JSON.parse(JSON.stringify(data)),
      createdAt: currentTime,
      accessedAt: ++this.accessCounter,
      expiresAt: currentTime + ttlMs
    };

    this.cache.set(key, entry);
  }

  /**
   * Checks if a non-expired key exists without updating hit/miss stats.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= now()) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Invalidates cached entries by goodId or all if omitted.
   */
  invalidate(filter?: { goodId?: string }): number {
    if (!filter || !filter.goodId) {
      const count = this.cache.size;
      this.cache.clear();
      return count;
    }

    const prefix = `price:${String(filter.goodId).trim()}:`;
    let removed = 0;

    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Evicts the least-recently-used entry.
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestAccessTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessedAt < oldestAccessTime) {
        oldestAccessTime = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
      this.evictions++;
    }
  }

  /**
   * Returns runtime statistics.
   */
  getStats(): PriceCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxEntries: getConfiguredMaxEntries(),
      evictions: this.evictions,
      defaultTtlMs: getConfiguredTtlMs()
    };
  }

  /**
   * Resets cache state and counters for testing.
   */
  resetForTest(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.accessCounter = 0;
  }
}

export const priceCacheService = new PriceCacheService();

/**
 * Torob adapter (torob.com) — TypeScript port of scrapers/torob.py.
 *
 * Primary path: torob's own public search API (the same API its frontend
 * consumes — no login, no key). The API quotes in toman → ×10 = rial.
 * Fallback path: google-discovery finds a product page, then the public
 * details API resolves its price.
 *
 * Empty array = nothing found (never an error).
 * 429/403 → RateLimitedError: stop and report.
 */
import { politeFetch } from "./http.ts";
import { discover } from "./google-discovery.ts";
import {
  nowIso,
  tomanToRial,
  RateLimitedError,
  type PriceHit,
  type SourceAdapter
} from "./types.ts";

const SEARCH_API = "https://api.torob.com/v4/base-product/search/";
const DETAILS_API = "https://api.torob.com/v4/base-product/details/";

interface TorobApiItem {
  name1?: string;
  price?: number | string;
  web_client_absolute_url?: string;
}

export function hitFromApiItem(item: TorobApiItem): PriceHit | null {
  const priceToman = Number(item?.price) || 0;
  if (!priceToman || priceToman <= 0) {
    return null;
  }
  const rel = item.web_client_absolute_url || "";
  const url = rel.startsWith("/") ? `https://torob.com${rel}` : rel;
  return {
    productName: (item.name1 || "").trim(),
    priceRial: tomanToRial(priceToman),
    url,
    sourceName: "torob",
    crawledAt: nowIso()
  };
}

async function getJson(url: string): Promise<any> {
  const response = await politeFetch(url, {}, 600);
  // RateLimitedError propagates from politeFetch.
  if (!response.ok) {
    throw new Error(`torob API returned ${response.status}`);
  }
  return response.json();
}

export class TorobAdapter implements SourceAdapter {
  readonly name = "torob";

  async search(product: string, topN = 5): Promise<PriceHit[]> {
    const hits: PriceHit[] = [];

    // Primary path: public search API.
    try {
      const q = encodeURIComponent(product.trim());
      const data = await getJson(`${SEARCH_API}?q=${q}&page=1`);
      for (const item of (data.results ?? []).slice(0, topN * 2)) {
        const hit = hitFromApiItem(item);
        if (hit) {
          hits.push(hit);
        }
        if (hits.length >= topN) {
          break;
        }
      }
      if (hits.length > 0) {
        return hits;
      }
    } catch (error) {
      if (error instanceof RateLimitedError) {
        throw error;
      }
      // Fall through to the discovery path.
    }

    // Fallback path: discover a product page, resolve price via details API.
    try {
      const urls = await discover(product, { site: "torob.com", maxResults: 6 });
      for (const url of urls) {
        const match = url.match(/\/p\/([0-9a-f-]{36})\//);
        if (!match) {
          continue;
        }
        try {
          const details = await getJson(
            `${DETAILS_API}?prk=${match[1]}&max_seller_count=1&source=next_desktop`
          );
          const hit = hitFromApiItem({
            name1: details.name1,
            price: details.price,
            web_client_absolute_url: details.web_client_absolute_url
          });
          if (hit) {
            hits.push(hit);
          }
          if (hits.length >= topN) {
            break;
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      if (error instanceof RateLimitedError) {
        throw error;
      }
    }

    return hits;
  }

  async health(): Promise<boolean> {
    try {
      await this.search("__healthcheck__");
      return true;
    } catch {
      return false;
    }
  }
}

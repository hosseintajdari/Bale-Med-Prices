/**
 * Delgarm adapter (delgarm.com) — TypeScript port of scrapers/delgarm.py.
 *
 * Delgarm has no single product pages; it publishes daily "prices-list" pages:
 * 1. Discovery: google-discovery with site:delgarm.com (+ delgarm's own ?s= search)
 *    to find /prices-list/ pages.
 * 2. Row parsing: <td class="price_title">name</td> … <span>price</span> تومان.
 * 3. Fuzzy product-name matching → price (toman ×10 = rial).
 *
 * Empty array = nothing found (never an error).
 * 429/403 → RateLimitedError: stop and report.
 */
import { politeFetch } from "./http.ts";
import { discover } from "./google-discovery.ts";
import { normalizeSearchText } from "../../search/search-normalization.ts";
import {
  nowIso,
  tomanToRial,
  RateLimitedError,
  type PriceHit,
  type SourceAdapter
} from "./types.ts";

const BASE = "https://www.delgarm.com";
const MATCH_THRESHOLD = 0.55;

interface PriceRow {
  name: string;
  priceToman: number;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

export function parseRows(html: string): PriceRow[] {
  const rows: PriceRow[] = [];
  const pattern = /<td class="price_title">(.*?)<\/td>.*?<span>([\d,٬\s۰-۹]+)<\/span>/gs;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const name = stripTags(match[1]);
    const digits = normalizeSearchText(match[2]).replace(/[,\s٬]/g, "");
    if (name && /^\d+$/.test(digits)) {
      rows.push({ name, priceToman: Number(digits) });
    }
  }
  return rows;
}

function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    set.add(text.slice(i, i + 2));
  }
  return set;
}

function bigramSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }
  const a = bigrams(left);
  const b = bigrams(right);
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) {
      intersection++;
    }
  }
  return (2 * intersection) / (a.size + b.size);
}

/**
 * 0..1 match score — token recall blended with string similarity,
 * mirroring the Python port's 0.7/0.3 blend.
 */
export function matchScore(query: string, title: string): number {
  const q = normalizeSearchText(query);
  const t = normalizeSearchText(title);
  const queryTokens = q.split(" ").filter((w) => w.length > 1);
  if (queryTokens.length === 0) {
    return 0;
  }
  const titleTokens = new Set(t.split(" "));
  const tokenRecall = queryTokens.filter((w) => titleTokens.has(w)).length / queryTokens.length;
  return 0.7 * tokenRecall + 0.3 * bigramSimilarity(q, t);
}

async function getText(url: string): Promise<string> {
  const response = await politeFetch(url, {}, 800);
  if (!response.ok) {
    throw new Error(`delgarm returned ${response.status}`);
  }
  return response.text();
}

export class DelgarmAdapter implements SourceAdapter {
  readonly name = "delgarm";

  private async candidatePages(product: string): Promise<string[]> {
    const urls: string[] = [];
    const seen = new Set<string>();
    const add = (url: string) => {
      if (!seen.has(url) && url.includes("/prices-list/")) {
        seen.add(url);
        urls.push(url);
      }
    };

    // Path 1: web discovery.
    try {
      for (const url of await discover(product, { site: "delgarm.com", maxResults: 8 })) {
        add(url);
      }
    } catch (error) {
      if (error instanceof RateLimitedError) {
        throw error;
      }
    }

    // Path 2: delgarm's own internal search.
    try {
      const html = await getText(`${BASE}/?s=${encodeURIComponent(product.trim())}`);
      const pattern = /href="([^"]*?\/prices-list\/[^"]*)"/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        add(new URL(match[1], BASE).toString());
      }
    } catch (error) {
      if (error instanceof RateLimitedError) {
        throw error;
      }
    }

    return urls.slice(0, 6);
  }

  async search(product: string, topN = 5): Promise<PriceHit[]> {
    const hits: PriceHit[] = [];
    const seenNames = new Set<string>();

    for (const page of await this.candidatePages(product)) {
      let rows: PriceRow[];
      try {
        rows = parseRows(await getText(page));
      } catch (error) {
        if (error instanceof RateLimitedError) {
          throw error;
        }
        continue;
      }

      const scored = rows
        .map((row) => ({ ...row, score: matchScore(product, row.name) }))
        .sort((a, b) => b.score - a.score);

      for (const row of scored) {
        if (row.score < MATCH_THRESHOLD || row.priceToman <= 0) {
          continue;
        }
        const key = normalizeSearchText(row.name);
        if (seenNames.has(key)) {
          continue;
        }
        seenNames.add(key);
        hits.push({
          productName: row.name,
          priceRial: tomanToRial(row.priceToman),
          url: page,
          sourceName: "delgarm",
          crawledAt: nowIso()
        });
        if (hits.length >= topN) {
          return hits;
        }
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

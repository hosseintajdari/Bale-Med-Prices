/**
 * Candidate-link discovery — TypeScript port of scrapers/google_discovery.py.
 *
 * Sends the same price-hunting queries as plain unauthenticated HTTP to
 * DuckDuckGo's HTML endpoint (no API key, no login) and returns unique
 * candidate page URLs. This is the discovery stage, not extraction.
 */
import { politeFetch } from "./http.ts";
import { RateLimitedError } from "./types.ts";

const DDG_URL = "https://html.duckduckgo.com/html/";

export interface DiscoverOptions {
  site?: string;
  maxResults?: number;
}

export function buildQueries(product: string, site?: string): string[] {
  const p = product.trim();
  const queries = [`قیمت ${p}`, `${p} قیمت`];
  if (site) {
    queries.push(`site:${site} ${p} قیمت`, `${p} ${site}`);
  } else {
    queries.push(`${p} torob`, `${p} delgarm قیمت`);
  }
  return queries;
}

export function extractUrls(html: string): string[] {
  const urls: string[] = [];
  const pattern = /result__a"\s+href="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    let href = match[1];
    // DuckDuckGo sometimes wraps results in its own redirect: //duckduckgo.com/l/?uddg=<url>
    const redirect = href.match(/[?&]uddg=([^&]+)/);
    if (redirect) {
      href = decodeURIComponent(redirect[1]);
    }
    if (href.startsWith("//")) {
      href = "https:" + href;
    }
    if (href.startsWith("http")) {
      urls.push(href);
    }
  }
  return urls;
}

export async function discover(product: string, options: DiscoverOptions = {}): Promise<string[]> {
  const { site, maxResults = 12 } = options;
  const seen = new Set<string>();
  const out: string[] = [];

  try {
    for (const query of buildQueries(product, site)) {
      let html: string;
      try {
        const response = await politeFetch(DDG_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `q=${encodeURIComponent(query)}`
        });
        html = await response.text();
      } catch (error) {
        if (error instanceof RateLimitedError) {
          throw error;
        }
        continue; // this query failed; try the next one
      }

      for (const url of extractUrls(html)) {
        if (site && !new URL(url).hostname.includes(site)) {
          continue;
        }
        if (!seen.has(url)) {
          seen.add(url);
          out.push(url);
        }
        if (out.length >= maxResults) {
          return out;
        }
      }
    }
  } catch (error) {
    if (error instanceof RateLimitedError) {
      throw error;
    }
  }

  return out;
}

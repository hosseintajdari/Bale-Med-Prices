/**
 * Polite HTTP client — TypeScript port of google_discovery.make_client().
 *
 * - Enforces a minimum gap between requests per host.
 * - Throws RateLimitedError on 429/403 (stop and report).
 * - Plain global fetch: this repo is zero-dependency; Node 22+ fetch
 *   is enough (verified: direct egress works, no proxy config needed).
 */
import { RateLimitedError } from "./types.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const lastRequestAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function politeFetch(
  url: string,
  init: RequestInit = {},
  gapMs = 700,
  timeoutMs = 20000
): Promise<Response> {
  const host = new URL(url).host;
  const last = lastRequestAt.get(host) ?? 0;
  const wait = gapMs - (Date.now() - last);
  if (wait > 0) {
    await sleep(wait);
  }
  lastRequestAt.set(host, Date.now());

  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...(init.headers ?? {}) },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (response.status === 429 || response.status === 403) {
    throw new RateLimitedError(`${host} returned ${response.status} — stop and report.`);
  }

  return response;
}

/** For tests: reset the politeness clock. */
export function resetPolitenessForTest(): void {
  lastRequestAt.clear();
}

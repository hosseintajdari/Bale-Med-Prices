/**
 * Minimal per-IP token-bucket rate limiter (Fixes #34).
 *
 * Guards the expensive endpoints (/pricing/calculate, /goods/search,
 * /bot/lookup, /bot/select) against accidental or deliberate hammering.
 * In-memory only — a restart resets the buckets, which is acceptable for
 * this deployment shape.
 */

const DEFAULT_CAPACITY = 60;
const DEFAULT_REFILL_PER_SECOND = 1; // 60 requests/minute sustained

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();

function capacity() {
  const configured = Number(process.env.RATE_LIMIT_CAPACITY ?? "");
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_CAPACITY;
}

function refillPerSecond() {
  const configured = Number(process.env.RATE_LIMIT_REFILL_PER_SECOND ?? "");
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REFILL_PER_SECOND;
}

function clientIp(request) {
  const forwarded = request.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress ?? "unknown";
}

export function isRateLimited(request) {
  const key = `${clientIp(request)}`;
  const nowMs = Date.now();
  const cap = capacity();
  const refill = refillPerSecond();

  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: cap, lastRefillMs: nowMs };
    buckets.set(key, bucket);
  } else {
    const elapsedSeconds = (nowMs - bucket.lastRefillMs) / 1000;
    bucket.tokens = Math.min(cap, bucket.tokens + elapsedSeconds * refill);
    bucket.lastRefillMs = nowMs;
  }

  if (bucket.tokens < 1) {
    return true;
  }

  bucket.tokens -= 1;
  return false;
}

export function resetForTest() {
  buckets.clear();
}

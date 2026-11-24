/**
 * Minimal token-bucket rate limiter (Fixes #34).
 *
 * Guards the expensive endpoints (/pricing/calculate, /goods/search,
 * /bot/lookup, /bot/select) against accidental or deliberate hammering.
 * In-memory only — a restart resets the buckets, which is acceptable for
 * this deployment shape.
 *
 * The prescription-basket path (/bot/prescription) has its OWN bucket
 * keyed per basket (UserSim round 2, A5): the bot layer reaches this
 * API from a single host, so a per-IP bucket would be shared by every
 * patient and would 429 under real load. A basket belongs to one chat,
 * so `basketId` is the per-user key; basket-less calls (action=start)
 * fall back to the caller's IP inside the same separate bucket.
 */

const DEFAULT_CAPACITY = 60;
const DEFAULT_REFILL_PER_SECOND = 1; // 60 requests/minute sustained

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();
const prescriptionBuckets = new Map<string, Bucket>();

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

function consume(bucketMap: Map<string, Bucket>, key: string): boolean {
  const nowMs = Date.now();
  const cap = capacity();
  const refill = refillPerSecond();

  let bucket = bucketMap.get(key);

  if (!bucket) {
    bucket = { tokens: cap, lastRefillMs: nowMs };
    bucketMap.set(key, bucket);
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

export function isRateLimited(request) {
  return consume(buckets, `${clientIp(request)}`);
}

export function isPrescriptionRateLimited(request) {
  let basketId = "";
  try {
    basketId = new URL(request.url ?? "", "http://localhost").searchParams.get("basketId") ?? "";
  } catch {
    basketId = "";
  }

  const key = basketId ? `rx:${basketId}` : `rx-ip:${clientIp(request)}`;
  return consume(prescriptionBuckets, key);
}

export function resetForTest() {
  buckets.clear();
  prescriptionBuckets.clear();
}

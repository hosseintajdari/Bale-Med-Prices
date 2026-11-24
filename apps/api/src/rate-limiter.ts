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
 *
 * On top of the per-basket bucket, every prescription request also
 * consumes from a loose route-wide per-IP ceiling (review nit N1):
 * basket ids are sequential (`rx-N`), so a flood of forged ids would
 * otherwise mint a fresh per-basket bucket each time and escape every
 * cap. The ceiling is deliberately generous — the whole bot layer
 * arrives from one host — its job is only to bound forged traffic,
 * never to throttle legitimate bot bursts.
 */

const DEFAULT_CAPACITY = 60;
const DEFAULT_REFILL_PER_SECOND = 1; // 60 requests/minute sustained
const DEFAULT_PRESCRIPTION_IP_CAPACITY = 600;
const DEFAULT_PRESCRIPTION_IP_REFILL_PER_SECOND = 10; // 600 requests/minute sustained per IP on the basket route

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();
const prescriptionBuckets = new Map<string, Bucket>();
const prescriptionIpBuckets = new Map<string, Bucket>();

function capacity() {
  const configured = Number(process.env.RATE_LIMIT_CAPACITY ?? "");
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_CAPACITY;
}

function refillPerSecond() {
  const configured = Number(process.env.RATE_LIMIT_REFILL_PER_SECOND ?? "");
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REFILL_PER_SECOND;
}

function prescriptionIpCapacity() {
  const configured = Number(process.env.RATE_LIMIT_PRESCRIPTION_IP_CAPACITY ?? "");
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_PRESCRIPTION_IP_CAPACITY;
}

function prescriptionIpRefillPerSecond() {
  const configured = Number(process.env.RATE_LIMIT_PRESCRIPTION_IP_REFILL_PER_SECOND ?? "");
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_PRESCRIPTION_IP_REFILL_PER_SECOND;
}

function clientIp(request) {
  const forwarded = request.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress ?? "unknown";
}

function consume(
  bucketMap: Map<string, Bucket>,
  key: string,
  cap: number = capacity(),
  refill: number = refillPerSecond()
): boolean {
  const nowMs = Date.now();

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
  // N1: the route-wide per-IP ceiling is consumed first, so a flood of
  // forged basket ids is bounded by the caller's IP no matter how many
  // fresh per-basket buckets it mints. When the ceiling trips, the
  // per-basket bucket is left untouched.
  if (
    consume(
      prescriptionIpBuckets,
      `rx-ip:${clientIp(request)}`,
      prescriptionIpCapacity(),
      prescriptionIpRefillPerSecond()
    )
  ) {
    return true;
  }

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
  prescriptionIpBuckets.clear();
}

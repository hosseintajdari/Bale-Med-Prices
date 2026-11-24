// Prescription basket sessions for the «قیمت نسخه» module.
// Same pattern as selection-session-store.ts (Map + TTL + sweep + cap),
// kept as a separate store so basket state never mixes with the
// single-medicine selection sessions.
const DEFAULT_BASKET_TTL_MS = 30 * 60 * 1000;
const MAX_BASKETS = 2000;
const SWEEP_INTERVAL_MS = 60 * 1000;

const baskets = new Map();
let nextBasketNumber = 1;

function now() {
  return Date.now();
}

function sweepExpiredBaskets() {
  const current = now();
  let removed = 0;

  for (const [id, basket] of baskets) {
    if (basket.expiresAt <= current) {
      baskets.delete(id);
      removed += 1;
    }
  }

  return removed;
}

function evictOldestBaskets() {
  while (baskets.size >= MAX_BASKETS) {
    const oldestId = baskets.keys().next().value;

    if (oldestId === undefined) {
      break;
    }

    baskets.delete(oldestId);
  }
}

const sweepTimer = setInterval(sweepExpiredBaskets, SWEEP_INTERVAL_MS);

if (typeof sweepTimer.unref === "function") {
  sweepTimer.unref();
}

export const prescriptionSessionStore = {
  create({ items = [], kind = "prescription", insurancePercent = null } = {}, ttlMs = DEFAULT_BASKET_TTL_MS) {
    sweepExpiredBaskets();
    evictOldestBaskets();

    const id = `rx-${nextBasketNumber++}`;
    baskets.set(id, {
      id,
      createdAt: now(),
      expiresAt: now() + ttlMs,
      items: [...items],
      selectionSessionId: null,
      kind: kind === "free" ? "free" : "prescription",
      insurancePercent:
        typeof insurancePercent === "number" &&
        Number.isFinite(insurancePercent) &&
        insurancePercent > 0 &&
        insurancePercent <= 100
          ? insurancePercent
          : null
    });

    return id;
  },

  get(id) {
    const basket = baskets.get(id);

    if (!basket) {
      return null;
    }

    if (basket.expiresAt <= now()) {
      baskets.delete(id);
      return null;
    }

    return basket;
  },

  close(id) {
    baskets.delete(id);
  },

  resetForTest() {
    baskets.clear();
    nextBasketNumber = 1;
  }
};

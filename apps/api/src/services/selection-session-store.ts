const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 2000;
const SWEEP_INTERVAL_MS = 60 * 1000;

const sessions = new Map();
let nextSessionNumber = 1;

function now() {
  return Date.now();
}

function defaultTtlMs() {
  const configured = Number(process.env.SELECTION_SESSION_TTL_MS ?? "");

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_SESSION_TTL_MS;
  }

  return configured;
}

/**
 * Fixes #22 (part): expired sessions were deleted only lazily inside get(),
 * so abandoned multi-step flows accumulated forever. A periodic sweep
 * removes them; create() also sweeps and evicts the oldest sessions if the
 * store ever hits its cap.
 */
export function sweepExpiredSessions() {
  const current = now();
  let removed = 0;

  for (const [id, session] of sessions) {
    if (session.expiresAt <= current) {
      sessions.delete(id);
      removed += 1;
    }
  }

  return removed;
}

function evictOldestSessions() {
  while (sessions.size >= MAX_SESSIONS) {
    const oldestId = sessions.keys().next().value;

    if (oldestId === undefined) {
      break;
    }

    sessions.delete(oldestId);
  }
}

const sweepTimer = setInterval(sweepExpiredSessions, SWEEP_INTERVAL_MS);

// Never keep the process alive just for the sweep timer (tests, CLIs).
if (typeof sweepTimer.unref === "function") {
  sweepTimer.unref();
}

export const selectionSessionStore = {
  create(data, ttlMs = defaultTtlMs()) {
    sweepExpiredSessions();
    evictOldestSessions();

    const id = `sel-${nextSessionNumber++}`;
    sessions.set(id, {
      id,
      createdAt: now(),
      expiresAt: now() + ttlMs,
      data
    });

    return id;
  },

  get(id) {
    const session = sessions.get(id);

    if (!session) {
      return null;
    }

    if (session.expiresAt <= now()) {
      sessions.delete(id);
      return null;
    }

    return session;
  },

  close(id) {
    sessions.delete(id);
  },

  resetForTest() {
    sessions.clear();
    nextSessionNumber = 1;
  }
};

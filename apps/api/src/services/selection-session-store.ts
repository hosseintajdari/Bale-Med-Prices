const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;

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

export const selectionSessionStore = {
  create(data, ttlMs = defaultTtlMs()) {
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

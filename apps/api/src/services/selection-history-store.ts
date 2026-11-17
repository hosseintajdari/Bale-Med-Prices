import { normalizeSearchText } from "../search/search-normalization.ts";

// Fixes #22 (part): the counts Map grew with every distinct query+good pair.
// Cap it — when full, the oldest entry is evicted (Maps keep insertion order).
const MAX_HISTORY_KEYS = 5000;

const counts = new Map();

function keyFor(query, goodId) {
  return `${normalizeSearchText(query)}::${goodId}`;
}

export const selectionHistoryStore = {
  recordSuccessfulSelection(query, goodId) {
    const key = keyFor(query, goodId);

    if (!counts.has(key) && counts.size >= MAX_HISTORY_KEYS) {
      const oldestKey = counts.keys().next().value;

      if (oldestKey !== undefined) {
        counts.delete(oldestKey);
      }
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
  },

  getSelectionCount(query, goodId) {
    return counts.get(keyFor(query, goodId)) ?? 0;
  },

  resetForTest() {
    counts.clear();
  }
};

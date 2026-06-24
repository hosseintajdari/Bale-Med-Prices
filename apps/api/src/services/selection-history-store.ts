const counts = new Map();

function keyFor(query, goodId) {
  return `${query.trim().toLowerCase()}::${goodId}`;
}

export const selectionHistoryStore = {
  recordSuccessfulSelection(query, goodId) {
    const key = keyFor(query, goodId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  },

  getSelectionCount(query, goodId) {
    return counts.get(keyFor(query, goodId)) ?? 0;
  },

  resetForTest() {
    counts.clear();
  }
};

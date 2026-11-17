import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFuzzyNote,
  fetchPriceSearch,
  fetchPriceSearchResult
} from "./bale-bot-lib.ts";

// F2: fuzzy answers must reach the patient LABELED — the API flags them,
// the bot renders the «نتیجه‌ی نزدیک» note (SUGGESTIONS-2 #4).

function stubFetch(payload: unknown) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("fetchPriceSearchResult surfaces the API fuzzy flag; fetchPriceSearch keeps its old shape", async () => {
  const restore = stubFetch({
    items: [{ persianTitle: "لوزارتان ۵۰", consumerUnitPrice: 96000 }],
    total: 1,
    fuzzy: { matchedTerm: "لوزارتان", ambiguous: false, corrections: [] }
  });
  try {
    const result = await fetchPriceSearchResult("http://api.test", "لوزاتران");
    assert.equal(result.items.length, 1);
    assert.equal(result.fuzzy?.matchedTerm, "لوزارتان");
    assert.equal(result.fuzzy?.ambiguous, false);

    const items = await fetchPriceSearch("http://api.test", "لوزاتران");
    assert.equal(items.length, 1);
  } finally {
    restore();
  }
});

test("fetchPriceSearchResult: exact answers carry fuzzy=null", async () => {
  const restore = stubFetch({ items: [{ persianTitle: "x", consumerUnitPrice: 1 }], total: 1, fuzzy: null });
  try {
    const result = await fetchPriceSearchResult("http://api.test", "لوزارتان");
    assert.equal(result.fuzzy, null);
  } finally {
    restore();
  }
});

test("buildFuzzyNote: unambiguous correction names the drug and invites a recheck", () => {
  const note = buildFuzzyNote({ matchedTerm: "ستیریزین", ambiguous: false });
  assert.match(note, /نتیجه‌ی نزدیک/);
  assert.match(note, /ستیریزین/);
});

test("buildFuzzyNote: ambiguous matches warn instead of naming one drug", () => {
  const note = buildFuzzyNote({ matchedTerm: null, ambiguous: true });
  assert.match(note, /نتیجه‌ی نزدیک/);
  assert.match(note, /چند داروی مشابه/);
  assert.ok(!note.includes("منظورتان «"));
});

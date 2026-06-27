import test from "node:test";
import assert from "node:assert/strict";
import { selectionSessionStore } from "./selection-session-store.ts";

const realDateNow = Date.now;
const originalTtlEnv = process.env.SELECTION_SESSION_TTL_MS;

test.afterEach(() => {
  Date.now = realDateNow;

  if (originalTtlEnv == null) {
    delete process.env.SELECTION_SESSION_TTL_MS;
  } else {
    process.env.SELECTION_SESSION_TTL_MS = originalTtlEnv;
  }

  selectionSessionStore.resetForTest();
});

test("selectionSessionStore uses configurable default TTL from environment", () => {
  let fakeNow = 1_700_000_000_000;
  Date.now = () => fakeNow;
  process.env.SELECTION_SESSION_TTL_MS = "10";

  const sessionId = selectionSessionStore.create({ query: "acetaminophen" });

  fakeNow += 9;
  assert.ok(selectionSessionStore.get(sessionId));

  fakeNow += 2;
  assert.equal(selectionSessionStore.get(sessionId), null);
});

test("selectionSessionStore falls back to the 15-minute default when TTL env is invalid", () => {
  let fakeNow = 1_700_000_000_000;
  Date.now = () => fakeNow;
  process.env.SELECTION_SESSION_TTL_MS = "not-a-number";

  const sessionId = selectionSessionStore.create({ query: "acetaminophen" });

  fakeNow += 15 * 60 * 1000 - 1;
  assert.ok(selectionSessionStore.get(sessionId));

  fakeNow += 2;
  assert.equal(selectionSessionStore.get(sessionId), null);
});

test("selectionSessionStore falls back to the 15-minute default when TTL env is non-positive", () => {
  let fakeNow = 1_700_000_000_000;
  Date.now = () => fakeNow;
  process.env.SELECTION_SESSION_TTL_MS = "0";

  const sessionId = selectionSessionStore.create({ query: "acetaminophen" });

  fakeNow += 15 * 60 * 1000 - 1;
  assert.ok(selectionSessionStore.get(sessionId));

  fakeNow += 2;
  assert.equal(selectionSessionStore.get(sessionId), null);
});

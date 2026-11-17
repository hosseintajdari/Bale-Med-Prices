import test from "node:test";
import assert from "node:assert/strict";
import { withDeadline, DeadlineExceededError } from "./deadline.ts";

test("withDeadline resolves fast promises untouched", async () => {
  assert.equal(await withDeadline(Promise.resolve(42), 1000), 42);
});

test("withDeadline rejects slow promises with DeadlineExceededError", async () => {
  const slow = new Promise((resolve) => setTimeout(() => resolve("late"), 200));
  await assert.rejects(withDeadline(slow, 20), DeadlineExceededError);
});

test("withDeadline propagates the original error", async () => {
  const boom = new Error("boom");
  await assert.rejects(withDeadline(Promise.reject(boom), 1000), /boom/);
});

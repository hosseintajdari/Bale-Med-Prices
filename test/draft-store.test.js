import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOrderDraftStore } from "../src/draft-store.js";

async function testStore() {
  const directory = await mkdtemp(join(tmpdir(), "panelph-"));
  return createOrderDraftStore(join(directory, "draft.json"));
}

test("stores a free-text need and preserves it after reopening", async () => {
  const store = await testStore();
  const added = await store.addNeed({ name: "نام آزاد", quantity: 2, unit: "بسته" });
  assert.equal(added.status, "needs_completion");
  assert.equal(added.items[0].freeTextName, "نام آزاد");
  assert.equal(added.summary.ambiguityCount, 1);
});

test("resolves a need only when the user supplies a concrete reference", async () => {
  const store = await testStore();
  const draft = await store.addNeed({ name: "نمونه", quantity: 1 });
  const resolved = await store.resolveNeed({ id: draft.items[0].id, reference: { title: "نمونه آموزشی قرص", genericCode: "00001" } });
  assert.equal(resolved.status, "ready_for_review");
  assert.equal(resolved.items[0].resolvedReference.genericCode, "00001");
});

test("revert records a new event instead of erasing history", async () => {
  const store = await testStore();
  const added = await store.addNeed({ name: "قلم", quantity: 3 });
  const event = added.events.find((entry) => entry.type === "need_added");
  const reverted = await store.revertEvent({ eventId: event.id });
  assert.equal(reverted.items.length, 0);
  assert.equal(reverted.events[0].type, "event_reverted");
});

test("out-of-order field revert: reverts targeted update without clobbering other edits", async () => {
  const store = await testStore();
  const added = await store.addNeed({ name: "داروی تست", quantity: 1, note: "" });
  const itemId = added.items[0].id;

  const updatedQty = await store.updateNeed({ id: itemId, quantity: 4 });
  const qtyEvent = updatedQty.events[0];

  const updatedNote = await store.updateNeed({ id: itemId, note: "فوری" });
  const noteEvent = updatedNote.events[0];

  // Revert quantity update out of order (while note update remains active)
  const revertedQty = await store.revertEvent({ eventId: qtyEvent.id });
  assert.equal(revertedQty.items[0].quantity, 1, "Quantity must revert to initial value 1");
  assert.equal(revertedQty.items[0].note, "فوری", "Note update must not be clobbered");
  assert.equal(revertedQty.events.length, 4);
  assert.equal(revertedQty.events[0].type, "event_reverted");
  assert.equal(revertedQty.events[0].targetEventId, qtyEvent.id);
});

test("revert of revert (un-revert): reverting an event_reverted event restores original item state", async () => {
  const store = await testStore();
  const added = await store.addNeed({ name: "داروی آزمایشی", quantity: 2 });
  const itemId = added.items[0].id;

  const resolved = await store.resolveNeed({
    id: itemId,
    reference: { title: "داروی مرجع", genericCode: "00112" },
  });
  assert.equal(resolved.status, "ready_for_review");
  const resolveEvent = resolved.events[0];

  // First revert: revert resolution
  const revertedRes = await store.revertEvent({ eventId: resolveEvent.id });
  assert.equal(revertedRes.status, "needs_completion");
  assert.equal(revertedRes.items[0].resolvedReference, null);
  const firstRevertEvent = revertedRes.events[0];

  // Second revert: revert the revert event (un-revert)
  const unReverted = await store.revertEvent({ eventId: firstRevertEvent.id });
  assert.equal(unReverted.status, "ready_for_review");
  assert.equal(unReverted.items[0].status, "ready_for_review");
  assert.equal(unReverted.items[0].resolvedReference.genericCode, "00112");
  assert.equal(unReverted.events.length, 4);
  assert.equal(unReverted.events[0].type, "event_reverted");
  assert.equal(unReverted.events[0].targetEventId, firstRevertEvent.id);
});

test("targetEventId presence: compensating event records targetEventId", async () => {
  const store = await testStore();
  const added = await store.addNeed({ name: "قلم جدید", quantity: 5 });
  const addEvent = added.events[0];

  const reverted = await store.revertEvent({ eventId: addEvent.id });
  const revertEvent = reverted.events[0];

  assert.equal(revertEvent.type, "event_reverted");
  assert.equal(revertEvent.targetEventId, addEvent.id);
  assert.equal(revertEvent.itemId, addEvent.itemId);
});

test("rejection of duplicate reverts: attempting to revert an already-reverted event throws error", async () => {
  const store = await testStore();
  const added = await store.addNeed({ name: "قلم تستی", quantity: 2 });
  const addEvent = added.events[0];

  await store.revertEvent({ eventId: addEvent.id });

  await assert.rejects(
    async () => {
      await store.revertEvent({ eventId: addEvent.id });
    },
    (err) => {
      assert.match(err.message, /این رخداد قبلاً بازگردانده شده است/);
      return true;
    }
  );
});


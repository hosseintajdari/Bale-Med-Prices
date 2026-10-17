import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOrderDraftStore } from "../src/draft-store.js";

async function createTempDir() {
  return mkdtemp(join(tmpdir(), "panelph-concurrency-"));
}

test("DraftStore — Concurrency & Resilient Persistence Suite", async (t) => {
  let tempDir;

  t.beforeEach(async () => {
    tempDir = await createTempDir();
  });

  t.afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  await t.test("1. High-concurrency parallel addNeed (50 concurrent calls)", async () => {
    const statePath = join(tempDir, "draft.json");
    const store = createOrderDraftStore(statePath);
    const count = 50;

    const promises = Array.from({ length: count }, (_, i) =>
      store.addNeed({
        name: `قلم آزمایشی ${i + 1}`,
        quantity: i + 1,
        unit: "بسته",
        note: `یادداشت تستی ${i + 1}`,
      })
    );

    const results = await Promise.all(promises);

    // 1. All promises resolved
    assert.equal(results.length, count);

    // 2. Final in-memory state has exactly 50 items and 50 events
    const draft = await store.getDraft();
    assert.equal(draft.items.length, count, "Draft items count must be exactly 50");
    assert.equal(draft.events.length, count, "Draft events count must be exactly 50");
    assert.equal(draft.status, "needs_completion");

    // 3. Unique IDs verification (zero ID collisions)
    const itemIds = new Set(draft.items.map((item) => item.id));
    assert.equal(itemIds.size, count, "All 50 item IDs must be strictly unique");

    const eventIds = new Set(draft.events.map((event) => event.id));
    assert.equal(eventIds.size, count, "All 50 event IDs must be strictly unique");

    // 4. All names present (zero lost updates)
    for (let i = 1; i <= count; i++) {
      const found = draft.items.some((item) => item.freeTextName === `قلم آزمایشی ${i}`);
      assert.ok(found, `Item 'قلم آزمایشی ${i}' must exist in draft`);
    }

    // 5. Disk verification: file exists and has identical state
    const diskContent = await readFile(statePath, "utf8");
    const diskDraft = JSON.parse(diskContent);
    assert.equal(diskDraft.items.length, count, "Disk items count must match memory");
    assert.equal(diskDraft.events.length, count, "Disk events count must match memory");
    assert.equal(diskDraft.status, "needs_completion");

    // 6. Temp file cleanup verification: no leftover .tmp files
    const dirEntries = await readdir(tempDir);
    const tmpFiles = dirEntries.filter((f) => f.includes(".tmp"));
    assert.equal(tmpFiles.length, 0, "No temporary files should linger in directory");
  });

  await t.test("2. Mixed concurrent operations (adds, updates, resolves) maintain zero lost updates", async () => {
    const statePath = join(tempDir, "draft.json");
    const store = createOrderDraftStore(statePath);

    // Step 1: Pre-populate 10 items sequentially
    for (let i = 1; i <= 10; i++) {
      await store.addNeed({ name: `قلم اولیه ${i}`, quantity: 1, unit: "عدد" });
    }

    const initialDraft = await store.getDraft();
    assert.equal(initialDraft.items.length, 10);
    const initialItemIds = initialDraft.items.map((item) => item.id);

    // Step 2: Concurrently launch:
    // - 10 new additions
    // - 10 updates on initial items
    // - 10 resolutions on initial items
    const addOps = Array.from({ length: 10 }, (_, i) =>
      store.addNeed({ name: `قلم جدید ${i + 1}`, quantity: 5, unit: "بسته" })
    );

    const updateOps = initialItemIds.map((id, i) =>
      store.updateNeed({ id, quantity: 10 + i, note: `بروزرسانی همزمان ${i}` })
    );

    const resolveOps = initialItemIds.map((id, i) =>
      store.resolveNeed({
        id,
        reference: {
          title: `داروی تایید شده ${i}`,
          genericCode: `0000${i}`,
          brandCode: `0000${i}`,
        },
      })
    );

    await Promise.all([...addOps, ...updateOps, ...resolveOps]);

    const finalDraft = await store.getDraft();

    // 20 items total: 10 initial + 10 newly added
    assert.equal(finalDraft.items.length, 20);

    // 40 events: 10 initial adds + 10 new adds + 10 updates + 10 resolves
    assert.equal(finalDraft.events.length, 40);

    // All initial items have their update applied and resolution recorded
    for (let i = 0; i < 10; i++) {
      const item = finalDraft.items.find((entry) => entry.id === initialItemIds[i]);
      assert.ok(item, `Initial item ${initialItemIds[i]} must exist`);
      assert.equal(item.quantity, 10 + i, "Updated quantity must be preserved");
      assert.equal(item.note, `بروزرسانی همزمان ${i}`, "Updated note must be preserved");
      assert.ok(item.resolvedReference, "Item must be resolved");
      assert.equal(item.status, "ready_for_review");
    }

    // Overall status is needs_completion because items 11..20 are unresolved
    assert.equal(finalDraft.status, "needs_completion");

    // Disk matches memory
    const diskDraft = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(diskDraft.items.length, 20);
    assert.equal(diskDraft.events.length, 40);
  });

  await t.test("3. High-concurrency parallel reverts preserve audit trail and exact count", async () => {
    const statePath = join(tempDir, "draft.json");
    const store = createOrderDraftStore(statePath);

    // Add 20 items
    for (let i = 1; i <= 20; i++) {
      await store.addNeed({ name: `قلم حذف‌شونده ${i}`, quantity: 1 });
    }

    const draftWith20 = await store.getDraft();
    assert.equal(draftWith20.items.length, 20);
    const addEventIds = draftWith20.events
      .filter((e) => e.type === "need_added")
      .map((e) => e.id);

    assert.equal(addEventIds.length, 20);

    // Revert all 20 add events simultaneously
    const revertOps = addEventIds.map((eventId) =>
      store.revertEvent({ eventId })
    );

    await Promise.all(revertOps);

    const revertedDraft = await store.getDraft();
    // All items should be reverted (0 items)
    assert.equal(revertedDraft.items.length, 0);

    // Event audit trail is strictly append-only: 20 adds + 20 reverts = 40 events
    assert.equal(revertedDraft.events.length, 40);
    assert.equal(revertedDraft.status, "open");

    // Verify disk consistency
    const diskDraft = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(diskDraft.items.length, 0);
    assert.equal(diskDraft.events.length, 40);
  });

  await t.test("4. Persistence round-trip across simulated process restart", async () => {
    const statePath = join(tempDir, "draft.json");

    // Process Instance 1
    const store1 = createOrderDraftStore(statePath);
    await store1.addNeed({ name: `کپسول آموکسی سیلین`, quantity: 3, unit: "ورق" });
    const draft1 = await store1.addNeed({ name: `شربت دیفن هیدرامین`, quantity: 1, unit: "شیشه" });
    await store1.resolveNeed({
      id: draft1.items[0].id,
      reference: { title: "Amoxicillin 500mg", genericCode: "00123" },
    });
    const snapshot1 = await store1.getDraft();

    // Process termination simulation (discard store1 reference)
    // Process Instance 2 starts up on existing file
    const store2 = createOrderDraftStore(statePath);
    const snapshot2 = await store2.getDraft();

    assert.deepEqual(snapshot2.items, snapshot1.items, "Items must be identical after process restart");
    assert.deepEqual(snapshot2.events, snapshot1.events, "Events must be identical after process restart");
    assert.equal(snapshot2.status, snapshot1.status);
    assert.equal(snapshot2.id, snapshot1.id);

    // Verify operations continue seamlessly on restored instance
    await store2.addNeed({ name: `استامینوفن ۳۲۵`, quantity: 2 });
    const updatedSnapshot2 = await store2.getDraft();
    assert.equal(updatedSnapshot2.items.length, 3);
    assert.equal(updatedSnapshot2.events.length, 4);
  });

  await t.test("5. Resilient cold start: auto-creates nested non-existent directory", async () => {
    const deeplyNestedPath = join(tempDir, "storage", "nested", "v1", "draft.json");
    const store = createOrderDraftStore(deeplyNestedPath);

    const initial = await store.getDraft();
    assert.equal(initial.status, "open");
    assert.equal(initial.items.length, 0);

    await store.addNeed({ name: "آسپرین", quantity: 1 });

    const fileStat = await stat(deeplyNestedPath);
    assert.ok(fileStat.isFile(), "Nested state file must be created");
  });

  await t.test("6. Resilient recovery from unreadable/empty (0-byte) file", async () => {
    const statePath = join(tempDir, "draft.json");
    // Simulate truncated file left by aborted write
    await writeFile(statePath, "", "utf8");

    const store = createOrderDraftStore(statePath);
    const draft = await store.getDraft();

    assert.equal(draft.status, "open");
    assert.equal(draft.items.length, 0);

    // Verify subsequent write operates normally
    await store.addNeed({ name: "داروی بازیابی‌شده", quantity: 2 });
    const draftAfter = await store.getDraft();
    assert.equal(draftAfter.items.length, 1);
  });

  await t.test("7. Resilient recovery from corrupted/malformed JSON with quarantine", async () => {
    const statePath = join(tempDir, "draft.json");
    // Simulate damaged JSON file
    await writeFile(statePath, '{"id": "corrupted-state", "items": [ unparseable garbage', "utf8");

    const store = createOrderDraftStore(statePath);
    const draft = await store.getDraft();

    // Store recovers gracefully rather than crashing
    assert.equal(draft.status, "open");
    assert.equal(draft.items.length, 0);

    // Verify quarantine file was created
    const dirEntries = await readdir(tempDir);
    const quarantineFiles = dirEntries.filter((f) => f.includes(".corrupt."));
    assert.ok(quarantineFiles.length > 0, "Corrupted file must be quarantined for disaster audit");
  });

  await t.test("8. Interleaved concurrent reads (getDraft) during concurrent writes", async () => {
    const statePath = join(tempDir, "draft.json");
    const store = createOrderDraftStore(statePath);

    const writeOps = Array.from({ length: 30 }, (_, i) =>
      store.addNeed({ name: `قلم همزمان ${i + 1}`, quantity: 1 })
    );

    const readOps = Array.from({ length: 30 }, () => store.getDraft());

    const [writeResults, readResults] = await Promise.all([
      Promise.all(writeOps),
      Promise.all(readOps),
    ]);

    assert.equal(writeResults.length, 30);
    assert.equal(readResults.length, 30);

    // Every read returned a valid, coherent draft snapshot (no corrupted reads)
    for (const readDraft of readResults) {
      assert.ok(Array.isArray(readDraft.items));
      assert.ok(Array.isArray(readDraft.events));
      assert.ok(["open", "needs_completion", "ready_for_review"].includes(readDraft.status));
    }

    const finalDraft = await store.getDraft();
    assert.equal(finalDraft.items.length, 30);
  });

  await t.test("9. Atomic write temporary file isolation and cleanup", async () => {
    const statePath = join(tempDir, "draft.json");
    const store = createOrderDraftStore(statePath);

    for (let i = 0; i < 20; i++) {
      await store.addNeed({ name: `قلم ${i}`, quantity: 1 });
    }

    const entries = await readdir(tempDir);
    const tmpFiles = entries.filter((name) => name.endsWith(".tmp"));
    assert.equal(tmpFiles.length, 0, "All atomic temporary files must be cleaned up");
    assert.ok(entries.includes("draft.json"), "Destination file must exist");
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOrderDraftStore, projectItems, getActiveRevertTargetIds } from "../../src/draft-store.js";
import {
  createQanoonAdapter,
  QanoonConflictError,
  QanoonValidationError,
  QanoonNotFoundError,
} from "../../src/adapters/qanoon-adapter.js";
import { setupTestEnvironment, projectRoot } from "./test-helper.js";

async function createTempDir() {
  return mkdtemp(join(tmpdir(), "panelph-tier5-adv-"));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("Tier 5: Adversarial Backend & Concurrency Stress Verification", async (t) => {
  let tempDir;

  t.beforeEach(async () => {
    tempDir = await createTempDir();
  });

  t.afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // =========================================================================
  // SUITE 1: High-Concurrency Race Condition Attacks & Mutex Saturation
  // =========================================================================

  await t.test(
    "1.1 High-Concurrency Race: 50 mixed parallel operations (adds, updates, resolves, reverts) maintain exact consistency",
    async () => {
      const statePath = join(tempDir, "draft-50-mixed.json");
      const store = createOrderDraftStore(statePath);

      // Pre-seed 10 items sequentially
      for (let i = 1; i <= 10; i++) {
        await store.addNeed({
          name: `داروی پایه ${i}`,
          quantity: i,
          unit: "بسته",
          note: `ثبت اولیه ${i}`,
        });
      }

      const initialDraft = await store.getDraft();
      assert.equal(initialDraft.items.length, 10);
      assert.equal(initialDraft.events.length, 10);
      const initialItemIds = initialDraft.items.map((it) => it.id);
      const initialEventIds = initialDraft.events.map((ev) => ev.id);

      // Concurrently launch 50 mixed operations:
      // - 15 adds of new items
      // - 15 updates on existing items
      // - 10 resolves on existing items
      // - 10 reverts (5 targeting early add events, 5 targeting initial event IDs)
      const ops = [];

      // 15 adds
      for (let i = 1; i <= 15; i++) {
        ops.push(
          store.addNeed({
            name: `قلم همزمان ${i}`,
            quantity: i * 2,
            unit: "ورق",
            note: `یادداشت موازی ${i}`,
          })
        );
      }

      // 15 updates
      for (let i = 0; i < 15; i++) {
        const targetId = initialItemIds[i % initialItemIds.length];
        ops.push(
          store.updateNeed({
            id: targetId,
            quantity: 50 + i,
            note: `بروزرسانی تهاجمی ${i}`,
          })
        );
      }

      // 10 resolves
      for (let i = 0; i < 10; i++) {
        const targetId = initialItemIds[i];
        ops.push(
          store.resolveNeed({
            id: targetId,
            reference: {
              title: `داروی قطعی ${i + 1}`,
              genericCode: String(i + 1).padStart(5, "0"),
              brandCode: String(i + 1).padStart(5, "0"),
              dosageForm: "کپسول",
              strength: "۵۰۰ میلی‌گرم",
            },
          })
        );
      }

      // 10 reverts: targeting the initial 10 add events
      for (let i = 0; i < 10; i++) {
        ops.push(store.revertEvent({ eventId: initialEventIds[i] }));
      }

      // Execute all 50 operations in parallel
      const results = await Promise.all(ops);
      assert.equal(results.length, 50, "All 50 operations must complete");

      // Verify in-memory state
      const finalDraft = await store.getDraft();

      // Total events recorded: 10 initial + 50 = 60 events
      assert.equal(
        finalDraft.events.length,
        60,
        "Exactly 60 events must be recorded in append-only history"
      );

      // Verify zero event ID collisions
      const eventIdSet = new Set(finalDraft.events.map((e) => e.id));
      assert.equal(eventIdSet.size, 60, "All 60 event IDs must be strictly unique");

      // Verify zero item ID collisions among active items
      const itemIdSet = new Set(finalDraft.items.map((it) => it.id));
      assert.equal(itemIdSet.size, finalDraft.items.length, "All active item IDs must be strictly unique");

      // Verify items projected from events match draft.items exactly
      const projected = projectItems(finalDraft.events);
      assert.deepEqual(
        finalDraft.items,
        projected,
        "Draft items must deterministically match event sourcing projection"
      );

      // Verify status derivation consistency
      const expectedStatus =
        finalDraft.items.length === 0
          ? "open"
          : finalDraft.items.every((it) => it.status === "ready_for_review")
          ? "ready_for_review"
          : "needs_completion";
      assert.equal(finalDraft.status, expectedStatus, "Draft status must strictly match item states");

      // Verify disk persistence integrity
      const diskContent = await readFile(statePath, "utf8");
      const diskDraft = JSON.parse(diskContent);
      assert.equal(diskDraft.events.length, 60, "Disk draft events count must match memory");
      assert.equal(diskDraft.items.length, finalDraft.items.length, "Disk draft items count must match memory");
      assert.equal(diskDraft.status, finalDraft.status, "Disk draft status must match memory");

      // Verify no temporary files leaked
      const dirEntries = await readdir(tempDir);
      const tmpFiles = dirEntries.filter((f) => f.includes(".tmp"));
      assert.equal(tmpFiles.length, 0, "Zero .tmp files must remain after 50 concurrent writes");
    }
  );

  await t.test(
    "1.2 Mutex Pipeline Resilience: 25 failing and 25 valid operations interleave cleanly without wedging",
    async () => {
      const statePath = join(tempDir, "draft-interleaved-errors.json");
      const store = createOrderDraftStore(statePath);

      // Pre-seed 5 valid items
      for (let i = 1; i <= 5; i++) {
        await store.addNeed({ name: `قلم معتبر اولیه ${i}`, quantity: i });
      }

      const initialDraft = await store.getDraft();
      assert.equal(initialDraft.items.length, 5);

      // Form 50 interleaved operations: 25 valid, 25 invalid
      const operations = [];

      for (let i = 1; i <= 25; i++) {
        // Valid operation: add need
        operations.push(
          store.addNeed({
            name: `قلم معتبر موازی ${i}`,
            quantity: i,
            unit: "بسته",
          })
        );

        // Invalid operation: intentionally triggers domain validation failure
        if (i % 5 === 1) {
          // Empty name
          operations.push(store.addNeed({ name: "", quantity: 1 }));
        } else if (i % 5 === 2) {
          // Negative quantity
          operations.push(store.addNeed({ name: "داروی منفی", quantity: -10 }));
        } else if (i % 5 === 3) {
          // Non-existent item update
          operations.push(store.updateNeed({ id: `non-existent-${i}`, quantity: 5 }));
        } else if (i % 5 === 4) {
          // Non-existent event revert
          operations.push(store.revertEvent({ eventId: `invalid-ev-${i}` }));
        } else {
          // Resolve without title
          operations.push(
            store.resolveNeed({
              id: initialDraft.items[0].id,
              reference: { title: "   ", genericCode: "00001" },
            })
          );
        }
      }

      // Execute all 50 in parallel using Promise.allSettled
      const settled = await Promise.allSettled(operations);
      assert.equal(settled.length, 50);

      const fulfilled = settled.filter((s) => s.status === "fulfilled");
      const rejected = settled.filter((s) => s.status === "rejected");

      assert.equal(fulfilled.length, 25, "Exactly 25 valid operations must fulfill");
      assert.equal(rejected.length, 25, "Exactly 25 invalid operations must reject");

      // Verify that all rejections are clean domain errors
      for (const rej of rejected) {
        assert.ok(rej.reason instanceof Error, "Rejection reason must be an Error instance");
        assert.ok(
          rej.reason.message.length > 0,
          "Domain error message must be descriptive"
        );
      }

      // Verify the draft still functions perfectly and contains all 5 initial + 25 valid adds = 30 items
      const finalDraft = await store.getDraft();
      assert.equal(finalDraft.items.length, 30, "Draft items must contain exactly 30 items");
      assert.equal(finalDraft.events.length, 30, "Draft events must contain exactly 30 events");

      // Verify subsequent operation succeeds (proving mutex did not deadlock)
      const postCheck = await store.addNeed({ name: "قلم نهایی پس از بحران", quantity: 1 });
      assert.equal(postCheck.items.length, 31);
    }
  );

  await t.test(
    "1.3 Burst Concurrency Saturation: 100 simultaneous reads (getDraft) and writes (addNeed) yield coherent snapshots",
    async () => {
      const statePath = join(tempDir, "draft-burst-saturation.json");
      const store = createOrderDraftStore(statePath);

      const writePromises = Array.from({ length: 50 }, (_, i) =>
        store.addNeed({ name: `قلم اشباع ${i + 1}`, quantity: i + 1 })
      );

      const readPromises = Array.from({ length: 50 }, () => store.getDraft());

      // Launch all 100 simultaneously
      const [writeResults, readResults] = await Promise.all([
        Promise.all(writePromises),
        Promise.all(readPromises),
      ]);

      assert.equal(writeResults.length, 50);
      assert.equal(readResults.length, 50);

      // Verify snapshot invariants on every single read result
      for (const snapshot of readResults) {
        assert.ok(Array.isArray(snapshot.items), "Items must be an array");
        assert.ok(Array.isArray(snapshot.events), "Events must be an array");
        assert.equal(
          snapshot.summary.itemCount,
          snapshot.items.length,
          "summary.itemCount must strictly equal items.length"
        );
        const expectedAmbiguities = snapshot.items.filter(
          (it) => it.status === "needs_completion"
        ).length;
        assert.equal(
          snapshot.summary.ambiguityCount,
          expectedAmbiguities,
          "summary.ambiguityCount must strictly equal needs_completion count"
        );
        assert.ok(
          ["open", "needs_completion", "ready_for_review"].includes(snapshot.status),
          `Status '${snapshot.status}' must be valid`
        );
      }

      // Final draft must have exactly 50 items
      const finalDraft = await store.getDraft();
      assert.equal(finalDraft.items.length, 50);
    }
  );

  // =========================================================================
  // SUITE 2: Deep Compensating Revert Chains & Temporal Replay Integrity
  // =========================================================================

  await t.test(
    "2.1 Deep Alternating Revert Chain: quadruple revert ladder unwinds and rewinds accurately",
    async () => {
      const statePath = join(tempDir, "draft-revert-ladder.json");
      const store = createOrderDraftStore(statePath);

      // Step 1: Add need (E1)
      const d1 = await store.addNeed({ name: "آسپرین ۸۱", quantity: 1, unit: "بسته" });
      const e1Id = d1.events[0].id;
      const itemId = d1.items[0].id;
      assert.equal(d1.items[0].quantity, 1);
      assert.equal(d1.events.length, 1);

      // Step 2: Update need quantity to 10 (E2)
      const d2 = await store.updateNeed({ id: itemId, quantity: 10 });
      const e2Id = d2.events[0].id;
      assert.equal(d2.items[0].quantity, 10);
      assert.equal(d2.events.length, 2);

      // Step 3: Revert E2 (R1 targeting E2) -> quantity rewinds back to 1
      const d3 = await store.revertEvent({ eventId: e2Id });
      const r1Id = d3.events[0].id;
      assert.equal(d3.items[0].quantity, 1, "After R1, quantity must revert to 1");
      assert.equal(d3.events.length, 3);
      assert.equal(d3.events[0].type, "event_reverted");
      assert.equal(d3.events[0].targetEventId, e2Id);

      // Step 4: Revert R1 (R2 targeting R1) -> cancels R1, E2 is active again -> quantity is 10!
      const d4 = await store.revertEvent({ eventId: r1Id });
      const r2Id = d4.events[0].id;
      assert.equal(d4.items[0].quantity, 10, "After R2 (reverting R1), quantity must be 10 again");
      assert.equal(d4.events.length, 4);

      // Step 5: Revert R2 (R3 targeting R2) -> cancels R2, R1 is active again -> quantity rolls back to 1!
      const d5 = await store.revertEvent({ eventId: r2Id });
      const r3Id = d5.events[0].id;
      assert.equal(d5.items[0].quantity, 1, "After R3 (reverting R2), quantity must roll back to 1");
      assert.equal(d5.events.length, 5);

      // Step 6: Revert R3 (R4 targeting R3) -> cancels R3, R2 active again -> quantity is 10!
      const d6 = await store.revertEvent({ eventId: r3Id });
      assert.equal(d6.items[0].quantity, 10, "After R4 (reverting R3), quantity must be 10 again");
      assert.equal(d6.events.length, 6);

      // Verify that full audit trail has 6 events: E1, E2, R1, R2, R3, R4
      const eventTypes = d6.events.map((e) => e.type);
      assert.deepEqual(eventTypes, [
        "event_reverted",
        "event_reverted",
        "event_reverted",
        "event_reverted",
        "need_updated",
        "need_added",
      ]);

      // Verify active target IDs calculation directly
      const activeTargets = getActiveRevertTargetIds(d6.events);
      // R4 cancels R3, R2 cancels R1 -> activeTargets = { r3Id, r1Id }
      assert.ok(activeTargets.has(r3Id), "r3Id must be in activeTargets");
      assert.ok(activeTargets.has(r1Id), "r1Id must be in activeTargets");
      assert.ok(!activeTargets.has(e2Id), "e2Id must NOT be cancelled (E2 is active)");

      // Disk verification
      const diskDraft = JSON.parse(await readFile(statePath, "utf8"));
      assert.equal(diskDraft.items[0].quantity, 10);
      assert.equal(diskDraft.events.length, 6);
    }
  );

  await t.test(
    "2.2 Interleaved Multi-Item Reverts: status transitions and dynamic re-promotion",
    async () => {
      const statePath = join(tempDir, "draft-multi-revert.json");
      const store = createOrderDraftStore(statePath);

      // Add Item A, Item B, Item C
      const d1 = await store.addNeed({ name: "داروی الف", quantity: 1 });
      const d2 = await store.addNeed({ name: "داروی ب", quantity: 2 });
      const d3 = await store.addNeed({ name: "داروی ج", quantity: 3 });

      const itemA = d3.items.find((it) => it.freeTextName === "داروی الف");
      const itemB = d3.items.find((it) => it.freeTextName === "داروی ب");
      const itemC = d3.items.find((it) => it.freeTextName === "داروی ج");

      assert.equal(d3.status, "needs_completion");
      assert.equal(d3.summary.ambiguityCount, 3);

      // Resolve Item A
      const dA = await store.resolveNeed({
        id: itemA.id,
        reference: { title: "داروی الف مرجع", genericCode: "00001" },
      });
      assert.equal(dA.summary.ambiguityCount, 2);

      // Resolve Item B
      const dB = await store.resolveNeed({
        id: itemB.id,
        reference: { title: "داروی ب مرجع", genericCode: "00002" },
      });
      const resolveBEventId = dB.events[0].id;
      assert.equal(dB.summary.ambiguityCount, 1);

      // Resolve Item C -> draft becomes ready_for_review!
      const dC = await store.resolveNeed({
        id: itemC.id,
        reference: { title: "داروی ج مرجع", genericCode: "00003" },
      });
      assert.equal(dC.status, "ready_for_review");
      assert.equal(dC.summary.ambiguityCount, 0);

      // Revert resolution of Item B -> status immediately downgrades to needs_completion!
      const revB = await store.revertEvent({ eventId: resolveBEventId });
      const revertBEventId = revB.events[0].id;
      assert.equal(revB.status, "needs_completion");
      assert.equal(revB.summary.ambiguityCount, 1);
      const postB = revB.items.find((it) => it.id === itemB.id);
      assert.equal(postB.status, "needs_completion");
      assert.equal(postB.resolvedReference, null);

      // Revert initial addition of Item C -> Item C disappears entirely!
      const addCEvent = revB.events.find((e) => e.type === "need_added" && e.itemId === itemC.id);
      const revC = await store.revertEvent({ eventId: addCEvent.id });
      assert.equal(revC.items.length, 2, "Only items A and B must remain");
      assert.ok(!revC.items.some((it) => it.id === itemC.id), "Item C must not be in items");
      // Status is still needs_completion because Item B is unresolved
      assert.equal(revC.status, "needs_completion");

      // Revert the revert of Item B's resolution -> Item B becomes resolved again!
      const reResolveB = await store.revertEvent({ eventId: revertBEventId });
      // Now draft only has Item A (resolved) and Item B (resolved)
      assert.equal(reResolveB.items.length, 2);
      assert.equal(reResolveB.summary.ambiguityCount, 0);
      assert.equal(reResolveB.status, "ready_for_review", "Status must promote back to ready_for_review");
    }
  );

  await t.test(
    "2.3 Adversarial Revert Guardrails: double-revert and invalid event IDs are strictly rejected",
    async () => {
      const statePath = join(tempDir, "draft-illegal-reverts.json");
      const store = createOrderDraftStore(statePath);

      const d1 = await store.addNeed({ name: "تست بازگردانی", quantity: 1 });
      const addEventId = d1.events[0].id;

      // First revert succeeds
      await store.revertEvent({ eventId: addEventId });

      // Second revert on the same event must fail with explicit Persian message
      await assert.rejects(
        async () => store.revertEvent({ eventId: addEventId }),
        (err) => {
          assert.equal(err.message, "این رخداد قبلاً بازگردانده شده است.");
          return true;
        }
      );

      // Revert non-existent event ID must fail
      await assert.rejects(
        async () => store.revertEvent({ eventId: "ghost-event-999" }),
        (err) => {
          assert.equal(err.message, "رخداد موردنظر پیدا نشد.");
          return true;
        }
      );

      // Revert with empty / whitespace ID must fail
      await assert.rejects(
        async () => store.revertEvent({ eventId: "   " }),
        (err) => {
          assert.equal(err.message, "شناسه رخداد الزامی است.");
          return true;
        }
      );

      // Direct string call with empty string must fail
      await assert.rejects(
        async () => store.revertEvent(""),
        (err) => {
          assert.equal(err.message, "شناسه رخداد الزامی است.");
          return true;
        }
      );
    }
  );

  // =========================================================================
  // SUITE 3: Qanoon Adapter 24-Hour Cache Expiry & Idempotency Collisions
  // =========================================================================

  await t.test(
    "3.1 Cache Boundary: sub-second simulated TTL expiration purges stale idempotency entry and accepts fresh submission",
    async () => {
      // Create adapter with ultra-short 40ms TTL
      const adapter = createQanoonAdapter({ mockMode: true, idempotencyTtlMs: 40 });
      const uniqueId = "TTL-EXPIRY-ADV-001";
      const items = [{ goodId: "g-1001", quantity: 2, price: 185000 }];

      // First submission
      const sub1 = await adapter.createBatchOrder({
        draftId: "draft-ttl",
        uniqueId,
        items,
      });
      assert.equal(sub1.status, "SUBMITTED");
      assert.equal(sub1.isIdempotentReplay, false);
      const firstBatchId = sub1.batchId;

      // Immediate replay: must be CACHED
      const sub2 = await adapter.createBatchOrder({
        draftId: "draft-ttl",
        uniqueId,
        items,
      });
      assert.equal(sub2.status, "CACHED");
      assert.equal(sub2.isIdempotentReplay, true);
      assert.equal(sub2.batchId, firstBatchId);

      // Sleep past the 40ms TTL (60ms)
      await delay(60);

      // Re-submission after expiry: must be treated as new fresh SUBMISSION
      const sub3 = await adapter.createBatchOrder({
        draftId: "draft-ttl",
        uniqueId,
        items,
      });
      assert.equal(sub3.status, "SUBMITTED");
      assert.equal(sub3.isIdempotentReplay, false);
      assert.notEqual(sub3.batchId, firstBatchId, "New batchId must be generated after TTL expiry");
    }
  );

  await t.test(
    "3.2 Deterministic Payload Hashing: reversed item order yields identical hash and returns CACHED response",
    async () => {
      const adapter = createQanoonAdapter({ mockMode: true });
      const uniqueId = "HASH-ORDER-INVARIANT-001";

      const itemA = { goodId: "g-1001", genericCode: "00001", quantity: 2, price: 50000 };
      const itemB = { goodId: "g-1002", genericCode: "08234", quantity: 1, price: 120000 };

      // Submit with order [itemA, itemB]
      const res1 = await adapter.createBatchOrder({
        uniqueId,
        items: [itemA, itemB],
      });
      assert.equal(res1.status, "SUBMITTED");

      // Replay with order [itemB, itemA] (reversed)
      const res2 = await adapter.createBatchOrder({
        uniqueId,
        items: [itemB, itemA],
      });
      assert.equal(
        res2.status,
        "CACHED",
        "Deterministic sorting must recognize reversed items array as identical payload"
      );
      assert.equal(res2.isIdempotentReplay, true);
      assert.equal(res2.batchId, res1.batchId);
    }
  );

  await t.test(
    "3.3 Strict Collision Detection Across Tampered Payload Dimensions",
    async () => {
      const adapter = createQanoonAdapter({ mockMode: true });
      const baseUniqueId = "TAMPER-DIM-001";
      const basePayload = {
        draftId: "draft-alpha",
        uniqueId: baseUniqueId,
        warehouseId: "main",
        items: [{ goodId: "g-1001", genericCode: "00001", quantity: 5, price: 10000 }],
      };

      // Initial submission
      await adapter.createBatchOrder(basePayload);

      // Attack Vector 1: Tampered quantity
      await assert.rejects(
        async () =>
          adapter.createBatchOrder({
            ...basePayload,
            items: [{ goodId: "g-1001", genericCode: "00001", quantity: 6, price: 10000 }],
          }),
        (err) => {
          assert.ok(err instanceof QanoonConflictError);
          assert.match(err.message, /UNIQUE_ID_PAYLOAD_MISMATCH/);
          return true;
        }
      );

      // Attack Vector 2: Tampered price
      await assert.rejects(
        async () =>
          adapter.createBatchOrder({
            ...basePayload,
            items: [{ goodId: "g-1001", genericCode: "00001", quantity: 5, price: 9999 }],
          }),
        (err) => {
          assert.ok(err instanceof QanoonConflictError);
          assert.match(err.message, /UNIQUE_ID_PAYLOAD_MISMATCH/);
          return true;
        }
      );

      // Attack Vector 3: Tampered warehouseId
      await assert.rejects(
        async () =>
          adapter.createBatchOrder({
            ...basePayload,
            warehouseId: "secondary",
          }),
        (err) => {
          assert.ok(err instanceof QanoonConflictError);
          assert.match(err.message, /UNIQUE_ID_PAYLOAD_MISMATCH/);
          return true;
        }
      );

      // Attack Vector 4: Tampered draftId
      await assert.rejects(
        async () =>
          adapter.createBatchOrder({
            ...basePayload,
            draftId: "draft-beta",
          }),
        (err) => {
          assert.ok(err instanceof QanoonConflictError);
          assert.match(err.message, /UNIQUE_ID_PAYLOAD_MISMATCH/);
          return true;
        }
      );

      // Attack Vector 5: Stripped leading zeros in genericCode ('00001' -> '1')
      await assert.rejects(
        async () =>
          adapter.createBatchOrder({
            ...basePayload,
            items: [{ goodId: "g-1001", genericCode: "1", quantity: 5, price: 10000 }],
          }),
        (err) => {
          assert.ok(err instanceof QanoonConflictError);
          assert.match(err.message, /UNIQUE_ID_PAYLOAD_MISMATCH/);
          return true;
        }
      );
    }
  );

  await t.test(
    "3.4 In-Flight Concurrency Lock: concurrent requests on identical uniqueId trigger CONCURRENT_REQUEST_IN_FLIGHT",
    async () => {
      const adapter = createQanoonAdapter({ mockMode: true });
      const uniqueId = "IN-FLIGHT-LOCK-001";

      // Manually acquire lock to simulate an in-flight background request
      adapter.inFlightLocks.add(uniqueId);

      // Concurrently attempted submission must immediately fail with conflict
      await assert.rejects(
        async () =>
          adapter.createBatchOrder({
            uniqueId,
            items: [{ goodId: "g-1001", quantity: 1, price: 10000 }],
          }),
        (err) => {
          assert.ok(err instanceof QanoonConflictError);
          assert.match(err.message, /CONCURRENT_REQUEST_IN_FLIGHT/);
          assert.equal(err.details?.retryAfter, 2);
          return true;
        }
      );

      // Release lock
      adapter.inFlightLocks.delete(uniqueId);

      // Now submission must succeed cleanly
      const res = await adapter.createBatchOrder({
        uniqueId,
        items: [{ goodId: "g-1001", quantity: 1, price: 10000 }],
      });
      assert.equal(res.status, "SUBMITTED");
    }
  );

  // =========================================================================
  // SUITE 4: Qanoon Adapter Pricing Edge Cases & Divergence Checks
  // =========================================================================

  await t.test(
    "4.1 TTAC Divergence Guard Boundary: exact ±10,000 threshold precision",
    async () => {
      const adapter = createQanoonAdapter({ mockMode: true });
      // Good g-1001: sellPrice = 185,000 Rials
      const goodId = "g-1001";
      const baseUnit = 185000;

      // Case 1: Exact boundary (+10,000) -> 195,000 Rials (divergence = 10,000). NO warning!
      const p1 = await adapter.calculatePrice({
        goodId,
        quantity: 1,
        ttacUnitPrice: baseUnit + 10000,
      });
      assert.ok(
        !p1.warnings.some((w) => w.includes("Price divergence")),
        "Divergence of exactly 10,000 must NOT trigger warning"
      );

      // Case 2: Above boundary (+10,001) -> 195,001 Rials (divergence = 10,001). MUST trigger warning!
      const p2 = await adapter.calculatePrice({
        goodId,
        quantity: 1,
        ttacUnitPrice: baseUnit + 10001,
      });
      assert.ok(
        p2.warnings.some((w) => w.includes("Price divergence")),
        "Divergence of 10,001 must trigger divergence warning"
      );

      // Case 3: Exact boundary (-10,000) -> 175,000 Rials (divergence = 10,000). NO warning!
      const p3 = await adapter.calculatePrice({
        goodId,
        quantity: 1,
        ttacUnitPrice: baseUnit - 10000,
      });
      assert.ok(
        !p3.warnings.some((w) => w.includes("Price divergence")),
        "Negative divergence of exactly 10,000 must NOT trigger warning"
      );

      // Case 4: Below boundary (-10,001) -> 174,999 Rials (divergence = 10,001). MUST trigger warning!
      const p4 = await adapter.calculatePrice({
        goodId,
        quantity: 1,
        ttacUnitPrice: baseUnit - 10001,
      });
      assert.ok(
        p4.warnings.some((w) => w.includes("Price divergence")),
        "Negative divergence of 10,001 must trigger divergence warning"
      );

      // Case 5: Zero TTAC price (divergence = 185,000). MUST trigger warning!
      const p5 = await adapter.calculatePrice({
        goodId,
        quantity: 1,
        ttacUnitPrice: 0,
      });
      assert.ok(
        p5.warnings.some((w) => w.includes("Price divergence")),
        "Zero TTAC price must trigger divergence warning"
      );

      // Case 6: Exact match (divergence = 0). NO warning!
      const p6 = await adapter.calculatePrice({
        goodId,
        quantity: 1,
        ttacUnitPrice: baseUnit,
      });
      assert.ok(
        !p6.warnings.some((w) => w.includes("Price divergence")),
        "Exact price match must not trigger divergence warning"
      );
    }
  );

  await t.test(
    "4.2 Pricing Invariants on Extreme Volumes: wholesale 10,000,000 units and decimal 2.5 quantities",
    async () => {
      const adapter = createQanoonAdapter({ mockMode: true });

      // Scenario A: Wholesale 10,000,000 units
      const wholesaleQty = 10_000_000;
      const resWholesale = await adapter.calculatePrice({
        goodId: "g-1001",
        quantity: wholesaleQty,
      });

      assert.ok(Number.isFinite(resWholesale.basePrice), "basePrice must be finite");
      assert.ok(Number.isFinite(resWholesale.finalPrice), "finalPrice must be finite");
      assert.equal(
        resWholesale.vatAmount + resWholesale.tollAmount,
        resWholesale.totalTax,
        "VAT and toll must strictly sum to totalTax at wholesale scale"
      );
      assert.equal(
        resWholesale.finalPrice,
        resWholesale.basePrice + resWholesale.vatAmount + resWholesale.tollAmount + resWholesale.technicalFee,
        "finalPrice must strictly equal basePrice + vatAmount + tollAmount + technicalFee"
      );

      // Scenario B: Fractional decimal quantity 2.5
      const resDecimal = await adapter.calculatePrice({
        goodId: "g-1001",
        quantity: 2.5,
      });
      assert.equal(
        resDecimal.vatAmount + resDecimal.tollAmount,
        resDecimal.totalTax,
        "VAT and toll must strictly sum to totalTax for decimal quantities"
      );
    }
  );

  await t.test(
    "4.3 Pricing Edge Cases: zero base price, nonPharma fee exemption, and date boundaries",
    async () => {
      // Custom fixtures with zero-price item and nonPharma item
      const customFixtures = {
        goods: [
          {
            id: "zero-item",
            title: "قلم رایگان یا نامشخص",
            sellPrice: 0,
            tempPrice: 0,
            taxCodes: ["TAX_STANDARD"],
            nonPharma: false,
          },
          {
            id: "non-pharma-item",
            title: "لوسیون آرایشی غیر دارویی",
            sellPrice: 100000,
            tempPrice: 100000,
            taxCodes: [],
            nonPharma: true,
          },
        ],
        taxRates: {
          TAX_STANDARD: {
            averageTaxes: [{ date: "2024-01-01", averageTax: 1000 }],
          },
        },
        technicalFees: [
          {
            effectiveDate: "2024-01-01",
            amount: 5000,
            conditions: { excludeNonPharma: true },
          },
        ],
      };

      const adapter = createQanoonAdapter({ fixtures: customFixtures, mockMode: true });

      // Test zero-price item
      const zeroRes = await adapter.calculatePrice({
        goodId: "zero-item",
        quantity: 1,
        documentDate: "2024-06-01",
      });
      assert.equal(zeroRes.unitBasePrice, 0);
      assert.equal(zeroRes.basePrice, 0);
      assert.ok(
        zeroRes.warnings.includes("No valid sellPrice or tempPrice found for item."),
        "Must warn when no sellPrice or tempPrice exists"
      );
      // TTAC divergence must not be checked when unitBasePrice is 0
      assert.ok(
        !zeroRes.warnings.some((w) => w.includes("Price divergence")),
        "TTAC divergence must NOT trigger when unitBasePrice is 0"
      );

      // Test nonPharma item: technicalFee must be 0
      const nonPharmaRes = await adapter.calculatePrice({
        goodId: "non-pharma-item",
        quantity: 1,
        includeTechnicalFee: true,
        documentDate: "2024-06-01",
      });
      assert.equal(
        nonPharmaRes.technicalFee,
        0,
        "nonPharma item must be strictly exempt from technical dispense fees"
      );
      assert.ok(
        nonPharmaRes.warnings.includes("Technical fee was requested but no applicable rule matched.")
      );

      // Test document date before earliest tax rate date
      const ancientDateRes = await adapter.calculatePrice({
        goodId: "zero-item",
        quantity: 1,
        documentDate: "2020-01-01",
      });
      assert.equal(ancientDateRes.totalTax, 0);
      assert.ok(
        ancientDateRes.warnings.includes("No tax rate matched the selected document date.")
      );
    }
  );

  // =========================================================================
  // SUITE 5: Resilient Persistence Under Rapid Concurrent Mutations & Multi-Process Reloads
  // =========================================================================

  await t.test(
    "5.1 Multi-Generation Persistence: 3 sequential store lifecycles maintain 100% data integrity",
    async () => {
      const statePath = join(tempDir, "draft-multi-gen.json");

      // Generation 1: Create store, perform 15 mutations
      const storeGen1 = createOrderDraftStore(statePath);
      for (let i = 1; i <= 10; i++) {
        await storeGen1.addNeed({ name: `قلم نسل یک ${i}`, quantity: i });
      }
      const draft1 = await storeGen1.getDraft();
      for (let i = 0; i < 5; i++) {
        await storeGen1.updateNeed({ id: draft1.items[i].id, note: `بروزرسانی نسل یک ${i}` });
      }
      const snapshot1 = await storeGen1.getDraft();
      assert.equal(snapshot1.items.length, 10);
      assert.equal(snapshot1.events.length, 15);

      // Generation 2: Process restart simulation (new store instance pointing to same file)
      const storeGen2 = createOrderDraftStore(statePath);
      const snapshot2Initial = await storeGen2.getDraft();
      assert.equal(snapshot2Initial.items.length, 10);
      assert.equal(snapshot2Initial.events.length, 15);
      assert.deepEqual(snapshot2Initial.items, snapshot1.items);

      // Perform 10 more mutations in Gen 2
      for (let i = 0; i < 5; i++) {
        await storeGen2.resolveNeed({
          id: snapshot2Initial.items[i].id,
          reference: { title: `مرجع دارویی نسل دو ${i}`, genericCode: `0000${i}` },
        });
      }
      for (let i = 1; i <= 5; i++) {
        await storeGen2.addNeed({ name: `قلم نسل دو ${i}`, quantity: 2 });
      }
      const snapshot2Final = await storeGen2.getDraft();
      assert.equal(snapshot2Final.items.length, 15);
      assert.equal(snapshot2Final.events.length, 25);

      // Generation 3: Another process restart simulation
      const storeGen3 = createOrderDraftStore(statePath);
      const snapshot3 = await storeGen3.getDraft();
      assert.equal(snapshot3.items.length, 15);
      assert.equal(snapshot3.events.length, 25);
      assert.deepEqual(snapshot3.items, snapshot2Final.items);
      assert.deepEqual(snapshot3.events, snapshot2Final.events);

      // Add one more need in Gen 3
      await storeGen3.addNeed({ name: `قلم نهایی نسل سه`, quantity: 1 });
      const snapshot3Final = await storeGen3.getDraft();
      assert.equal(snapshot3Final.items.length, 16);
      assert.equal(snapshot3Final.events.length, 26);
    }
  );

  await t.test(
    "5.2 Atomic Write Resilience: zero lingering temp files and graceful recovery from corruption",
    async () => {
      const statePath = join(tempDir, "draft-atomic-resilience.json");
      const store = createOrderDraftStore(statePath);

      // 30 rapid writes
      for (let i = 0; i < 30; i++) {
        await store.addNeed({ name: `قلم پایداری ${i}`, quantity: 1 });
      }

      // Check directory for leaked temp files
      const entries = await readdir(tempDir);
      const tmpFiles = entries.filter((name) => name.includes(".tmp"));
      assert.equal(tmpFiles.length, 0, "No temporary files must linger");

      // Corrupt state file intentionally with malformed JSON
      await writeFile(statePath, '{"broken": [ "malformed json byte stream', "utf8");

      // Reload store: must recover cleanly, quarantine corrupted file, and return empty draft
      const recoveredStore = createOrderDraftStore(statePath);
      const draft = await recoveredStore.getDraft();
      assert.equal(draft.status, "open");
      assert.equal(draft.items.length, 0);

      // Verify quarantine file exists
      const entriesAfter = await readdir(tempDir);
      const quarantine = entriesAfter.filter((f) => f.includes(".corrupt."));
      assert.ok(quarantine.length > 0, "Quarantined corrupt file must exist for forensics");
    }
  );

  // =========================================================================
  // SUITE 6: Dual-Protocol E2E Stress (REST & MCP JSON-RPC Concurrency)
  // =========================================================================

  await t.test(
    "6.1 Dual-Protocol E2E Stress: concurrent REST API calls and MCP JSON-RPC calls maintain serialized consistency",
    async () => {
      const env = await setupTestEnvironment();
      try {
        // Concurrently dispatch 10 REST calls and 10 MCP tool calls
        const restOps = Array.from({ length: 10 }, (_, i) =>
          env.restClient.post("/api/draft/needs", {
            name: `قلم رست ${i + 1}`,
            quantity: i + 1,
            unit: "بسته",
          })
        );

        const mcpOps = Array.from({ length: 10 }, (_, i) =>
          env.mcpClient.callTool("add_order_need", {
            name: `قلم ام‌سی‌پی ${i + 1}`,
            quantity: i + 1,
            unit: "عدد",
          })
        );

        const [restResults, mcpResults] = await Promise.all([
          Promise.all(restOps),
          Promise.all(mcpOps),
        ]);

        assert.equal(restResults.length, 10);
        assert.equal(mcpResults.length, 10);

        for (const res of restResults) {
          assert.equal(res.status, 201);
        }
        for (const res of mcpResults) {
          assert.equal(res.status, 200);
        }

        // Fetch final draft via both protocols and disk
        const getRest = await env.restClient.get("/api/draft");
        assert.equal(getRest.status, 200);
        assert.equal(getRest.body.draft.items.length, 20);
        assert.equal(getRest.body.draft.events.length, 20);

        const getMcp = await env.mcpClient.callTool("get_order_draft", {});
        assert.equal(getMcp.status, 200);
        assert.equal(getMcp.body.result.structuredContent.draft.items.length, 20);

        const diskContent = await readFile(env.statePath, "utf8");
        const diskDraft = JSON.parse(diskContent);
        assert.equal(diskDraft.items.length, 20);
        assert.equal(diskDraft.events.length, 20);
      } finally {
        await env.cleanup();
      }
    }
  );
});

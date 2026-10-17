import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOrderDraftStore } from "../../../src/draft-store.js";
import { searchCatalog, resolveItem, normalizeCodeString } from "../../../src/catalog-resolver.js";
import { createQanoonAdapter } from "../../../src/adapters/qanoon-adapter.js";

async function main() {
  console.log("Starting Independent Victory Auditor Adversarial Verification...");

  const tempDir = await mkdtemp(join(tmpdir(), "panelph-victory-audit-"));
  const statePath = join(tempDir, "audit-draft.json");

  try {
    // 1. String Preservation for Zero-Padded Codes
    console.log("Check 1: Leading-zero string preservation...");
    const zeroCodes = ["00001", "08234", "00115", "04210", "00999"];
    for (const code of zeroCodes) {
      assert.strictEqual(normalizeCodeString(code), code);
      assert.strictEqual(typeof normalizeCodeString(code), "string");
      const hits = searchCatalog(code);
      assert.ok(hits.length > 0, `Expected search hits for ${code}`);
      assert.strictEqual(hits[0].genericCode, code);
      assert.strictEqual(typeof hits[0].genericCode, "string");
    }

    // Check Persian / Arabic digits preserve leading zeroes
    assert.strictEqual(normalizeCodeString("۰۰۰۰۱"), "00001");
    assert.strictEqual(normalizeCodeString("۰۸۲۳۴"), "08234");
    const persianHits = searchCatalog("۰۰۰۰۱");
    assert.strictEqual(persianHits[0].genericCode, "00001");

    // 2. Draft Store Append-Only Event Sourcing & Compensating Reverts
    console.log("Check 2: Event Sourcing & Compensating Reverts...");
    const store = createOrderDraftStore(statePath);
    const d1 = await store.addNeed({ name: "آسپرین", quantity: 10, unit: "بسته", note: "اورژانسی" });
    assert.strictEqual(d1.items.length, 1);
    assert.strictEqual(d1.events.length, 1);
    assert.strictEqual(d1.events[0].type, "need_added");
    const needId = d1.items[0].id;
    const addEventId = d1.events[0].id;

    // Resolve need
    const d2 = await store.resolveNeed({
      id: needId,
      reference: { title: "Aspirin 500mg", genericCode: "00001", brandCode: "00001" },
    });
    assert.strictEqual(d2.status, "ready_for_review");
    assert.strictEqual(d2.events.length, 2);
    assert.strictEqual(d2.events[0].type, "need_resolved");
    const resolveEventId = d2.events[0].id;

    // Revert resolveEvent: items must revert to needs_completion without deleting history
    const d3 = await store.revertEvent({ eventId: resolveEventId });
    assert.strictEqual(d3.status, "needs_completion");
    assert.strictEqual(d3.items[0].resolvedReference, null);
    assert.strictEqual(d3.events.length, 3);
    assert.strictEqual(d3.events[0].type, "event_reverted");
    assert.strictEqual(d3.events[0].targetEventId, resolveEventId);
    const revertEventId = d3.events[0].id;

    // Un-revert: revert the revert event! Should restore ready_for_review
    const d4 = await store.revertEvent({ eventId: revertEventId });
    assert.strictEqual(d4.status, "ready_for_review");
    assert.strictEqual(d4.items[0].resolvedReference.title, "Aspirin 500mg");
    assert.strictEqual(d4.events.length, 4);

    // Verify history was never mutated
    const diskContent = JSON.parse(await readFile(statePath, "utf8"));
    assert.strictEqual(diskContent.events.length, 4);
    assert.strictEqual(diskContent.events[3].id, addEventId);
    assert.strictEqual(diskContent.events[2].id, resolveEventId);
    assert.strictEqual(diskContent.events[1].id, revertEventId);

    // 3. Mutex Queue & Concurrency Invariant Under 50 Parallel Operations
    console.log("Check 3: Mutex Concurrency Invariant...");
    const concurrentOps = [];
    for (let i = 0; i < 50; i++) {
      concurrentOps.push(store.addNeed({ name: `قلم همزمان ${i}`, quantity: i + 1 }));
    }
    await Promise.all(concurrentOps);
    const concurrentDraft = await store.getDraft();
    assert.strictEqual(concurrentDraft.items.length, 51); // 1 original + 50 added
    assert.strictEqual(concurrentDraft.events.length, 54); // 4 prior + 50 added

    // 4. Corrupted State Quarantine
    console.log("Check 4: Corrupted state quarantine...");
    const corruptStatePath = join(tempDir, "corrupt-test.json");
    await writeFile(corruptStatePath, '{"broken": json unclosed', "utf8");
    const corruptStore = createOrderDraftStore(corruptStatePath);
    const recoveredDraft = await corruptStore.getDraft();
    assert.strictEqual(recoveredDraft.status, "open");
    assert.strictEqual(recoveredDraft.items.length, 0);

    const dirFiles = await readdir(tempDir);
    const quarantined = dirFiles.filter((f) => f.includes("corrupt-test.json.corrupt."));
    assert.ok(quarantined.length > 0, "Corrupted file must be quarantined with timestamp suffix");

    // 5. Qanoon Adapter 24h Idempotency & Pricing Engine
    console.log("Check 5: Qanoon Adapter Idempotency & Pricing...");
    const adapter = createQanoonAdapter({ mockMode: true });
    const pricing = await adapter.calculatePrice({ goodId: "g-1001", quantity: 2 });
    assert.strictEqual(pricing.vatAmount + pricing.tollAmount, pricing.totalTax);
    assert.strictEqual(pricing.tollAmount, pricing.totalTax - pricing.vatAmount);

    const uniqueId = `test-victory-unique-${Date.now()}`;
    const batch1 = await adapter.createBatchOrder({
      uniqueId,
      items: [{ goodId: "g-1001", genericCode: "00001", quantity: 2, price: 185000 }],
    });
    assert.strictEqual(batch1.status, "SUBMITTED");
    assert.strictEqual(batch1.isIdempotentReplay, false);

    const batch2 = await adapter.createBatchOrder({
      uniqueId,
      items: [{ goodId: "g-1001", genericCode: "00001", quantity: 2, price: 185000 }],
    });
    assert.strictEqual(batch2.status, "CACHED");
    assert.strictEqual(batch2.isIdempotentReplay, true);

    // Mismatched payload with same uniqueId must throw QanoonConflictError
    let threwConflict = false;
    try {
      await adapter.createBatchOrder({
        uniqueId,
        items: [{ goodId: "g-1001", genericCode: "00001", quantity: 99, price: 185000 }],
      });
    } catch (err) {
      if (err.code === "CONFLICT") threwConflict = true;
    }
    assert.ok(threwConflict, "Payload mismatch on identical uniqueId must throw CONFLICT");

    console.log("ALL 5 INDEPENDENT ADVERSARIAL CHECKS PASSED PERFECTLY!");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Adversarial verification failed:", err);
  process.exit(1);
});

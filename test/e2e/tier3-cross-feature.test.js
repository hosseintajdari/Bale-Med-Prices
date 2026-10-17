import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  setupTestEnvironment,
  isAdapterAvailable,
  isEndpointAvailable,
  projectRoot,
  SAMPLE_DRUGS,
} from "./test-helper.js";

test("Tier 3: Cross-Feature Combinations", async (t) => {
  let env;

  t.beforeEach(async () => {
    env = await setupTestEnvironment();
  });

  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  await t.test("T3_01: Full operational lifecycle interlock (entry -> resolve -> revert)", async (t) => {
    // 1. Free-text need entry
    const addRes = await env.mcpClient.callTool("add_order_need", {
      name: "استامینوفن ۵۰۰",
      quantity: 3,
      unit: "بسته",
      note: "ثبت آزاد در میز سفارش",
    });
    assert.equal(addRes.status, 200);
    const draft1 = addRes.body.result.structuredContent.draft;
    assert.equal(draft1.status, "needs_completion");
    assert.equal(draft1.summary.ambiguityCount, 1);
    const needId = draft1.items[0].id;

    // 2. Ambiguity resolution via catalog reference
    const resolveRes = await env.mcpClient.callTool("resolve_order_need", {
      id: needId,
      reference: SAMPLE_DRUGS[0],
    });
    assert.equal(resolveRes.status, 200);
    const draft2 = resolveRes.body.result.structuredContent.draft;
    assert.equal(draft2.status, "ready_for_review");
    assert.equal(draft2.summary.ambiguityCount, 0);
    assert.equal(draft2.items[0].resolvedReference.genericCode, "00001");

    // 3. Optional: Stage 1 advisory stock check & batch check (if adapter exists)
    const hasAdapter = await isAdapterAvailable();
    if (hasAdapter) {
      const { createQanoonAdapter } = await import(join(projectRoot, "src", "adapters", "qanoon-adapter.js"));
      const adapter = createQanoonAdapter({ mockMode: true });
      const stock = await adapter.checkStock({
        genericCode: "00001",
        brandCode: "00001",
        requestedCount: 3,
      });
      assert.ok("inStock" in stock);
    }

    // 4. Pharmacist reverts the resolution event
    const resolveEvent = draft2.events.find((e) => e.type === "need_resolved");
    assert.ok(resolveEvent, "need_resolved event must exist in draft history");

    const revertRes = await env.mcpClient.callTool("revert_order_event", {
      eventId: resolveEvent.id,
    });
    assert.equal(revertRes.status, 200);
    const draft3 = revertRes.body.result.structuredContent.draft;

    // Verify draft status returned to needs_completion and reference cleared
    assert.equal(draft3.status, "needs_completion");
    assert.equal(draft3.summary.ambiguityCount, 1);
    assert.equal(draft3.items[0].status, "needs_completion");
    assert.equal(draft3.items[0].resolvedReference, null);
    assert.equal(draft3.events[0].type, "event_reverted");
  });

  await t.test("T3_02: Multi-item draft with progressive ambiguity resolution", async () => {
    // Add 3 separate items
    const names = ["آموکسی‌سیلین ۵۰۰", "سرم نمکی", "سرنگ ۵ سی‌سی"];
    for (const name of names) {
      await env.mcpClient.callTool("add_order_need", { name, quantity: 2 });
    }

    const initialDraftRes = await env.mcpClient.callTool("get_order_draft", {});
    const initialDraft = initialDraftRes.body.result.structuredContent.draft;
    assert.equal(initialDraft.items.length, 3);
    assert.equal(initialDraft.summary.ambiguityCount, 3);
    assert.equal(initialDraft.status, "needs_completion");

    // Resolve Item 1
    const res1 = await env.mcpClient.callTool("resolve_order_need", {
      id: initialDraft.items[0].id,
      reference: SAMPLE_DRUGS[0],
    });
    const draftAfter1 = res1.body.result.structuredContent.draft;
    assert.equal(draftAfter1.summary.ambiguityCount, 2);
    assert.equal(draftAfter1.status, "needs_completion", "Draft must remain needs_completion while ambiguities exist");

    // Resolve Item 2
    const res2 = await env.mcpClient.callTool("resolve_order_need", {
      id: initialDraft.items[1].id,
      reference: SAMPLE_DRUGS[1],
    });
    const draftAfter2 = res2.body.result.structuredContent.draft;
    assert.equal(draftAfter2.summary.ambiguityCount, 1);
    assert.equal(draftAfter2.status, "needs_completion");

    // Resolve Item 3
    const res3 = await env.mcpClient.callTool("resolve_order_need", {
      id: initialDraft.items[2].id,
      reference: SAMPLE_DRUGS[2],
    });
    const draftAfter3 = res3.body.result.structuredContent.draft;
    assert.equal(draftAfter3.summary.ambiguityCount, 0);
    assert.equal(
      draftAfter3.status,
      "ready_for_review",
      "Draft must transition to ready_for_review only when ALL items are resolved"
    );
  });

  await t.test("T3_03: Ordered chain of compensating reverts preserves full audit trail", async () => {
    // 1. Add need
    const addRes = await env.mcpClient.callTool("add_order_need", {
      name: "کپسول امپرازول ۲۰",
      quantity: 1,
    });
    const itemId = addRes.body.result.structuredContent.draft.items[0].id;

    // 2. Update quantity to 4
    const updateQtyRes = await env.mcpClient.callTool("update_order_need", {
      id: itemId,
      quantity: 4,
    });
    const draftAfterQty = updateQtyRes.body.result.structuredContent.draft;
    const qtyEvent = draftAfterQty.events[0];
    assert.equal(qtyEvent.type, "need_updated");

    // 3. Update note
    const updateNoteRes = await env.mcpClient.callTool("update_order_need", {
      id: itemId,
      note: "قبل از صبحانه مصرف شود",
    });
    const draftAfterNote = updateNoteRes.body.result.structuredContent.draft;
    const noteEvent = draftAfterNote.events[0];
    assert.equal(noteEvent.type, "need_updated");

    // 4. Revert note update
    const revertNoteRes = await env.mcpClient.callTool("revert_order_event", {
      eventId: noteEvent.id,
    });
    const draftRevertedNote = revertNoteRes.body.result.structuredContent.draft;
    assert.equal(draftRevertedNote.items[0].note, "", "Note should be reverted to previous empty state");
    assert.equal(draftRevertedNote.items[0].quantity, 4, "Quantity 4 should remain untouched");

    // 5. Revert quantity update
    const revertQtyRes = await env.mcpClient.callTool("revert_order_event", {
      eventId: qtyEvent.id,
    });
    const draftRevertedQty = revertQtyRes.body.result.structuredContent.draft;
    assert.equal(draftRevertedQty.items[0].quantity, 1, "Quantity should return to original 1");

    // Verify all 5 events + 2 revert events exist in event log (total 7 events)
    assert.equal(draftRevertedQty.events.length, 5);
    assert.equal(draftRevertedQty.events[0].type, "event_reverted");
    assert.equal(draftRevertedQty.events[1].type, "event_reverted");
  });

  await t.test("T3_04: Interleaved resolution and new need addition resets draft status", async () => {
    // Add Item A and resolve it
    const addA = await env.mcpClient.callTool("add_order_need", { name: "قلم اول", quantity: 1 });
    const idA = addA.body.result.structuredContent.draft.items[0].id;
    const resA = await env.mcpClient.callTool("resolve_order_need", { id: idA, reference: SAMPLE_DRUGS[0] });
    assert.equal(resA.body.result.structuredContent.draft.status, "ready_for_review");

    // Add new ambiguous Item B
    const addB = await env.mcpClient.callTool("add_order_need", { name: "قلم دوم", quantity: 2 });
    const draftWithB = addB.body.result.structuredContent.draft;

    // Verify draft status immediately drops back to needs_completion
    assert.equal(
      draftWithB.status,
      "needs_completion",
      "Adding an un-resolved item must immediately downgrade draft from ready_for_review to needs_completion"
    );
    assert.equal(draftWithB.summary.ambiguityCount, 1);
    assert.equal(draftWithB.summary.itemCount, 2);
  });

  await t.test("T3_05: Cross-protocol state coherence between MCP API and persistent disk storage", async () => {
    await env.mcpClient.callTool("add_order_need", {
      name: "شیاف دیکلوفناک ۵۰",
      quantity: 1,
      unit: "بسته",
      note: "دیسک را چک کنید",
    });

    const mcpDraftRes = await env.mcpClient.callTool("get_order_draft", {});
    const mcpDraft = mcpDraftRes.body.result.structuredContent.draft;

    // Read direct file from disk
    const diskContent = await readFile(env.statePath, "utf8");
    const diskDraft = JSON.parse(diskContent);

    assert.equal(diskDraft.id, mcpDraft.id);
    assert.equal(diskDraft.status, mcpDraft.status);
    assert.equal(diskDraft.items.length, mcpDraft.items.length);
    assert.equal(diskDraft.items[0].freeTextName, mcpDraft.items[0].freeTextName);
    assert.equal(diskDraft.events.length, mcpDraft.events.length);
  });
});

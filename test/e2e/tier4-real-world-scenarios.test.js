import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import {
  setupTestEnvironment,
  createMcpClient,
  isAdapterAvailable,
  projectRoot,
  SAMPLE_DRUGS,
} from "./test-helper.js";

test("Tier 4: Real-World Application Scenarios (Pharmacist Shifts)", async (t) => {
  let env;

  t.beforeEach(async () => {
    env = await setupTestEnvironment();
  });

  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  await t.test("T4_01: Rapid prescription entry shift with delayed batch resolution", async () => {
    // Rush hour intake: Pharmacist rapidly logs 5 prescription items
    const prescriptionItems = [
      { name: "قرص کلوپیدوگرل ۷۵", quantity: 2, unit: "جعبه", note: "نسخه دکتر علوی" },
      { name: "کپسول سفالکسین ۵۰۰", quantity: 1, unit: "بسته", note: "هر ۶ ساعت" },
      { name: "شربت استامینوفن کودکان", quantity: 1, unit: "شیشه", note: "در صورت تب" },
      { name: "قطره چشمی بتامتازون", quantity: 2, unit: "قوطی", note: "روزی ۳ بار" },
      { name: "پماد هیدروکورتیزون ۱٪", quantity: 1, unit: "تیوب", note: "موضعی" },
    ];

    for (const item of prescriptionItems) {
      const res = await env.mcpClient.callTool("add_order_need", item);
      assert.equal(res.status, 200);
    }

    // Verify all 5 captured in order, draft remains in needs_completion
    const draftRes = await env.mcpClient.callTool("get_order_draft", {});
    const draft = draftRes.body.result.structuredContent.draft;
    assert.equal(draft.items.length, 5);
    assert.equal(draft.summary.itemCount, 5);
    assert.equal(draft.summary.ambiguityCount, 5);
    assert.equal(draft.status, "needs_completion");

    // Later when rush settles: Pharmacist resolves all items one by one
    for (let i = 0; i < draft.items.length; i++) {
      const item = draft.items[i];
      const resolveRes = await env.mcpClient.callTool("resolve_order_need", {
        id: item.id,
        reference: {
          title: `تأییدیه ${item.freeTextName}`,
          genericCode: `0000${i + 1}`,
          brandCode: `0000${i + 1}`,
          dosageForm: item.unit,
        },
      });
      const currentDraft = resolveRes.body.result.structuredContent.draft;
      const expectedRemainingAmbiguities = 5 - (i + 1);
      assert.equal(currentDraft.summary.ambiguityCount, expectedRemainingAmbiguities);
    }

    // Final state must be ready_for_review with 0 ambiguities
    const finalDraftRes = await env.mcpClient.callTool("get_order_draft", {});
    const finalDraft = finalDraftRes.body.result.structuredContent.draft;
    assert.equal(finalDraft.status, "ready_for_review");
    assert.equal(finalDraft.summary.ambiguityCount, 0);
  });

  await t.test("T4_02: Out-of-stock substitution workflow and audit trail", async (t) => {
    // 1. Pharmacist logs request for a specific branded medicine
    const addRes = await env.mcpClient.callTool("add_order_need", {
      name: "کپسول آموکسی‌سیلین ۵۰۰ برند فارماشیمی",
      quantity: 2,
      unit: "جعبه",
    });
    const needId = addRes.body.result.structuredContent.draft.items[0].id;

    // 2. Resolve to brand code
    await env.mcpClient.callTool("resolve_order_need", {
      id: needId,
      reference: {
        title: "آموکسی‌سیلین ۵۰۰ فارماشیمی",
        genericCode: "00123",
        brandCode: "09999", // simulated out-of-stock brand
      },
    });

    // 3. Check stock via adapter if available
    const hasAdapter = await isAdapterAvailable();
    if (hasAdapter) {
      const { createQanoonAdapter } = await import(join(projectRoot, "src", "adapters", "qanoon-adapter.js"));
      const adapter = createQanoonAdapter({ mockMode: true });
      const stock = await adapter.checkStock({
        genericCode: "00123",
        brandCode: "09999",
        requestedCount: 2,
      });
      // In out-of-stock scenario:
      if (!stock.inStock) {
        // 4. Substitution with generic equivalent
        await env.mcpClient.callTool("update_order_need", {
          id: needId,
          note: "جایگزینی با برند کوثر به دلیل عدم موجودی برند فارماشیمی (با موافقت بیمار)",
        });
        await env.mcpClient.callTool("resolve_order_need", {
          id: needId,
          reference: {
            title: "آموکسی‌سیلین ۵۰۰ کوثر",
            genericCode: "00123",
            brandCode: "01001", // available brand
          },
        });
      }
    } else {
      // Direct workflow simulation
      await env.mcpClient.callTool("update_order_need", {
        id: needId,
        note: "جایگزینی با برند کوثر به دلیل عدم موجودی با موافقت بیمار",
      });
      await env.mcpClient.callTool("resolve_order_need", {
        id: needId,
        reference: {
          title: "آموکسی‌سیلین ۵۰۰ کوثر",
          genericCode: "00123",
          brandCode: "01001",
        },
      });
    }

    const draftRes = await env.mcpClient.callTool("get_order_draft", {});
    const draft = draftRes.body.result.structuredContent.draft;
    assert.equal(draft.status, "ready_for_review");
    assert.match(draft.items[0].note, /جایگزینی/);
    assert.equal(draft.items[0].resolvedReference.brandCode, "01001");
  });

  await t.test("T4_03: Network retry & idempotency protection with stable uniqueId", async (t) => {
    const hasAdapter = await isAdapterAvailable();
    if (!hasAdapter && !process.env.PANELPH_E2E_STRICT) {
      t.skip("Qanoon adapter module not yet present (Milestone 1 dependency)");
      return;
    }

    const { createQanoonAdapter } = await import(join(projectRoot, "src", "adapters", "qanoon-adapter.js"));
    const adapter = createQanoonAdapter({ mockMode: true });

    const shiftUniqueId = `shift-retry-${Date.now()}`;
    const orderPayload = {
      draftId: "current-order-draft",
      uniqueId: shiftUniqueId,
      items: [
        { goodId: "item-1", genericCode: "00001", quantity: 5, price: 50000 },
        { goodId: "item-2", genericCode: "14083", quantity: 2, price: 120000 },
      ],
    };

    // First attempt: succeeds with SUBMITTED
    const attempt1 = await adapter.createBatchOrder(orderPayload);
    assert.equal(attempt1.status, "SUBMITTED");
    assert.equal(attempt1.uniqueId, shiftUniqueId);

    // Second attempt (simulating client retry after network timeout): returns CACHED
    const attempt2 = await adapter.createBatchOrder(orderPayload);
    assert.equal(attempt2.status, "CACHED", "Retry with identical uniqueId must return cached response");
    assert.equal(attempt2.batchId, attempt1.batchId, "Batch ID must match original submission");
  });

  await t.test("T4_04: Shift handoff and interrupted draft resumption", async () => {
    // Morning Shift Pharmacist A creates draft with 3 items, resolves 1
    await env.mcpClient.callTool("add_order_need", { name: "قرص آتورواستاتین ۲۰", quantity: 2, unit: "جعبه" });
    const resB = await env.mcpClient.callTool("add_order_need", { name: "قرص لوزارتان ۲۵", quantity: 1, unit: "جعبه" });
    await env.mcpClient.callTool("add_order_need", { name: "قرص متفورمین ۵۰۰", quantity: 3, unit: "جعبه" });

    const idToResolve = resB.body.result.structuredContent.draft.items[0].id;
    await env.mcpClient.callTool("resolve_order_need", {
      id: idToResolve,
      reference: SAMPLE_DRUGS[0],
    });

    // Morning shift ends, process restarts
    const statePath = env.statePath;
    await env.stopServer();

    // Evening Shift Pharmacist B boots up application
    process.env.PANELPH_STATE_PATH = statePath;
    const { startServer } = await import(`${projectRoot}/src/server.js?test=${Date.now()}_shiftB`);
    const serverB = startServer({ port: 0 });
    await new Promise((resolve) => serverB.once("listening", resolve));
    const portB = serverB.address().port;
    const clientB = createMcpClient(`http://127.0.0.1:${portB}`);

    try {
      const resumedDraftRes = await clientB.callTool("get_order_draft", {});
      const resumedDraft = resumedDraftRes.body.result.structuredContent.draft;

      // Assert exact state resumed
      assert.equal(resumedDraft.items.length, 3);
      assert.equal(resumedDraft.summary.ambiguityCount, 2);
      assert.equal(resumedDraft.status, "needs_completion");

      // Evening pharmacist resolves remaining 2 items
      const unresolvedItems = resumedDraft.items.filter((item) => item.status === "needs_completion");
      for (const item of unresolvedItems) {
        await clientB.callTool("resolve_order_need", {
          id: item.id,
          reference: SAMPLE_DRUGS[1],
        });
      }

      const finalRes = await clientB.callTool("get_order_draft", {});
      const finalDraft = finalRes.body.result.structuredContent.draft;
      assert.equal(finalDraft.status, "ready_for_review");
      assert.equal(finalDraft.summary.ambiguityCount, 0);
    } finally {
      await new Promise((resolve) => serverB.close(resolve));
    }
  });
});

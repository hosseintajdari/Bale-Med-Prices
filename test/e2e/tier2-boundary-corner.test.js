import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import {
  setupTestEnvironment,
  isAdapterAvailable,
  projectRoot,
  SAMPLE_DRUGS,
} from "./test-helper.js";

test("Tier 2: Boundary & Corner Cases", async (t) => {
  let env;

  t.beforeEach(async () => {
    env = await setupTestEnvironment();
  });

  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  await t.test("T2_01: Rejection of empty or whitespace-only need name", async () => {
    const emptyRes = await env.mcpClient.callTool("add_order_need", {
      name: "",
      quantity: 1,
    });
    assert.ok(emptyRes.body?.error || emptyRes.body?.result?.isError, "Empty name must be rejected with error");

    const whitespaceRes = await env.mcpClient.callTool("add_order_need", {
      name: "   \t \n  ",
      quantity: 1,
    });
    assert.ok(whitespaceRes.body?.error || whitespaceRes.body?.result?.isError, "Whitespace name must be rejected");
  });

  await t.test("T2_02: Rejection of zero quantity", async () => {
    const zeroRes = await env.mcpClient.callTool("add_order_need", {
      name: "قرص آسپیرین",
      quantity: 0,
    });
    assert.ok(zeroRes.body?.error || zeroRes.body?.result?.isError, "Zero quantity must be rejected");
  });

  await t.test("T2_03: Rejection of negative quantity", async () => {
    const negRes = await env.mcpClient.callTool("add_order_need", {
      name: "قرص آسپیرین",
      quantity: -5,
    });
    assert.ok(negRes.body?.error || negRes.body?.result?.isError, "Negative quantity must be rejected");
  });

  await t.test("T2_04: Rejection of non-numeric or NaN quantity", async () => {
    const nanRes = await env.mcpClient.callTool("add_order_need", {
      name: "قرص آسپیرین",
      quantity: NaN,
    });
    assert.ok(nanRes.body?.error || nanRes.body?.result?.isError, "NaN quantity must be rejected");
  });

  await t.test("T2_05: String preservation of leading zeros across all codes", async () => {
    const codes = ["00001", "08234", "00000", "00123"];

    for (const code of codes) {
      const addRes = await env.mcpClient.callTool("add_order_need", {
        name: `تست کد ${code}`,
        quantity: 1,
      });
      const itemId = addRes.body.result.structuredContent.draft.items.at(-1).id;

      const resolveRes = await env.mcpClient.callTool("resolve_order_need", {
        id: itemId,
        reference: {
          title: `کالای کد ${code}`,
          genericCode: code,
          brandCode: code,
          dosageForm: "قرص",
          strength: "۱۰ م‌گ",
        },
      });

      const updatedDraft = resolveRes.body.result.structuredContent.draft;
      const resolvedItem = updatedDraft.items.find((item) => item.id === itemId);

      assert.strictEqual(
        typeof resolvedItem.resolvedReference.genericCode,
        "string",
        `genericCode ${code} must remain a string type`
      );
      assert.strictEqual(
        resolvedItem.resolvedReference.genericCode,
        code,
        `genericCode ${code} must retain all leading zeroes without truncation`
      );
      assert.strictEqual(
        resolvedItem.resolvedReference.brandCode,
        code,
        `brandCode ${code} must retain all leading zeroes without truncation`
      );
    }
  });

  await t.test("T2_06: Support for extreme quantities (bulk wholesale & decimal fractions)", async () => {
    // 1. Extreme bulk wholesale quantity (1,000,000 units)
    const bulkRes = await env.mcpClient.callTool("add_order_need", {
      name: "سرنگ انسولین عمده",
      quantity: 1000000,
      unit: "عدد",
    });
    assert.equal(bulkRes.status, 200);
    const bulkItem = bulkRes.body.result.structuredContent.draft.items[0];
    assert.equal(bulkItem.quantity, 1000000);

    // 2. Fractional decimal quantity (e.g., 2.5 bottles)
    const fractionRes = await env.mcpClient.callTool("add_order_need", {
      name: "محلول بتادین",
      quantity: 2.5,
      unit: "لیتر",
    });
    assert.equal(fractionRes.status, 200);
    const fractionItem = fractionRes.body.result.structuredContent.draft.items[1];
    assert.equal(fractionItem.quantity, 2.5);
  });

  await t.test("T2_07: High-fidelity Persian, Arabic characters, half-space, and long text notes", async () => {
    // Half-space \u200c, Arabic Kaf/Yeh, parenthesis, symbols
    const complexName = "قرص آس‌پ‌آ ۸۰ م‌گ (اسپیرین) + ويتامين C & زینک - ۵۰٪";
    const longNote = "یادداشت داروساز: ".repeat(100); // ~1700 characters

    const addRes = await env.mcpClient.callTool("add_order_need", {
      name: complexName,
      quantity: 5,
      unit: "بستهٔ دارویی",
      note: longNote,
    });

    assert.equal(addRes.status, 200);
    const item = addRes.body.result.structuredContent.draft.items[0];
    assert.equal(item.freeTextName, complexName, "Complex Persian text with symbols must be preserved exactly");
    assert.equal(item.note, longNote.trim(), "Long note must be preserved without truncation");
    assert.equal(item.unit, "بستهٔ دارویی");
  });

  await t.test("T2_08: Updating non-existent need ID returns explicit error", async () => {
    const updateRes = await env.mcpClient.callTool("update_order_need", {
      id: "non-existent-need-id-9999",
      quantity: 5,
    });
    assert.ok(
      updateRes.body?.error || updateRes.body?.result?.isError,
      "Updating non-existent need ID must fail with an error"
    );
  });

  await t.test("T2_09: Reverting non-existent event ID returns explicit error", async () => {
    const revertRes = await env.mcpClient.callTool("revert_order_event", {
      eventId: "non-existent-event-id-9999",
    });
    assert.ok(
      revertRes.body?.error || revertRes.body?.result?.isError,
      "Reverting non-existent event ID must fail with an error"
    );
  });

  await t.test("T2_10: Resolving need without title returns explicit validation error", async () => {
    const addRes = await env.mcpClient.callTool("add_order_need", {
      name: "شربت ضد سرفه",
      quantity: 1,
    });
    const needId = addRes.body.result.structuredContent.draft.items[0].id;

    const resolveRes = await env.mcpClient.callTool("resolve_order_need", {
      id: needId,
      reference: {
        title: "   ", // whitespace title
        genericCode: "00001",
      },
    });

    assert.ok(
      resolveRes.body?.error || resolveRes.body?.result?.isError,
      "Resolving without title must be rejected"
    );
  });

  await t.test("T2_11: Out-of-stock item handling and advisory warning", async (t) => {
    const hasAdapter = await isAdapterAvailable();
    if (!hasAdapter && !process.env.PANELPH_E2E_STRICT) {
      t.skip("Qanoon adapter module not yet present (Milestone 1 dependency)");
      return;
    }

    const { createQanoonAdapter } = await import(join(projectRoot, "src", "adapters", "qanoon-adapter.js"));
    const adapter = createQanoonAdapter({ mockMode: true });

    // In mock data or boundary case: requesting count > available or count for out-of-stock item
    const stockRes = await adapter.checkStock({
      genericCode: "99999", // non-existent or 0 stock
      brandCode: "99999",
      requestedCount: 100,
    });

    assert.equal(stockRes.inStock, false, "Item with insufficient inventory must report inStock: false");
    assert.ok(stockRes.availableCount < 100, "availableCount must be less than requestedCount");
  });

  await t.test("T2_12: TTAC price divergence warning threshold (>10,000 Rial)", async (t) => {
    const hasAdapter = await isAdapterAvailable();
    if (!hasAdapter && !process.env.PANELPH_E2E_STRICT) {
      t.skip("Qanoon adapter module not yet present (Milestone 1 dependency)");
      return;
    }

    const { createQanoonAdapter } = await import(join(projectRoot, "src", "adapters", "qanoon-adapter.js"));
    const adapter = createQanoonAdapter({ mockMode: true });

    // Test case A: Divergence > 10,000 Rial -> Warning must be emitted (g-1004 has sellPrice 110,000 and ttacPrice 135,000 -> 25,000 diff)
    const highDivergencePrice = await adapter.calculatePrice({
      goodId: "g-1004",
      quantity: 1,
    });

    assert.ok(
      highDivergencePrice.warnings?.some((w) => w.includes("10,000") || w.includes("TTAC")),
      "Price difference > 10,000 Rial must emit patient-facing TTAC divergence warning"
    );

    // Test case B: Divergence <= 10,000 Rial -> No warning emitted (g-1001 has sellPrice 185,000 and ttacPrice 185,000 -> 0 diff)
    const lowDivergencePrice = await adapter.calculatePrice({
      goodId: "g-1001",
      quantity: 1,
    });

    assert.ok(
      !lowDivergencePrice.warnings?.some((w) => w.includes("10,000")),
      "Price difference <= 10,000 Rial must NOT emit TTAC divergence warning"
    );
  });


  await t.test("T2_13: Unknown tool call returns clean JSON-RPC error", async () => {
    const res = await env.mcpClient.callTool("unknown_nonexistent_tool", {});
    assert.ok(
      res.body?.error || res.body?.result?.isError,
      "Unknown tool call must return a JSON-RPC error or tool error"
    );
  });


  await t.test("T2_14: Malformed JSON payload handling on server", async () => {
    const rawRes = await fetch(`${env.baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "INVALID_JSON_BODY{{{",
    });

    // Server must respond with client error (400 or 500) and must not crash
    assert.ok(rawRes.status >= 400);

    // Probe server immediately after malformed payload to verify it is still healthy
    const healthRes = await env.mcpClient.callTool("get_order_draft", {});
    assert.equal(healthRes.status, 200, "Server must remain healthy after receiving malformed JSON");
  });
});

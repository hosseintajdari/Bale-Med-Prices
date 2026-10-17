import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { startServer } from "../src/server.js";

async function setupServer() {
  const dir = await mkdtemp(join(tmpdir(), "panelph-rest-"));
  const statePath = join(dir, "draft.json");
  const server = startServer({ port: 0, statePath });
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const cleanup = async () => {
    await new Promise((resolve) => server.close(resolve));
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  return { server, baseUrl, cleanup };
}

test("REST API — Operational Endpoints & CORS Preflight", async (t) => {
  let env;

  t.beforeEach(async () => {
    env = await setupServer();
  });

  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  await t.test("OPTIONS preflight returns 204 with CORS headers for /api/*", async () => {
    const res = await fetch(`${env.baseUrl}/api/draft`, { method: "OPTIONS" });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get("access-control-allow-origin"), "*");
    assert.ok(res.headers.get("access-control-allow-methods")?.includes("GET"));
    assert.ok(res.headers.get("access-control-allow-methods")?.includes("POST"));
    assert.ok(res.headers.get("access-control-allow-methods")?.includes("PATCH"));
  });

  await t.test("GET /api/draft returns empty draft initially", async () => {
    const res = await fetch(`${env.baseUrl}/api/draft`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.draft);
    assert.strictEqual(data.draft.status, "open");
    assert.deepStrictEqual(data.draft.items, []);
    assert.strictEqual(data.draft.summary.itemCount, 0);
  });

  await t.test("POST /api/draft/needs adds a free-text need item and returns 201", async () => {
    const res = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "شربت دیفن هیدرامین",
        quantity: 3,
        unit: "شیشه",
        note: "نیاز به تحویل فوری",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.need);
    assert.strictEqual(data.need.freeTextName, "شربت دیفن هیدرامین");
    assert.strictEqual(data.need.quantity, 3);
    assert.strictEqual(data.need.unit, "شیشه");
    assert.strictEqual(data.need.note, "نیاز به تحویل فوری");
    assert.strictEqual(data.need.status, "needs_completion");
    assert.strictEqual(data.draft.status, "needs_completion");
    assert.ok(res.headers.get("location")?.includes(data.need.id));
  });

  await t.test("POST /api/draft/needs validates request payload", async () => {
    // Empty name
    const emptyRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", quantity: 1 }),
    });
    assert.strictEqual(emptyRes.status, 400);
    const emptyData = await emptyRes.json();
    assert.strictEqual(emptyData.error?.code, "VALIDATION_ERROR");

    // Zero quantity
    const zeroRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "آسپرین", quantity: 0 }),
    });
    assert.strictEqual(zeroRes.status, 400);

    // Negative quantity
    const negRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "آسپرین", quantity: -5 }),
    });
    assert.strictEqual(negRes.status, 400);
  });

  await t.test("PATCH /api/draft/needs/:needId updates existing item", async () => {
    const addRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "قرص مسکن", quantity: 1 }),
    });
    const addData = await addRes.json();
    const needId = addData.need.id;

    const patchRes = await fetch(`${env.baseUrl}/api/draft/needs/${needId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "قرص استامینوفن",
        quantity: 4,
        unit: "ورق",
      }),
    });
    assert.strictEqual(patchRes.status, 200);
    const patchData = await patchRes.json();
    const updated = patchData.draft.items.find((i) => i.id === needId);
    assert.strictEqual(updated.freeTextName, "قرص استامینوفن");
    assert.strictEqual(updated.quantity, 4);
    assert.strictEqual(updated.unit, "ورق");

    // Non-existent ID returns 404
    const notFoundRes = await fetch(`${env.baseUrl}/api/draft/needs/non-existent-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "نام دیگر" }),
    });
    assert.strictEqual(notFoundRes.status, 404);
  });

  await t.test("POST /api/draft/needs/:needId/resolve resolves need and strictly preserves string codes", async () => {
    const addRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "آموکسی", quantity: 2 }),
    });
    const { need } = await addRes.json();

    const resolveRes = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: {
          title: "Amoxicillin 500mg Capsule",
          genericCode: "00001",
          brandCode: "00001",
          dosageForm: "کپسول",
          strength: "۵۰۰ میلی‌گرم",
        },
      }),
    });

    assert.strictEqual(resolveRes.status, 200);
    const resolveData = await resolveRes.json();
    const resolved = resolveData.draft.items.find((i) => i.id === need.id);
    assert.strictEqual(resolved.status, "ready_for_review");
    assert.strictEqual(typeof resolved.resolvedReference.genericCode, "string");
    assert.strictEqual(resolved.resolvedReference.genericCode, "00001");
    assert.strictEqual(typeof resolved.resolvedReference.brandCode, "string");
    assert.strictEqual(resolved.resolvedReference.brandCode, "00001");
    assert.strictEqual(resolveData.draft.status, "ready_for_review");
  });

  await t.test("POST /api/draft/revert appends compensating event without truncating history", async () => {
    const addRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "پماد سوختگی", quantity: 1 }),
    });
    const addData = await addRes.json();
    const addedEvent = addData.draft.events.find((e) => e.type === "need_added");
    assert.ok(addedEvent);

    const revertRes = await fetch(`${env.baseUrl}/api/draft/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: addedEvent.id }),
    });

    assert.strictEqual(revertRes.status, 200);
    const revertData = await revertRes.json();
    assert.strictEqual(revertData.draft.items.length, 0);
    assert.strictEqual(revertData.draft.events[0].type, "event_reverted");
    // Ensure history wasn't truncated
    assert.ok(revertData.draft.events.some((e) => e.id === addedEvent.id));

    // Reverting non-existent event returns 404
    const invalidRevert = await fetch(`${env.baseUrl}/api/draft/revert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "non-existent-event" }),
    });
    assert.strictEqual(invalidRevert.status, 404);
  });

  await t.test("GET /api/catalog/search searches catalog and preserves leading zeros", async () => {
    const searchRes = await fetch(`${env.baseUrl}/api/catalog/search?q=00001`);
    assert.strictEqual(searchRes.status, 200);
    const data = await searchRes.json();
    assert.ok(Array.isArray(data.results));
    assert.ok(data.results.length > 0);
    assert.strictEqual(data.results[0].genericCode, "00001");
    assert.strictEqual(typeof data.results[0].genericCode, "string");
  });

  await t.test("POST /api/stock/check returns advisory stock availability", async () => {
    const stockRes = await fetch(`${env.baseUrl}/api/stock/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        genericCode: "00001",
        brandCode: "00001",
        quantity: 2,
      }),
    });

    assert.strictEqual(stockRes.status, 200);
    const data = await stockRes.json();
    assert.ok("inStock" in data);
    assert.ok("availableCount" in data);
    assert.strictEqual(data.inStock, true);
  });

  await t.test("POST /api/orders/export-batch detects discrepancies on unresolved draft", async () => {
    // Add unresolved item
    await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "قلم نامشخص", quantity: 2 }),
    });

    const exportRes = await fetch(`${env.baseUrl}/api/orders/export-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId: "current-order-draft" }),
    });

    assert.strictEqual(exportRes.status, 200);
    const data = await exportRes.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.batch, null);
    assert.ok(data.discrepancies.length > 0);
    assert.strictEqual(data.status, "DISCREPANCIES_DETECTED");
  });

  await t.test("POST /api/orders/export-batch exports successfully when draft is fully resolved", async () => {
    // Add item and resolve it with existing mock good (Amoxicillin: g-1001)
    const addRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "آموکسی سیلین ۵۰۰", quantity: 2 }),
    });
    const { need } = await addRes.json();

    await fetch(`${env.baseUrl}/api/draft/needs/${need.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: {
          goodId: "g-1001",
          title: "Amoxicillin 500mg Capsule",
          genericCode: "00001",
          brandCode: "00001",
          dosageForm: "کپسول",
          strength: "۵۰۰ میلی‌گرم",
        },
      }),
    });

    const uniqueId = `batch-test-${Date.now()}`;
    const exportRes = await fetch(`${env.baseUrl}/api/orders/export-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uniqueId }),
    });

    assert.strictEqual(exportRes.status, 200);
    const data = await exportRes.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.batch);
    assert.strictEqual(data.batch.status, "SUBMITTED");
    assert.ok(data.pricingSummary);
    assert.ok(data.pricingSummary.totalFinalPrice > 0);

    // Idempotent retry with identical uniqueId returns CACHED
    const retryRes = await fetch(`${env.baseUrl}/api/orders/export-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uniqueId }),
    });
    assert.strictEqual(retryRes.status, 200);
    const retryData = await retryRes.json();
    assert.strictEqual(retryData.batch.status, "CACHED");
  });

  await t.test("handles malformed JSON body safely with 400 Bad Request", async () => {
    const res = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "MALFORMED_JSON_STRING{{{",
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error?.code, "INVALID_JSON");
  });

  await t.test("POST /api/draft/needs rejects non-string name types without server crash", async () => {
    for (const badName of [12345, true, { drug: "Amox" }, [1, 2]]) {
      const res = await fetch(`${env.baseUrl}/api/draft/needs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: badName, quantity: 1 }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error?.code, "VALIDATION_ERROR");
    }
  });

  await t.test("PATCH /api/draft/needs/:needId rejects non-string name types without server crash", async () => {
    const addRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "آسپرین", quantity: 1 }),
    });
    const { need } = await addRes.json();

    for (const badName of [9999, false, { sub: "test" }]) {
      const res = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: badName }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error?.code, "VALIDATION_ERROR");
    }
  });

  await t.test("POST /api/draft/needs/:needId/resolve rejects non-string reference title without server crash", async () => {
    const addRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "آسپرین", quantity: 1 }),
    });
    const { need } = await addRes.json();

    for (const badTitle of [12345, true, { sub: "title" }]) {
      const res = await fetch(`${env.baseUrl}/api/draft/needs/${need.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: { title: badTitle } }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error?.code, "VALIDATION_ERROR");
    }
  });

  await t.test("POST /api/draft/revert rejects non-string eventId without server crash", async () => {
    for (const badEventId of [12345, true, {}]) {
      const res = await fetch(`${env.baseUrl}/api/draft/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: badEventId }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.error?.code, "VALIDATION_ERROR");
    }
  });
});

test("MCP Protocol — Expanded Tools on /mcp", async (t) => {
  let env;

  t.beforeEach(async () => {
    env = await setupServer();
  });

  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  async function mcpCall(method, params = {}) {
    const res = await fetch(`${env.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    });
    return { status: res.status, body: await res.json() };
  }

  await t.test("tools/list includes all 9 operational tools", async () => {
    const res = await mcpCall("tools/list");
    assert.strictEqual(res.status, 200);
    const toolNames = res.body?.result?.tools?.map((tool) => tool.name) ?? [];

    // Pre-existing 6 tools
    assert.ok(toolNames.includes("get_order_draft"));
    assert.ok(toolNames.includes("add_order_need"));
    assert.ok(toolNames.includes("update_order_need"));
    assert.ok(toolNames.includes("resolve_order_need"));
    assert.ok(toolNames.includes("revert_order_event"));
    assert.ok(toolNames.includes("render_order_desk"));

    // Expanded 3 tools in M2
    assert.ok(toolNames.includes("search_catalog"));
    assert.ok(toolNames.includes("check_stock"));
    assert.ok(toolNames.includes("export_order_batch"));
  });

  await t.test("search_catalog tool executes via /mcp", async () => {
    const res = await mcpCall("tools/call", {
      name: "search_catalog",
      arguments: { query: "آموکسی" },
    });
    assert.strictEqual(res.status, 200);
    const structured = res.body?.result?.structuredContent;
    assert.ok(structured?.results?.length > 0);
    assert.strictEqual(structured.results[0].genericCode, "00001");
  });

  await t.test("check_stock tool executes via /mcp", async () => {
    const res = await mcpCall("tools/call", {
      name: "check_stock",
      arguments: { goodId: "g-1001", quantity: 2 },
    });
    assert.strictEqual(res.status, 200);
    const structured = res.body?.result?.structuredContent;
    assert.ok(structured?.stock);
    assert.strictEqual(structured.stock.inStock, true);
  });

  await t.test("export_order_batch tool executes via /mcp", async () => {
    const res = await mcpCall("tools/call", {
      name: "export_order_batch",
      arguments: {},
    });
    assert.strictEqual(res.status, 200);
    const structured = res.body?.result?.structuredContent;
    assert.ok(structured);
    assert.strictEqual(structured.success, false);
    assert.ok(structured.discrepancies?.length > 0);
  });
});

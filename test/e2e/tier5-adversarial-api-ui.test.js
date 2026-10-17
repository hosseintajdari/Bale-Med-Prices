/**
 * test/e2e/tier5-adversarial-api-ui.test.js
 *
 * Tier 5: Adversarial Stress Verification Suite for PanelPH
 * Covers:
 * 1. Malformed JSON-RPC payloads, boundary tool inputs, and high-concurrency resilience on /mcp
 * 2. REST API edge cases: route 404s, method mismatches, malformed bodies, oversized payloads, batch export discrepancy gates
 * 3. Catalog resolution stress: fuzzy matching with Unicode RTL, half-spaces (ZWNJ), zero-padded code preservation, stopword filtering, ReDoS resistance
 * 4. Frontend widget behavioral stress: rapid theme toggles, malicious host context themes, candidate selection safety gate, cross-origin postMessage defense
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import {
  projectRoot,
  createMcpClient,
  SAMPLE_DRUGS,
} from "./test-helper.js";

async function setupTier5Server() {
  const directory = await mkdtemp(join(tmpdir(), "panelph-t5-"));
  const statePath = join(directory, "draft.json");

  const { startServer } = await import(`${projectRoot}/src/server.js?test=${Date.now()}_${Math.random()}`);
  const server = startServer({ port: 0, statePath });
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const mcpClient = createMcpClient(baseUrl);

  const restClient = {
    async get(path) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const body = isJson ? await response.json() : await response.text();
      return { status: response.status, body, headers: response.headers };
    },
    async post(path, payload = {}, customHeaders = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...customHeaders,
        },
        body: JSON.stringify(payload),
      });
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const body = isJson ? await response.json() : await response.text();
      return { status: response.status, body, headers: response.headers };
    },
    async patch(path, payload = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const body = isJson ? await response.json() : await response.text();
      return { status: response.status, body, headers: response.headers };
    },
  };

  const cleanup = async () => {
    await new Promise((resolve) => server.close(resolve));
    try {
      await rm(directory, { recursive: true, force: true });
    } catch {}
  };

  return { server, baseUrl, port, mcpClient, restClient, cleanup };
}

import {
  searchCatalog,
  scoreCandidate,
  normalizeDigits,
  normalizeText,
  normalizeCodeString,
  getGoodByCode,
  resolveItem,
  createCatalogResolver,
} from "../../src/catalog-resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const widgetPath = join(projectRoot, "public", "order-desk.html");
const widgetHtml = readFileSync(widgetPath, "utf8");

// ============================================================================
// Helper: Headless DOM Sandbox for Frontend Widget Behavioral Verification
// ============================================================================
function createAdversarialUiSandbox(html = widgetHtml) {
  const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!scriptMatch) throw new Error("No <script type='module'> block found in order-desk.html");
  const scriptCode = scriptMatch[1];

  const postedMessages = [];
  const windowListeners = new Map();
  const elementsMap = new Map();

  class MockElement {
    constructor(tag, id = "", classes = "") {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.className = classes;
      this.value = "";
      this.textContent = "";
      this.innerHTML = "";
      this.disabled = false;
      this.children = [];
      this.attributes = new Map();
      this.eventListeners = new Map();
      this.style = {};
    }

    setAttribute(name, val) {
      this.attributes.set(name, String(val));
    }

    getAttribute(name) {
      return this.attributes.get(name) || null;
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    get classList() {
      const self = this;
      return {
        add(...cls) {
          const classes = new Set(self.className.split(/\s+/).filter(Boolean));
          for (const c of cls) classes.add(c);
          self.className = Array.from(classes).join(" ");
        },
        remove(...cls) {
          const classes = new Set(self.className.split(/\s+/).filter(Boolean));
          for (const c of cls) classes.delete(c);
          self.className = Array.from(classes).join(" ");
        },
        contains(c) {
          return self.className.split(/\s+/).includes(c);
        },
        toggle(c) {
          if (this.contains(c)) this.remove(c);
          else this.add(c);
        },
      };
    }

    addEventListener(event, fn) {
      if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
      this.eventListeners.get(event).push(fn);
    }

    dispatchEvent(event) {
      const handlers = this.eventListeners.get(event.type) || [];
      for (const h of handlers) h(event);
    }

    replaceChildren(...nodes) {
      this.children = nodes;
    }

    append(...nodes) {
      this.children.push(...nodes);
    }

    reset() {
      for (const el of elementsMap.values()) {
        if (el.tagName === "INPUT") el.value = "";
      }
    }

    focus() {}
    blur() {}
  }

  function getElement(sel) {
    if (elementsMap.has(sel)) return elementsMap.get(sel);

    const id = sel.startsWith("#") ? sel.slice(1) : sel;
    for (const el of elementsMap.values()) {
      if (el.id === id) return el;
    }

    const el = new MockElement("div", id);
    elementsMap.set(sel, el);
    return el;
  }

  const knownConfig = {
    "#need-form": { tag: "FORM" },
    "#name": { tag: "INPUT" },
    "#quantity": { tag: "INPUT" },
    "#unit": { tag: "INPUT" },
    "#note": { tag: "INPUT" },
    "#submit": { tag: "BUTTON" },
    "#catalog-search": { tag: "INPUT" },
    "#btn-search-catalog": { tag: "BUTTON" },
    "#btn-confirm-resolve": { tag: "BUTTON", disabled: true },
    "#btn-cancel-drawer": { tag: "BUTTON" },
    "#btn-theme-toggle": { tag: "BUTTON" },
    "#drawer-name": { tag: "INPUT" },
    "#drawer-quantity": { tag: "INPUT" },
    "#drawer-unit": { tag: "INPUT" },
    "#drawer-note": { tag: "INPUT" },
    "#drawer-btn-update": { tag: "BUTTON" },
    "#items": { tag: "DIV" },
    "#ambiguities": { tag: "DIV" },
    "#timeline": { tag: "SECTION" },
    "#history": { tag: "DIV" },
    "#catalog-candidates": { tag: "DIV" },
    "#drawer-backdrop": { tag: "DIV" },
    "#ambiguity-drawer": { tag: "ASIDE" },
  };

  for (const [sel, cfg] of Object.entries(knownConfig)) {
    const el = getElement(sel);
    el.tagName = cfg.tag;
    if (cfg.disabled) el.disabled = true;
  }

  const mockWindow = {
    addEventListener: (type, fn) => {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    parent: {
      postMessage: (msg) => {
        postedMessages.push(msg);
      },
    },
    alert: () => {},
  };
  mockWindow.window = mockWindow;

  const mockDocument = {
    querySelector: (sel) => getElement(sel),
    querySelectorAll: (sel) => {
      if (sel === ".candidate-card") {
        const catalogEl = getElement("#catalog-candidates");
        return catalogEl ? catalogEl.children : [];
      }
      const el = getElement(sel);
      return el ? [el] : [];
    },
    getElementById: (id) => getElement("#" + id),
    createElement: (tag) => new MockElement(tag),
    documentElement: new MockElement("html"),
    body: new MockElement("body"),
  };

  const consoleErrors = [];
  const mockConsole = {
    log: () => {},
    warn: () => {},
    error: (...args) => consoleErrors.push(args),
  };

  const sandbox = {
    window: mockWindow,
    document: mockDocument,
    console: mockConsole,
    setTimeout,
    clearTimeout,
    Promise,
    Map,
    Set,
    Number,
    Array,
    Object,
    String,
    Date,
    JSON,
    encodeURIComponent,
    alert: mockWindow.alert,
  };

  const context = vm.createContext(sandbox);

  function replyTo(id, result = {}, error = null) {
    const handlers = windowListeners.get("message") || [];
    for (const h of handlers) {
      h({
        source: mockWindow.parent,
        data: { jsonrpc: "2.0", id, result, error },
      });
    }
  }

  function dispatchForeignMessage(data) {
    const fakeOtherWindow = {};
    const handlers = windowListeners.get("message") || [];
    for (const h of handlers) {
      h({
        source: fakeOtherWindow,
        data,
      });
    }
  }

  function dispatchHostNotification(method, params = {}) {
    const handlers = windowListeners.get("message") || [];
    for (const h of handlers) {
      h({
        source: mockWindow.parent,
        data: { jsonrpc: "2.0", method, params },
      });
    }
  }

  return {
    context,
    scriptCode,
    mockWindow,
    mockDocument,
    postedMessages,
    consoleErrors,
    getElement,
    replyTo,
    dispatchForeignMessage,
    dispatchHostNotification,
    runScript: () => vm.runInContext(scriptCode, context),
  };
}

// ============================================================================
// SUITE 1: Malformed JSON-RPC & Boundary Tool Inputs
// ============================================================================
test("Suite 1: Malformed JSON-RPC & Boundary MCP Tool Inputs", async (t) => {
  let env;

  t.before(async () => {
    env = await setupTier5Server();
  });

  t.after(async () => {
    if (env) await env.cleanup();
  });

  await t.test("T5_MCP_01: Invalid JSON-RPC envelopes handled gracefully without server crash", async () => {
    // 1. Missing jsonrpc version or invalid version
    const invalidVersionRes = await fetch(`${env.baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "1.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.ok(invalidVersionRes.status >= 200 && invalidVersionRes.status < 600);

    // 2. Missing method
    const missingMethodRes = await fetch(`${env.baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, params: {} }),
    });
    assert.ok(missingMethodRes.status >= 200 && missingMethodRes.status < 600);

    // 3. Null method
    const nullMethodRes = await fetch(`${env.baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: null }),
    });
    assert.ok(nullMethodRes.status >= 200 && nullMethodRes.status < 600);

    // 4. Verify server is still alive and responds to legitimate call
    const healthy = await env.mcpClient.listTools();
    assert.strictEqual(healthy.status, 200, "Server must remain healthy after malformed envelopes");
  });

  await t.test("T5_MCP_02: Unknown tool call returns clean JSON-RPC error", async () => {
    const res = await env.mcpClient.callTool("non_existent_tool_xyz", { someArg: "value" });
    assert.ok(
      res.body?.error || res.body?.result?.isError,
      "Calling a non-existent tool must return error"
    );
  });

  await t.test("T5_MCP_03: Type mismatch on tool arguments rejected safely", async () => {
    // arguments is null
    const nullArgsRes = await fetch(`${env.baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "add_order_need", arguments: null },
      }),
    });
    const nullBody = await nullArgsRes.json();
    assert.ok(nullBody.error || nullBody.result?.isError, "null arguments must be rejected");

    // arguments is string
    const strArgsRes = await fetch(`${env.baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: { name: "add_order_need", arguments: "not-an-object" },
      }),
    });
    const strBody = await strArgsRes.json();
    assert.ok(strBody.error || strBody.result?.isError, "string arguments must be rejected");

    // arguments is array
    const arrArgsRes = await fetch(`${env.baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: { name: "add_order_need", arguments: [1, 2, 3] },
      }),
    });
    const arrBody = await arrArgsRes.json();
    assert.ok(arrBody.error || arrBody.result?.isError, "array arguments must be rejected");
  });

  await t.test("T5_MCP_04: Boundary tool input validation on add_order_need", async () => {
    // 1. Non-string name
    const numNameRes = await env.mcpClient.callTool("add_order_need", { name: 9999, quantity: 1 });
    assert.ok(numNameRes.body?.error || numNameRes.body?.result?.isError, "Numeric name rejected");

    const objNameRes = await env.mcpClient.callTool("add_order_need", { name: { evil: true }, quantity: 1 });
    assert.ok(objNameRes.body?.error || objNameRes.body?.result?.isError, "Object name rejected");

    // 2. Non-positive or invalid quantity
    const zeroRes = await env.mcpClient.callTool("add_order_need", { name: "دارو", quantity: 0 });
    assert.ok(zeroRes.body?.error || zeroRes.body?.result?.isError, "Zero quantity rejected");

    const negRes = await env.mcpClient.callTool("add_order_need", { name: "دارو", quantity: -10 });
    assert.ok(negRes.body?.error || negRes.body?.result?.isError, "Negative quantity rejected");

    const strQtyRes = await env.mcpClient.callTool("add_order_need", { name: "دارو", quantity: "ten" });
    assert.ok(strQtyRes.body?.error || strQtyRes.body?.result?.isError, "String quantity rejected");
  });

  await t.test("T5_MCP_05: Extra unexpected fields & prototype pollution probes are handled safely", async () => {
    const probeRes = await env.mcpClient.callTool("add_order_need", {
      name: "کپسول آموکسی ۵۰۰",
      quantity: 2,
      unit: "جعبه",
      unexpectedAdminKey: "hacked",
      __proto__: { injectedAdmin: true },
    });

    assert.strictEqual(probeRes.status, 200);
    assert.strictEqual(
      Object.prototype.injectedAdmin,
      undefined,
      "Prototype pollution must be strictly prevented"
    );

    const draft = probeRes.body.result.structuredContent.draft;
    const addedItem = draft.items.at(-1);
    assert.strictEqual(addedItem.freeTextName, "کپسول آموکسی ۵۰۰");
    assert.strictEqual(addedItem.quantity, 2);
  });

  await t.test("T5_MCP_06: export_order_batch rejects invalid roundingRule enum values", async () => {
    const invalidEnumRes = await env.mcpClient.callTool("export_order_batch", {
      roundingRule: "exponential_growth",
    });
    assert.ok(
      invalidEnumRes.body?.error || invalidEnumRes.body?.result?.isError,
      "Invalid roundingRule enum value must be rejected"
    );
  });

  await t.test("T5_MCP_07: High-concurrency rapid-fire malformed requests do not crash server", async () => {
    const garbagePayloads = [
      "not json at all",
      JSON.stringify({ jsonrpc: "2.0" }),
      JSON.stringify({ jsonrpc: "2.0", method: "unknown", id: 1 }),
      JSON.stringify({ jsonrpc: "1.0", id: 2 }),
      JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: {}, id: 3 }),
      "{ corrupt json string ...",
      "",
    ];

    const promises = [];
    for (let i = 0; i < 20; i++) {
      const payload = garbagePayloads[i % garbagePayloads.length];
      promises.push(
        fetch(`${env.baseUrl}/mcp`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
        }).catch(() => null)
      );
    }

    await Promise.all(promises);

    // Verify server remains fully functional
    const healthCheck = await env.mcpClient.listTools();
    assert.strictEqual(healthCheck.status, 200, "Server must remain functional after high-rate garbage");
  });
});

// ============================================================================
// SUITE 2: REST API Edge Cases & Discrepancy Gate
// ============================================================================
test("Suite 2: REST API Edge Cases & Discrepancy Gate", async (t) => {
  let env;

  t.before(async () => {
    env = await setupTier5Server();
  });

  t.after(async () => {
    if (env) await env.cleanup();
  });

  await t.test("T5_REST_01: Non-existent REST routes return 404 with structured JSON error", async () => {
    const res1 = await env.restClient.get("/api/nonexistent-route-xyz");
    assert.strictEqual(res1.status, 404);
    assert.strictEqual(res1.body?.error?.code, "NOT_FOUND");

    const res2 = await env.restClient.post("/api/draft/unknown-subroute", { some: "data" });
    assert.strictEqual(res2.status, 404);
    assert.strictEqual(res2.body?.error?.code, "NOT_FOUND");
  });

  await t.test("T5_REST_02: Non-API fallback route returns 404 text", async () => {
    const res = await env.restClient.get("/completely-random-static-route");
    assert.strictEqual(res.status, 404);
    assert.ok(String(res.body).includes("Not Found"));
  });

  await t.test("T5_REST_03: Method mismatches on valid endpoints return 404", async () => {
    // /api/draft is GET only
    const postDraft = await env.restClient.post("/api/draft", {});
    assert.strictEqual(postDraft.status, 404);

    // /api/draft/needs is POST only
    const getNeeds = await env.restClient.get("/api/draft/needs");
    assert.strictEqual(getNeeds.status, 404);

    // /api/orders/export-batch is POST only
    const getExport = await env.restClient.get("/api/orders/export-batch");
    assert.strictEqual(getExport.status, 404);
  });

  await t.test("T5_REST_04: Malformed request bodies return 400 Bad Request with INVALID_JSON", async () => {
    // 1. Raw unparseable text
    const textRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "this is raw text not json",
    });
    assert.strictEqual(textRes.status, 400);
    const textBody = await textRes.json();
    assert.strictEqual(textBody.error?.code, "INVALID_JSON");

    // 2. Primitive JSON number
    const numRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "12345",
    });
    assert.strictEqual(numRes.status, 400);
    const numBody = await numRes.json();
    assert.strictEqual(numBody.error?.code, "INVALID_JSON");

    // 3. Primitive JSON string
    const strRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '"just a string"',
    });
    assert.strictEqual(strRes.status, 400);
    const strBody = await strRes.json();
    assert.strictEqual(strBody.error?.code, "INVALID_JSON");

    // 4. Primitive JSON null
    const nullRes = await fetch(`${env.baseUrl}/api/draft/needs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    });
    assert.strictEqual(nullRes.status, 400);
    const nullBody = await nullRes.json();
    assert.strictEqual(nullBody.error?.code, "INVALID_JSON");
  });

  await t.test("T5_REST_05: URL path injection defense on needId parameter", async () => {
    const evilNeedId = "%2e%2e%2f%2e%2e%2fsecret";
    const res = await env.restClient.patch(`/api/draft/needs/${evilNeedId}`, { name: "Inject" });
    assert.strictEqual(res.status, 404, "Traversing / injecting needId must result in 404");
  });

  await t.test("T5_REST_06: Batch export on empty draft returns discrepancy", async () => {
    const exportRes = await env.restClient.post("/api/orders/export-batch", {});
    assert.strictEqual(exportRes.status, 200);
    assert.strictEqual(exportRes.body.success, false);
    assert.strictEqual(exportRes.body.status, "DISCREPANCIES_DETECTED");
    assert.ok(exportRes.body.discrepancies.length > 0);
    assert.ok(
      exportRes.body.discrepancies.some((d) => d.includes("خالی")),
      "Discrepancies must indicate that draft is empty"
    );
  });

  await t.test("T5_REST_07: Batch export with mixed resolved and unresolved needs blocks export", async () => {
    // 1. Add Need 1 (unresolved free-text)
    const add1 = await env.restClient.post("/api/draft/needs", {
      name: "شربت دیفن هیدرامین آزاد",
      quantity: 3,
      unit: "شیشه",
    });
    const need1Id = add1.body.need.id;

    // 2. Add Need 2 and resolve it
    const add2 = await env.restClient.post("/api/draft/needs", {
      name: "کپسول آموکسی سیلین",
      quantity: 2,
      unit: "بسته",
    });
    const need2Id = add2.body.need.id;

    await env.restClient.post(`/api/draft/needs/${need2Id}/resolve`, {
      reference: {
        title: "Amoxicillin 500mg Capsule",
        genericCode: "00001",
        brandCode: "00001",
        goodId: "g-1001",
      },
    });

    // 3. Attempt batch export with mixed draft
    const exportRes = await env.restClient.post("/api/orders/export-batch", {});
    assert.strictEqual(exportRes.status, 200);
    assert.strictEqual(exportRes.body.success, false, "Batch export must be blocked");
    assert.strictEqual(exportRes.body.status, "DISCREPANCIES_DETECTED");
    assert.strictEqual(exportRes.body.batch, null);

    // Verify unresolved item is cited in discrepancies
    const hasUnresolvedDiscrepancy = exportRes.body.discrepancies.some((d) =>
      d.includes(need1Id) && d.includes("تعیین تکلیف نشده")
    );
    assert.ok(
      hasUnresolvedDiscrepancy,
      `Discrepancies must explicitly cite unresolved need ${need1Id}`
    );
    assert.strictEqual(exportRes.body.summary.unresolvedItems, 1);
    assert.strictEqual(exportRes.body.summary.resolvedItems, 1);
  });

  await t.test("T5_REST_08: Batch export 24-hour uniqueId idempotency cache", async () => {
    // Add need and resolve it to in-stock good
    const addRes = await env.restClient.post("/api/draft/needs", {
      name: "آموکسی ۵۰۰",
      quantity: 1,
      unit: "بسته",
    });
    const needId = addRes.body.need.id;
    await env.restClient.post(`/api/draft/needs/${needId}/resolve`, {
      reference: {
        title: "Amoxicillin 500mg Capsule",
        genericCode: "00001",
        brandCode: "00001",
        goodId: "g-1001",
      },
    });

    // Ensure any previously unresolved items from prior tests are also resolved so export succeeds
    const draftRes = await env.restClient.get("/api/draft");
    for (const item of draftRes.body.draft.items) {
      if (item.status !== "ready_for_review" || !item.resolvedReference) {
        await env.restClient.post(`/api/draft/needs/${item.id}/resolve`, {
          reference: {
            title: "Amoxicillin 500mg Capsule",
            genericCode: "00001",
            brandCode: "00001",
            goodId: "g-1001",
          },
        });
      }
    }

    const uniqueId = `t5-adversarial-uid-${Date.now()}`;

    // First export -> SUBMITTED
    const res1 = await env.restClient.post("/api/orders/export-batch", { uniqueId });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.success, true);
    assert.strictEqual(res1.body.status, "SUBMITTED");

    // Second export with same uniqueId -> CACHED
    const res2 = await env.restClient.post("/api/orders/export-batch", { uniqueId });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.success, true);
    assert.strictEqual(res2.body.status, "CACHED", "Duplicate uniqueId must return CACHED");
  });
});

// ============================================================================
// SUITE 3: Catalog Resolution Stress & Code Preservation
// ============================================================================
test("Suite 3: Catalog Resolution Stress & Zero-Padded Codes", async (t) => {
  await t.test("T5_CAT_01: Zero-padded codes strictly preserved across normalization and search", async () => {
    const codes = ["00001", "08234", "00000", "00123", "00025"];

    for (const code of codes) {
      const normalized = normalizeCodeString(code);
      assert.strictEqual(typeof normalized, "string", `Code ${code} must remain a string`);
      assert.strictEqual(normalized, code, `Leading zeroes of ${code} must be preserved`);

      const queryRes = searchCatalog(code);
      if (queryRes.length > 0) {
        for (const item of queryRes) {
          if (item.genericCode) {
            assert.strictEqual(typeof item.genericCode, "string");
            assert.match(item.genericCode, /^\d+$/);
          }
        }
      }
    }

    // Verify known code 00001
    const match00001 = searchCatalog("00001");
    assert.ok(match00001.length > 0);
    assert.strictEqual(match00001[0].genericCode, "00001");
    assert.strictEqual(typeof match00001[0].genericCode, "string");

    // Verify known code 08234
    const match08234 = searchCatalog("08234");
    assert.ok(match08234.length > 0);
    assert.strictEqual(match08234[0].genericCode, "08234");
    assert.strictEqual(typeof match08234[0].genericCode, "string");

    // Verify non-existent code 00000 does not throw and returns null
    const item00000 = getGoodByCode("00000");
    assert.strictEqual(item00000, null);
  });

  await t.test("T5_CAT_02: Persian and Arabic digits in code queries are transliterated while preserving zeroes", async () => {
    // Persian digits ۰۰۰۰۱ -> 00001
    const persianDigitsCode = "۰۰۰۰۱";
    const normPersian = normalizeCodeString(persianDigitsCode);
    assert.strictEqual(normPersian, "00001", "Persian digits must normalize to ASCII with preserved zeroes");

    const searchPersian = searchCatalog(persianDigitsCode);
    assert.ok(searchPersian.length > 0);
    assert.strictEqual(searchPersian[0].genericCode, "00001");

    // Arabic digits ۰۸۲۳۴ -> 08234
    const arabicDigitsCode = "٠٨٢٣٤";
    const normArabic = normalizeCodeString(arabicDigitsCode);
    assert.strictEqual(normArabic, "08234", "Arabic digits must normalize to ASCII with preserved zeroes");

    const searchArabic = searchCatalog(arabicDigitsCode);
    assert.ok(searchArabic.length > 0);
    assert.strictEqual(searchArabic[0].genericCode, "08234");
  });

  await t.test("T5_CAT_03: Unicode RTL fuzzy matching, ZWNJ, and character equivalence", async () => {
    // 1. ZWNJ half-space: "دیفن‌هیدرامین" vs "شربت دیفن هیدرامین"
    const zwnjQuery = "دیفن\u200cهیدرامین";
    const zwnjResults = searchCatalog(zwnjQuery);
    assert.ok(zwnjResults.length > 0);
    assert.ok(
      zwnjResults.some((r) => r.genericCode === "08234" || r.title.includes("دیفن")),
      "ZWNJ query must match diphenhydramine"
    );

    // 2. Multi-space collapse: "دیفن    هیدرامین"
    const multiSpaceResults = searchCatalog("دیفن    هیدرامین");
    assert.ok(multiSpaceResults.length > 0);
    assert.ok(multiSpaceResults.some((r) => r.genericCode === "08234"));

    // 3. Arabic Keheh 'ك' vs Persian 'ک'
    const arabicKafQuery = "آموكسی ۵۰۰";
    const kafResults = searchCatalog(arabicKafQuery);
    assert.ok(kafResults.length > 0);
    assert.strictEqual(kafResults[0].genericCode, "00001");

    // 4. Arabic Yeh 'ي' vs Persian 'ی'
    const arabicYehQuery = "آموكسي ٥٠٠";
    const yehResults = searchCatalog(arabicYehQuery);
    assert.ok(yehResults.length > 0);
    assert.strictEqual(yehResults[0].genericCode, "00001");

    // 5. Arabic Harakat diacritics stripping: "أَمُوکْسِی"
    const harakatQuery = "أَمُوکْسِی";
    const harakatResults = searchCatalog(harakatQuery);
    assert.ok(harakatResults.length > 0);
    assert.strictEqual(harakatResults[0].genericCode, "00001");
  });

  await t.test("T5_CAT_04: Disallowed standalone generic aliases and isolated tokens return empty results", async () => {
    const disallowedQueries = [
      // Dosage forms
      "قرص", "شربت", "کپسول", "ویال", "پماد", "vial", "syrup", "tablet", "capsule",
      // Isolated units
      "mg", "ml", "واحد", "درصد",
      // Inventory status terms
      "ناموجود", "out of stock", "موجود",
      // Pure dosage without medication identity
      "500 mg", "۵۰۰ میلی گرم", "1000iu", "325mg", "120ml",
    ];

    for (const q of disallowedQueries) {
      const results = searchCatalog(q);
      assert.strictEqual(
        results.length,
        0,
        `Disallowed query '${q}' must return 0 candidates, got: ${results.length}`
      );
    }
  });

  await t.test("T5_CAT_05: Ambiguity evaluation via resolveItem", async () => {
    // 1. Exact canonical query -> high confidence resolution
    const exactRes = resolveItem("Amoxicillin 500mg Capsule");
    assert.strictEqual(exactRes.resolved, true);
    assert.strictEqual(exactRes.confidence, "high");
    assert.strictEqual(exactRes.suggestedReference.genericCode, "00001");

    // 2. Non-existent query -> low/none confidence
    const unknownRes = resolveItem("ناموجود_کاملا_ناشناخته_۱۲۳۴۵");
    assert.strictEqual(unknownRes.resolved, false);
    assert.strictEqual(unknownRes.candidates.length, 0);
  });

  await t.test("T5_CAT_06: ReDoS and adversarial string stress resistance", async () => {
    const startTime = Date.now();

    // 1. 5,000-char long RTL Persian text
    const longRtlQuery = "داروی استامینوفن مسکن ضد درد ".repeat(200);
    const longRes = searchCatalog(longRtlQuery);
    assert.ok(Array.isArray(longRes));

    // 2. XSS payload
    const xssQuery = "<script>alert('xss');</script>";
    const xssRes = searchCatalog(xssQuery);
    assert.ok(Array.isArray(xssRes));

    // 3. SQL Injection payload
    const sqliQuery = "' OR 1=1 UNION SELECT * FROM goods --";
    const sqliRes = searchCatalog(sqliQuery);
    assert.ok(Array.isArray(sqliRes));

    // 4. Null bytes and control characters
    const nullByteQuery = "آموکسی\0\r\n\t500";
    const nullRes = searchCatalog(nullByteQuery);
    assert.ok(Array.isArray(nullRes));

    const duration = Date.now() - startTime;
    assert.ok(
      duration < 300,
      `Adversarial string evaluation must finish swiftly (<300ms), took ${duration}ms`
    );
  });
});

// ============================================================================
// SUITE 4: Frontend Widget Behavioral Stress & PostMessage Security
// ============================================================================
test("Suite 4: Frontend Widget Behavioral Stress & PostMessage Security", async (t) => {
  await t.test("T5_UI_01: Rapid theme toggling maintains state consistency without DOM errors", async () => {
    const sandbox = createAdversarialUiSandbox();
    sandbox.runScript();

    const themeBtn = sandbox.getElement("#btn-theme-toggle");
    assert.ok(themeBtn);

    // Click 30 times rapidly
    for (let i = 0; i < 30; i++) {
      themeBtn.dispatchEvent({ type: "click" });
    }

    const currentThemeAttr = sandbox.mockDocument.documentElement.getAttribute("data-theme");
    // 30 is divisible by 3 (initial auto -> dark -> light -> auto), so cycle lands on auto (no data-theme)
    assert.strictEqual(currentThemeAttr, null);
    assert.strictEqual(
      sandbox.mockDocument.documentElement.style.colorScheme,
      "light dark",
      "Style color-scheme must reset to 'light dark' on auto"
    );
  });

  await t.test("T5_UI_02: Host context theme change boundary and malicious inputs", async () => {
    const sandbox = createAdversarialUiSandbox();
    sandbox.runScript();

    // 1. Legitimate "dark" theme
    sandbox.dispatchHostNotification("ui/notifications/host-context-changed", { theme: "dark" });
    assert.strictEqual(sandbox.mockDocument.documentElement.getAttribute("data-theme"), "dark");
    assert.strictEqual(sandbox.mockDocument.documentElement.style.colorScheme, "dark");

    // 2. Legitimate "light" theme
    sandbox.dispatchHostNotification("ui/notifications/host-context-changed", { theme: "light" });
    assert.strictEqual(sandbox.mockDocument.documentElement.getAttribute("data-theme"), "light");
    assert.strictEqual(sandbox.mockDocument.documentElement.style.colorScheme, "light");

    // 3. Malicious / Unknown theme string (e.g. XSS or unrecognized)
    sandbox.dispatchHostNotification("ui/notifications/host-context-changed", {
      theme: "<script>alert(1)</script>",
    });
    // Unknown theme must remove data-theme attribute and reset colorScheme to "light dark"
    assert.strictEqual(
      sandbox.mockDocument.documentElement.getAttribute("data-theme"),
      null,
      "Unknown theme must not be set as an attribute"
    );
    assert.strictEqual(sandbox.mockDocument.documentElement.style.colorScheme, "light dark");

    // 4. Null / non-string theme
    sandbox.dispatchHostNotification("ui/notifications/host-context-changed", { theme: null });
    assert.strictEqual(sandbox.mockDocument.documentElement.getAttribute("data-theme"), null);
  });

  await t.test("T5_UI_03: Safety gate enforcement on unselected candidates", async () => {
    const sandbox = createAdversarialUiSandbox();
    sandbox.runScript();

    // 1. Initial MCP handshake
    assert.strictEqual(sandbox.postedMessages.length, 1);
    const initMsg = sandbox.postedMessages[0];
    assert.strictEqual(initMsg.method, "ui/initialize");
    sandbox.replyTo(initMsg.id, {
      protocolVersion: "2026-01-26",
      hostContext: { theme: "light" },
    });
    await new Promise((r) => setTimeout(r, 15));

    // 2. Reply to get_order_draft with 1 unresolved need
    const getDraftMsg = sandbox.postedMessages.find((m) => m.method === "tools/call" && m.params?.name === "get_order_draft");
    assert.ok(getDraftMsg);
    sandbox.replyTo(getDraftMsg.id, {
      structuredContent: {
        draft: {
          id: "draft-test-1",
          status: "needs_completion",
          items: [
            {
              id: "item-101",
              freeTextName: "قرص آموکسی",
              quantity: 2,
              unit: "بسته",
              status: "needs_completion",
            },
          ],
          events: [],
        },
      },
    });
    await new Promise((r) => setTimeout(r, 15));

    // 3. Click the ambiguity card to open drawer
    const ambiguitiesEl = sandbox.getElement("#ambiguities");
    assert.strictEqual(ambiguitiesEl.children.length, 1);
    const ambiguityCard = ambiguitiesEl.children[0];
    const resolveBtn = ambiguityCard.children.find((c) => c.tagName === "BUTTON");
    assert.ok(resolveBtn);
    resolveBtn.dispatchEvent({ type: "click" });

    // Drawer should now be open
    const confirmBtn = sandbox.getElement("#btn-confirm-resolve");
    assert.ok(confirmBtn);
    assert.strictEqual(confirmBtn.disabled, true, "Confirm button must be disabled before selection");

    // 4. Attempt click on disabled confirm button (Safety Gate enforcement)
    const messagesBefore = sandbox.postedMessages.length;
    confirmBtn.dispatchEvent({ type: "click" });
    const messagesAfter = sandbox.postedMessages.length;
    assert.strictEqual(
      messagesBefore,
      messagesAfter,
      "Clicking unselected/disabled confirm button must NOT dispatch resolve_order_need"
    );

    // 5. Reply to debounced catalog search with candidates
    const searchMsg = sandbox.postedMessages.find((m) => m.method === "tools/call" && m.params?.name === "search_catalog");
    assert.ok(searchMsg);
    sandbox.replyTo(searchMsg.id, {
      structuredContent: {
        results: [
          {
            title: "Amoxicillin 500mg Capsule",
            persianTitle: "آموکسی سیلین ۵۰۰ میلی گرم",
            genericCode: "00001",
            brandCode: "00001",
            dosageForm: "کپسول",
            strength: "500 mg",
            goodId: "g-1001",
          },
        ],
      },
    });
    await new Promise((r) => setTimeout(r, 15));

    // 6. Select the candidate card
    const candidatesEl = sandbox.getElement("#catalog-candidates");
    assert.strictEqual(candidatesEl.children.length, 1);
    const candidateCard = candidatesEl.children[0];
    candidateCard.dispatchEvent({ type: "click" });

    // Confirm button must now be enabled
    assert.strictEqual(confirmBtn.disabled, false, "Confirm button must be enabled after candidate selection");

    // 7. Click confirm button -> verify resolve_order_need is dispatched with string code
    confirmBtn.dispatchEvent({ type: "click" });
    const resolveCall = sandbox.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "resolve_order_need"
    );
    assert.ok(resolveCall, "resolve_order_need must be dispatched");
    assert.strictEqual(resolveCall.params.arguments.id, "item-101");
    assert.strictEqual(
      typeof resolveCall.params.arguments.reference.genericCode,
      "string",
      "genericCode must be string"
    );
    assert.strictEqual(resolveCall.params.arguments.reference.genericCode, "00001");
  });

  await t.test("T5_UI_04: Cross-origin postMessage injection defense", async () => {
    const sandbox = createAdversarialUiSandbox();
    sandbox.runScript();

    // Send a message from a foreign window
    sandbox.dispatchForeignMessage({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        structuredContent: {
          draft: {
            id: "malicious-hacked-draft",
            status: "ready_for_review",
            items: [],
          },
        },
      },
    });

    // Verify summary or status was not affected
    const statusEl = sandbox.getElement("#status");
    assert.notStrictEqual(
      statusEl.className,
      "badge ready_for_review",
      "Foreign cross-origin message must be completely ignored"
    );
  });

  await t.test("T5_UI_05: Double-submit prevention disables submit button during flight", async () => {
    const sandbox = createAdversarialUiSandbox();
    sandbox.runScript();

    // Complete initial handshake and draft load to enter MCP mode
    const initMsg = sandbox.postedMessages[0];
    sandbox.replyTo(initMsg.id, {});
    await new Promise((r) => setTimeout(r, 15));

    const getDraftMsg = sandbox.postedMessages.find((m) => m.params?.name === "get_order_draft");
    if (getDraftMsg) {
      sandbox.replyTo(getDraftMsg.id, {
        structuredContent: {
          draft: { status: "open", items: [], events: [] },
        },
      });
      await new Promise((r) => setTimeout(r, 15));
    }

    // Set input values
    const nameInput = sandbox.getElement("#name");
    const qtyInput = sandbox.getElement("#quantity");
    const submitBtn = sandbox.getElement("#submit");
    const formEl = sandbox.getElement("#need-form");

    nameInput.value = "قرص استامینوفن";
    qtyInput.value = "2";

    // Submit form
    formEl.dispatchEvent({ type: "submit", preventDefault: () => {} });

    // Submit button must be disabled immediately while waiting for network response
    assert.strictEqual(submitBtn.disabled, true, "Submit button must be disabled during network flight");

    // Reply to add_order_need tool call
    const addMsg = sandbox.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "add_order_need"
    );
    assert.ok(addMsg);
    sandbox.replyTo(addMsg.id, {
      structuredContent: {
        draft: {
          items: [{ id: "item-new", freeTextName: "قرص استامینوفن", quantity: 2, status: "needs_completion" }],
        },
      },
    });

    // Allow promise resolution
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Submit button re-enabled after completion
    assert.strictEqual(submitBtn.disabled, false, "Submit button must be re-enabled after completion");
  });
});

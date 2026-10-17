/**
 * test/frontend-order-desk.test.js
 *
 * Comprehensive Automated Verification Suite for PanelPH Pharmacist Order Desk UI
 * (Milestone 4: Pharmacist Frontend & Apps SDK Widget)
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const widgetPath = join(projectRoot, "public", "order-desk.html");
const widgetHtml = readFileSync(widgetPath, "utf8");

// ============================================================================
// Helper: Server Setup & Teardown
// ============================================================================
async function setupServer() {
  const dir = await mkdtemp(join(tmpdir(), "panelph-ui-test-"));
  const statePath = join(dir, "draft.json");

  const { startServer } = await import(`../src/server.js?test=${Date.now()}_${Math.random()}`);
  const server = startServer({ port: 0, statePath });
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const cleanup = async () => {
    await new Promise((resolve) => server.close(resolve));
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // ignore tmp cleanup error
    }
  };

  return { server, baseUrl, cleanup, statePath };
}

async function mcpCall(baseUrl, method, params = {}) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now() + Math.floor(Math.random() * 1000),
      method,
      params,
    }),
  });
  return { status: res.status, body: await res.json() };
}

// ============================================================================
// Helper: Lightweight DOM Element Parser (Zero External Dependencies)
// ============================================================================
function parseHtmlElements(html) {
  const elements = [];
  const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    if (tagName.startsWith("!")) continue;
    const attrString = match[2];
    const attrs = {};
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      attrs[attrMatch[1].toLowerCase()] = attrMatch[2] !== undefined ? attrMatch[2] : true;
    }
    elements.push({
      tagName,
      id: attrs.id || null,
      name: attrs.name || null,
      type: attrs.type || null,
      class: attrs.class || "",
      role: attrs.role || null,
      ariaLabel: attrs["aria-label"] || null,
      attrs,
    });
  }
  return elements;
}

// ============================================================================
// Helper: Headless DOM Sandbox for Client JavaScript Behavioral Verification
// ============================================================================
function createHeadlessSandbox(html) {
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

  // Pre-seed known elements with proper tags & attributes
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

  const consoleLogs = [];
  const consoleErrors = [];
  const mockConsole = {
    log: (...args) => consoleLogs.push(args),
    warn: (...args) => consoleLogs.push(args),
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

  function sendNotification(method, params = {}) {
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
    sendNotification,
    runScript: () => vm.runInContext(scriptCode, context),
  };
}

// ============================================================================
// TEST SUITE 1: HTTP & Static File Serving
// ============================================================================
test("Suite 1: HTTP Static Server Delivery", async (t) => {
  let env;
  t.beforeEach(async () => {
    env = await setupServer();
  });
  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  await t.test("GET /order-desk.html returns 200 with text/html content-type", async () => {
    const res = await fetch(`${env.baseUrl}/order-desk.html`);
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get("content-type") || "";
    assert.ok(
      contentType.includes("text/html"),
      `Expected content-type to include text/html, got: ${contentType}`
    );
  });

  await t.test("GET /order-desk.html body matches public/order-desk.html exactly", async () => {
    const res = await fetch(`${env.baseUrl}/order-desk.html`);
    const body = await res.text();
    assert.strictEqual(body, widgetHtml, "Served HTML must match file content on disk");
  });

  await t.test("GET / root returns 200 plain text application identifier", async () => {
    const res = await fetch(`${env.baseUrl}/`);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes("PanelPH MCP App"));
  });

  await t.test("POST /order-desk.html returns 404 Not Found", async () => {
    const res = await fetch(`${env.baseUrl}/order-desk.html`, { method: "POST" });
    assert.strictEqual(res.status, 404);
  });
});

// ============================================================================
// TEST SUITE 2: MCP Protocol & Apps SDK Resource Contract
// ============================================================================
test("Suite 2: MCP Protocol & Apps SDK Resource Contract", async (t) => {
  let env;
  t.beforeEach(async () => {
    env = await setupServer();
  });
  t.afterEach(async () => {
    if (env) await env.cleanup();
  });

  await t.test("resources/read ui://panelph/order-desk.html returns valid HTML resource payload", async () => {
    const res = await mcpCall(env.baseUrl, "resources/read", {
      uri: "ui://panelph/order-desk.html",
    });
    assert.strictEqual(res.status, 200);
    const contents = res.body?.result?.contents;
    assert.ok(Array.isArray(contents), "Contents must be an array");
    assert.strictEqual(contents.length, 1);
    assert.strictEqual(contents[0].uri, "ui://panelph/order-desk.html");
    assert.strictEqual(contents[0].mimeType, "text/html;profile=mcp-app");
    assert.strictEqual(contents[0].text, widgetHtml);

    assert.deepStrictEqual(
      contents[0]._meta?.["openai/ui"]?.availableDisplayModes,
      ["inline", "fullscreen"],
      "Must offer inline and fullscreen display modes"
    );
  });

  await t.test("tools/call render_order_desk returns draft state and UI resource binding", async () => {
    const res = await mcpCall(env.baseUrl, "tools/call", {
      name: "render_order_desk",
      arguments: {},
    });
    assert.strictEqual(res.status, 200);
    const structured = res.body?.result?.structuredContent;
    assert.ok(structured?.draft, "Tool call must return structured draft");
    assert.strictEqual(structured.draft.status, "open");
  });
});

// ============================================================================
// TEST SUITE 3: DOM Structure & Element Integrity
// ============================================================================
test("Suite 3: DOM Structure & Element Integrity", async (t) => {
  const elements = parseHtmlElements(widgetHtml);
  const findEl = (sel) => {
    if (sel.startsWith("#")) return elements.find((e) => e.id === sel.slice(1));
    if (sel.startsWith(".")) return elements.find((e) => e.class.split(/\s+/).includes(sel.slice(1)));
    return elements.find((e) => e.tagName === sel.toLowerCase());
  };

  await t.test("Persian language and RTL layout enforcement", () => {
    assert.match(widgetHtml, /<html[^>]*lang=["']fa["']/i, "HTML tag must have lang='fa'");
    assert.match(widgetHtml, /<html[^>]*dir=["']rtl["']/i, "HTML tag must have dir='rtl'");
    assert.match(widgetHtml, /<meta[^>]*charset=["']utf-8["']/i, "Must specify UTF-8 charset");
  });

  await t.test("Critical form inputs presence (#name, #quantity, #unit, #note, #submit)", () => {
    assert.ok(findEl("#need-form"), "Must include #need-form");

    const nameInput = findEl("#name") || findEl("#need-name");
    assert.ok(nameInput, "Must include item name input (#name)");

    const qtyInput = findEl("#quantity") || findEl("#need-qty");
    assert.ok(qtyInput, "Must include quantity input (#quantity)");
    assert.strictEqual(qtyInput.type, "number", "Quantity input must be type='number'");

    const unitInput = findEl("#unit") || findEl("#need-unit");
    assert.ok(unitInput, "Must include unit input (#unit)");

    const noteInput = findEl("#note") || findEl("#need-note");
    assert.ok(noteInput, "Must include optional note input (#note)");

    const submitBtn = findEl("#submit") || findEl("#need-submit");
    assert.ok(submitBtn, "Must include form submit button (#submit)");
  });

  await t.test("Status, summary, and column containers presence (#status, #summary, #items, #ambiguities)", () => {
    const statusEl = findEl("#status") || findEl("#draft-status");
    assert.ok(statusEl, "Must include draft status indicator badge (#status)");

    const summaryEl = findEl("#summary");
    assert.ok(summaryEl, "Must include summary counter container (#summary)");

    const itemsEl = findEl("#items");
    assert.ok(itemsEl, "Must include draft items container (#items)");

    const ambiguitiesEl = findEl("#ambiguities");
    assert.ok(ambiguitiesEl, "Must include ambiguities container (#ambiguities)");
  });

  await t.test("Ambiguity resolution drawer and action buttons presence", () => {
    const drawer = findEl("#ambiguity-drawer");
    assert.ok(drawer, "Must include ambiguity drawer panel (#ambiguity-drawer)");

    const confirmBtn = findEl("#btn-confirm-resolve");
    assert.ok(confirmBtn, "Must include resolution confirm button (#btn-confirm-resolve)");
    assert.ok(confirmBtn.attrs.disabled !== undefined, "Confirm button must be initially disabled");

    const themeToggleBtn = findEl("#btn-theme-toggle") || findEl("#theme-toggle");
    assert.ok(themeToggleBtn, "Must include theme toggle button (#btn-theme-toggle)");
  });

  await t.test("Event timeline container presence (#timeline)", () => {
    const timeline = findEl("#timeline") || findEl("#history");
    assert.ok(timeline, "Must include event timeline container (#timeline)");
  });

  await t.test("Host context theme synchronization hooks & dark mode CSS", () => {
    assert.match(
      widgetHtml,
      /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/i,
      "CSS must include dark mode media query"
    );
    assert.match(widgetHtml, /--page:/, "CSS must define --page variable");
    assert.match(widgetHtml, /--surface:/, "CSS must define --surface variable");
    assert.match(widgetHtml, /--text:/, "CSS must define --text variable");
    assert.match(widgetHtml, /--accent:/, "CSS must define --accent variable");
    assert.match(widgetHtml, /--warning-bg:/, "CSS must define --warning-bg variable");
    assert.match(widgetHtml, /--success-bg:/, "CSS must define --success-bg variable");
    assert.match(widgetHtml, /--info-bg:/, "CSS must define --info-bg variable");
    assert.match(widgetHtml, /--danger-bg:/, "CSS must define --danger-bg variable");
  });
});

// ============================================================================
// TEST SUITE 4: Client JavaScript Logic & Behavioral Simulation in Headless VM
// ============================================================================
test("Suite 4: Client JavaScript Behavioral Simulation in Headless VM", async (t) => {
  await t.test("Handshake & Initial Draft Load: calls ui/initialize and get_order_draft", async () => {
    const harness = createHeadlessSandbox(widgetHtml);
    harness.runScript();

    assert.ok(harness.postedMessages.length >= 1, "Expected initial postMessage");
    const initMsg = harness.postedMessages[0];
    assert.strictEqual(initMsg.method, "ui/initialize");
    assert.strictEqual(initMsg.params.appInfo.name, "panelph-order-desk");

    harness.replyTo(initMsg.id, {});
    await new Promise((r) => setTimeout(r, 10));

    const notifMsg = harness.postedMessages.find((m) => m.method === "ui/notifications/initialized");
    assert.ok(notifMsg, "Must notify host of initialization");

    const getDraftMsg = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "get_order_draft"
    );
    assert.ok(getDraftMsg, "Must call get_order_draft on startup");

    harness.replyTo(getDraftMsg.id, {
      structuredContent: {
        draft: {
          status: "open",
          items: [],
          events: [],
          summary: { itemCount: 0, ambiguityCount: 0 },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    const statusEl = harness.getElement("#status");
    assert.strictEqual(statusEl.textContent, "باز");
    assert.strictEqual(harness.consoleErrors.length, 0, "No console errors during handshake");
  });

  await t.test("Free-text addition: captures name, quantity, unit, note and disables submit during flight", async () => {
    const harness = createHeadlessSandbox(widgetHtml);
    harness.runScript();

    harness.replyTo(harness.postedMessages[0].id, {});
    await new Promise((r) => setTimeout(r, 10));
    const getDraftMsg = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "get_order_draft"
    );
    harness.replyTo(getDraftMsg.id, {
      structuredContent: {
        draft: { status: "open", items: [], events: [], summary: { itemCount: 0, ambiguityCount: 0 } },
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    const nameEl = harness.getElement("#name");
    const qtyEl = harness.getElement("#quantity");
    const unitEl = harness.getElement("#unit");
    const noteEl = harness.getElement("#note");
    const submitBtn = harness.getElement("#submit");
    const formEl = harness.getElement("#need-form");

    nameEl.value = "قرص فاموتیدین ۴۰";
    qtyEl.value = "2";
    unitEl.value = "جعبه";
    noteEl.value = "برای بخش اورژانس";

    formEl.dispatchEvent({ type: "submit", preventDefault: () => {} });
    assert.strictEqual(submitBtn.disabled, true, "Submit button must disable during pending RPC");

    const addMsg = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "add_order_need"
    );
    assert.ok(addMsg, "Must dispatch add_order_need tool call");
    assert.strictEqual(addMsg.params.arguments.name, "قرص فاموتیدین ۴۰");
    assert.strictEqual(addMsg.params.arguments.quantity, 2);
    assert.strictEqual(addMsg.params.arguments.unit, "جعبه");
    assert.strictEqual(addMsg.params.arguments.note, "برای بخش اورژانس");

    harness.replyTo(addMsg.id, {
      structuredContent: {
        draft: {
          status: "needs_completion",
          items: [
            {
              id: "item-1",
              freeTextName: "قرص فاموتیدین ۴۰",
              quantity: 2,
              unit: "جعبه",
              note: "برای بخش اورژانس",
              status: "needs_completion",
            },
          ],
          events: [{ type: "need_added", id: "ev-1", occurredAt: new Date().toISOString() }],
          summary: { itemCount: 1, ambiguityCount: 1 },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(submitBtn.disabled, false, "Submit button must re-enable upon response");
    assert.strictEqual(nameEl.value, "", "Form name input should be reset");
  });

  await t.test("Error display: catches failure and renders error message without crash", async () => {
    const harness = createHeadlessSandbox(widgetHtml);
    harness.runScript();

    harness.replyTo(harness.postedMessages[0].id, {});
    await new Promise((r) => setTimeout(r, 10));
    const getDraftMsg = harness.postedMessages.find((m) => m.params?.name === "get_order_draft");
    harness.replyTo(getDraftMsg.id, {
      structuredContent: {
        draft: { status: "open", items: [], events: [], summary: { itemCount: 0, ambiguityCount: 0 } },
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    const nameEl = harness.getElement("#name");
    const qtyEl = harness.getElement("#quantity");
    const submitBtn = harness.getElement("#submit");
    const errorEl = harness.getElement("#error");
    const formEl = harness.getElement("#need-form");

    nameEl.value = "کالای نامعتبر";
    qtyEl.value = "1";

    formEl.dispatchEvent({ type: "submit", preventDefault: () => {} });
    const addMsg = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "add_order_need"
    );

    harness.replyTo(addMsg.id, null, { message: "خطای سرور: ثبت نیاز متوقف شد" });
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(submitBtn.disabled, false, "Submit button must be restored");
    assert.ok(
      errorEl.textContent.includes("خطای سرور") || errorEl.textContent.length > 0,
      "Error element must show failure text"
    );
  });

  await t.test("Debounced catalog search: triggers search_catalog tool call with query", async () => {
    const harness = createHeadlessSandbox(widgetHtml);
    harness.runScript();

    harness.replyTo(harness.postedMessages[0].id, {});
    await new Promise((r) => setTimeout(r, 10));
    const getDraftMsg = harness.postedMessages.find((m) => m.params?.name === "get_order_draft");
    harness.replyTo(getDraftMsg.id, {
      structuredContent: {
        draft: { status: "open", items: [], events: [], summary: { itemCount: 0, ambiguityCount: 0 } },
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    const searchInput = harness.getElement("#catalog-search");
    searchInput.value = "استامینوفن";
    searchInput.dispatchEvent({ type: "input", target: { value: "استامینوفن" } });

    // Await debounce delay (400ms + buffer)
    await new Promise((r) => setTimeout(r, 450));

    const searchMsg = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "search_catalog"
    );
    assert.ok(searchMsg, "Debounced search must trigger search_catalog tool call");
    assert.strictEqual(searchMsg.params.arguments.query, "استامینوفن");
  });

  await t.test("Confirmation safety gate & leading zero preservation on resolution", async () => {
    const harness = createHeadlessSandbox(widgetHtml);
    harness.runScript();

    harness.replyTo(harness.postedMessages[0].id, {});
    await new Promise((r) => setTimeout(r, 10));
    const getDraftMsg = harness.postedMessages.find((m) => m.params?.name === "get_order_draft");
    harness.replyTo(getDraftMsg.id, {
      structuredContent: {
        draft: {
          status: "needs_completion",
          items: [
            {
              id: "item-42",
              freeTextName: "آموکسی سیلین ۵۰۰",
              quantity: 3,
              unit: "بسته",
              status: "needs_completion",
            },
          ],
          events: [],
          summary: { itemCount: 1, ambiguityCount: 1 },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    const confirmBtn = harness.getElement("#btn-confirm-resolve");
    assert.strictEqual(confirmBtn.disabled, true, "Confirm button must be initially disabled");

    const ambiguitiesEl = harness.getElement("#ambiguities");
    assert.ok(ambiguitiesEl.children.length >= 1, "Ambiguity card rendered");
    const ambiguityCard = ambiguitiesEl.children[0];

    // Find and click the action button inside ambiguity card
    const resolveActionBtn = ambiguityCard.children.find((c) => c.tagName === "BUTTON");
    assert.ok(resolveActionBtn, "Ambiguity card must have resolve action button");
    resolveActionBtn.dispatchEvent({ type: "click" });
    await new Promise((r) => setTimeout(r, 10));

    // Confirm button remains disabled after drawer opens until candidate selection
    assert.strictEqual(confirmBtn.disabled, true, "Confirm button remains disabled until candidate card is selected");

    // Reply to catalog search triggered by opening drawer
    const searchMsg = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "search_catalog" && m.params.arguments?.query === "آموکسی سیلین ۵۰۰"
    );
    assert.ok(searchMsg, "Opening drawer should trigger catalog search");

    harness.replyTo(searchMsg.id, {
      structuredContent: {
        results: [
          {
            goodId: "1001",
            persianTitle: "کپسول آموکسی سیلین ۵۰۰ میلی گرم",
            title: "Amoxicillin 500mg Capsule",
            genericCode: "00001",
            brandCode: "08234",
            dosageForm: "کپسول",
            strength: "500 mg",
            sellPrice: 125000,
          },
        ],
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    const candidatesList = harness.getElement("#catalog-candidates");
    assert.ok(candidatesList.children.length === 1, "Candidate card rendered in catalog candidates list");
    const candCard = candidatesList.children[0];

    // Safety gate: verify still disabled before clicking candidate
    assert.strictEqual(confirmBtn.disabled, true, "Safety gate: confirm button must still be disabled before user clicks candidate");

    // Select candidate card
    candCard.dispatchEvent({ type: "click" });
    assert.strictEqual(confirmBtn.disabled, false, "Confirm button must become enabled after candidate is selected");

    // Click confirm button
    confirmBtn.dispatchEvent({ type: "click" });
    await new Promise((r) => setTimeout(r, 10));

    const resolveCall = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "resolve_order_need"
    );
    assert.ok(resolveCall, "Must dispatch resolve_order_need tool call");
    assert.strictEqual(resolveCall.params.arguments.id, "item-42");
    assert.strictEqual(resolveCall.params.arguments.reference.title, "کپسول آموکسی سیلین ۵۰۰ میلی گرم");
    // Verify leading zeroes preservation as string
    assert.strictEqual(resolveCall.params.arguments.reference.genericCode, "00001");
    assert.strictEqual(resolveCall.params.arguments.reference.brandCode, "08234");
    assert.strictEqual(typeof resolveCall.params.arguments.reference.genericCode, "string");
    assert.strictEqual(typeof resolveCall.params.arguments.reference.brandCode, "string");
  });

  await t.test("Compensating event revert: dispatches revert_order_event with event ID", async () => {
    const harness = createHeadlessSandbox(widgetHtml);
    harness.runScript();

    harness.replyTo(harness.postedMessages[0].id, {});
    await new Promise((r) => setTimeout(r, 10));
    const getDraftMsg = harness.postedMessages.find((m) => m.params?.name === "get_order_draft");
    harness.replyTo(getDraftMsg.id, {
      structuredContent: {
        draft: {
          status: "open",
          items: [],
          events: [
            {
              id: "ev-99",
              type: "need_added",
              occurredAt: new Date().toISOString(),
              payload: { name: "سرم شستشو", quantity: 10, unit: "عدد" },
            },
          ],
          summary: { itemCount: 1, ambiguityCount: 1 },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    const historyEl = harness.getElement("#history");
    assert.ok(historyEl.children.length === 1, "History event item rendered");
    const eventRow = historyEl.children[0];

    // Find the revert button on the event row
    const revertBtn = eventRow.children.find((c) => c.className?.includes("btn-revert"));
    assert.ok(revertBtn, "Event row must include revert button");

    revertBtn.dispatchEvent({ type: "click" });
    await new Promise((r) => setTimeout(r, 10));

    const revertCall = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "revert_order_event"
    );
    assert.ok(revertCall, "Must dispatch revert_order_event tool call");
    assert.strictEqual(revertCall.params.arguments.eventId, "ev-99");
  });

  await t.test("Host context theme change notification triggers theme update", async () => {
    const harness = createHeadlessSandbox(widgetHtml);
    harness.runScript();

    harness.replyTo(harness.postedMessages[0].id, {});
    await new Promise((r) => setTimeout(r, 10));

    // Dispatch host context theme change notification
    harness.sendNotification("ui/notifications/host-context-changed", { theme: "dark" });
    await new Promise((r) => setTimeout(r, 10));

    const htmlEl = harness.mockDocument.documentElement;
    assert.strictEqual(htmlEl.getAttribute("data-theme"), "dark", "Must set data-theme='dark'");
    assert.strictEqual(htmlEl.style.colorScheme, "dark", "Must set colorScheme='dark'");

    // Dispatch switch back to light
    harness.sendNotification("ui/notifications/host-context-changed", { theme: "light" });
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(htmlEl.getAttribute("data-theme"), "light", "Must set data-theme='light'");
    assert.strictEqual(htmlEl.style.colorScheme, "light", "Must set colorScheme='light'");

    // Dispatch switch to auto
    harness.sendNotification("ui/notifications/host-context-changed", { theme: "auto" });
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(htmlEl.getAttribute("data-theme"), null, "Must remove data-theme on auto");
    assert.strictEqual(htmlEl.style.colorScheme, "light dark", "Must set colorScheme='light dark' on auto");
  });
});

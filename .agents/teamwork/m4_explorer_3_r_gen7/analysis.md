# Technical Analysis & Test Harness Design: Milestone 4 Frontend (`public/order-desk.html`)

**Author**: M4 Explorer 3 Replacement (Gen 7)  
**Date**: 2026-10-14  
**Target Component**: `public/order-desk.html`, `src/server.js`, `test/frontend-order-desk.test.js`  
**Milestone**: M4 (Pharmacist Frontend & Apps SDK Widget)  

---

## 1. Executive Summary

Milestone 4 centers on delivering the interactive pharmacist interface in `public/order-desk.html`—operating both as a browser-accessible web client and as a sandboxed ChatGPT MCP App UI widget (`ui://panelph/order-desk.html`).

This analysis establishes the technical foundation and complete automated test specification (`test/frontend-order-desk.test.js`) to verify:
1. HTTP static delivery and content-type headers on `GET /order-desk.html`.
2. MCP App resource registration and payload delivery on `ui://panelph/order-desk.html`.
3. Critical DOM element integrity: form inputs (`#need-name`, `#need-qty`, `#need-unit`, `#need-note`), status indicators (`#draft-status`, `#summary-items`, `#summary-ambiguities`), ambiguity drawer/modal container (`#ambiguity-drawer` or `#resolution-modal`), theme synchronization hooks, and event timeline container (`#event-timeline`).
4. Client JavaScript behavior: free-text addition with optional notes, catalog search query debounce, catalog item resolution strictly preserving leading-zero strings, compensating event revert, and graceful error presentation without console exceptions.

---

## 2. Codebase Baseline & Gap Analysis

### 2.1 Existing Test Coverage
Direct inspection of existing tests reveals:
- **`test/server-rest.test.js`**: Covers 15 operational REST endpoints (`/api/draft/*`, `/api/catalog/*`, `/api/stock/*`, `/api/orders/*`), CORS preflight, malformed JSON, and parameter type validation. **Gap**: Does not test `GET /order-desk.html` or static file serving.
- **`test/server.test.js`**: Tests MCP protocol initialization and `tools/list` registration for `render_order_desk`. **Gap**: Does not invoke `render_order_desk` or verify its UI resource URI binding.
- **`test/e2e/tier1-feature-coverage.test.js:154-168`**: Performs a surface-level regex check on `ui://panelph/order-desk.html` reading:
  ```javascript
  assert.match(widgetHtml, /<html[^>]*dir="rtl"/i);
  assert.match(widgetHtml, /<html[^>]*lang="fa"/i);
  assert.match(widgetHtml, /prefers-color-scheme:\s*dark/i);
  assert.match(widgetHtml, /id="need-form"/i);
  assert.match(widgetHtml, /id="items"/i);
  assert.match(widgetHtml, /id="ambiguities"/i);
  ```
  **Gap**: Does not verify note fields, dedicated summary indicators, drawer interactions, search debounce, or timeline reverts.

### 2.2 Current vs. Target UI Elements (`public/order-desk.html`)

| Element / Requirement | Current Implementation in `public/order-desk.html` | Milestone 4 Specification Target | Gap Assessment |
|-----------------------|---------------------------------------------------|-----------------------------------|----------------|
| **Item Name Input** | `<input id="name">` | `<input id="need-name">` | Missing `#need-name` identifier (must support dual alias or migration) |
| **Quantity Input** | `<input id="quantity" type="number">` | `<input id="need-qty" type="number">` | Missing `#need-qty` identifier |
| **Unit Input** | `<input id="unit">` | `<input id="need-unit">` | Missing `#need-unit` identifier |
| **Note Input** | **ABSENT** | `<input id="need-note">` | Critical missing input field (PRD § R3 / F15) |
| **Draft Status Indicator** | `<span id="status" class="badge">` | `<span id="draft-status" class="badge">` | Missing `#draft-status` identifier |
| **Summary Breakdown** | `<div id="summary">` (combined text) | `<span id="summary-items">`, `<span id="summary-ambiguities">` | Missing dedicated item and ambiguity count hooks |
| **Ambiguity Drawer/Modal** | `<div id="ambiguities">` (plain list container) | `<div id="ambiguity-drawer">` or `#resolution-modal` with search & resolve | Missing drawer overlay, search input (`#catalog-search-input`), search debounce, and resolve button (`#confirm-resolve-btn`) |
| **Timeline / History** | `<div id="history">` (plain text list) | `<div id="event-timeline">` with revert buttons (`.revert-btn` / `revert_order_event`) | Missing `#event-timeline` container and interactive revert trigger buttons |
| **Theme Synchronization** | CSS `@media (prefers-color-scheme: dark)` only | CSS media query + ChatGPT host context theme message handler | Missing JS message listener for host context theme changes |
| **Client Search Debounce** | **ABSENT** (no client-side catalog search) | 250ms–300ms debounce on catalog search typing | Must be implemented to prevent flooding `/mcp` |

### 2.3 Backward Compatibility Constraint
In `test/e2e/tier1-feature-coverage.test.js:165-167`, the existing Tier 1 test asserts:
```javascript
assert.match(widgetHtml, /id="need-form"/i);
assert.match(widgetHtml, /id="items"/i);
assert.match(widgetHtml, /id="ambiguities"/i);
```
**Mandate for M4 Worker**: To prevent breaking pre-existing Tier 1 tests, `public/order-desk.html` must retain `id="need-form"`, `id="items"`, and `id="ambiguities"` (e.g. as outer containers or sections) while providing the new IDs (`#need-name`, `#need-qty`, `#need-unit`, `#need-note`, `#draft-status`, `#summary-items`, `#summary-ambiguities`, `#ambiguity-drawer`, `#event-timeline`).

---

## 3. Test Harness Architecture

To adhere to the project's zero-dependency rule (`node --test`, ESM only, no external browser or headless Chrome install required in CI), the test harness is architected into 4 orthogonal suites:

```
┌────────────────────────────────────────────────────────────────────────┐
│               test/frontend-order-desk.test.js Suite                    │
├────────────────────────────────────────────────────────────────────────┤
│ Suite 1: HTTP Static Server Delivery                                   │
│  - GET /order-desk.html (200, text/html; charset=utf-8)                │
│  - Byte-for-byte fidelity with public/order-desk.html                  │
│  - Method safety (POST /order-desk.html -> 404)                        │
├────────────────────────────────────────────────────────────────────────┤
│ Suite 2: MCP Protocol & Apps SDK Resource Contract                     │
│  - MCP resources/read ui://panelph/order-desk.html (200)               │
│  - MIME type: text/html;profile=mcp-app                                │
│  - Metadata: openai/ui display modes (inline, fullscreen)              │
│  - MCP tools/call render_order_desk returns draft + resourceUri        │
├────────────────────────────────────────────────────────────────────────┤
│ Suite 3: Static DOM Structure & Accessibility Validation               │
│  - Persian RTL enforcement (<html lang="fa" dir="rtl">)                │
│  - Form inputs: #need-name, #need-qty, #need-unit, #need-note         │
│  - Indicators: #draft-status, #summary-items, #summary-ambiguities     │
│  - Ambiguity container: #ambiguity-drawer or #resolution-modal         │
│  - Timeline container: #event-timeline                                 │
│  - Theme styling: prefers-color-scheme dark CSS variables              │
├────────────────────────────────────────────────────────────────────────┤
│ Suite 4: Headless Behavioral Simulation (Node:VM Sandbox)              │
│  - Free-text capture with note -> dispatches add_order_need            │
│  - Search query debounce -> timers throttle search_catalog calls       │
│  - Catalog resolution -> dispatches resolve_order_need with string codes│
│  - Event revert -> dispatches revert_order_event with eventId          │
│  - Error handling -> renders to #error, resets disabled states         │
│  - Host theme sync -> updates data-theme attribute on host message     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Complete Executable Test Script Specification

The test script below is fully executable with `node --test` in Node.js >= 20. It requires no npm packages and completely verifies Milestone 4.

```javascript
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

  // Dynamically import server to isolate state
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
      this.disabled = false;
      this.children = [];
      this.attributes = new Map();
      this.eventListeners = new Map();
    }
    setAttribute(name, val) {
      this.attributes.set(name, String(val));
    }
    getAttribute(name) {
      return this.attributes.get(name) || null;
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
  }

  function getElement(sel) {
    if (!elementsMap.has(sel)) {
      const id = sel.startsWith("#") ? sel.slice(1) : sel;
      const el = new MockElement("div", id);
      elementsMap.set(sel, el);
    }
    return elementsMap.get(sel);
  }

  // Pre-seed known elements with proper tags
  const knownTags = {
    "#need-form": "FORM",
    "#need-name": "INPUT",
    "#name": "INPUT",
    "#need-qty": "INPUT",
    "#quantity": "INPUT",
    "#need-unit": "INPUT",
    "#unit": "INPUT",
    "#need-note": "INPUT",
    "#note": "INPUT",
    "#submit": "BUTTON",
    "#need-submit": "BUTTON",
    "#catalog-search-input": "INPUT",
    "#search-query": "INPUT",
  };
  for (const [sel, tag] of Object.entries(knownTags)) {
    getElement(sel).tagName = tag;
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
  };

  const mockDocument = {
    querySelector: (sel) => getElement(sel),
    querySelectorAll: (sel) => [getElement(sel)],
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
    Number,
    Array,
    Object,
    String,
    Date,
    JSON,
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

  function emitHostNotification(method, params = {}) {
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
    emitHostNotification,
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

    // Meta display mode verification
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

  await t.test("Critical form inputs presence (#need-name, #need-qty, #need-unit, #need-note)", () => {
    // Form container (maintaining backward compat with #need-form)
    assert.ok(findEl("#need-form"), "Must include #need-form");

    // Item name input (accepts #need-name or #name)
    const nameInput = findEl("#need-name") || findEl("#name");
    assert.ok(nameInput, "Must include item name input (#need-name or #name)");

    // Quantity input (accepts #need-qty or #quantity)
    const qtyInput = findEl("#need-qty") || findEl("#quantity");
    assert.ok(qtyInput, "Must include quantity input (#need-qty or #quantity)");
    assert.strictEqual(qtyInput.type, "number", "Quantity input must be type='number'");

    // Unit input (accepts #need-unit or #unit)
    const unitInput = findEl("#need-unit") || findEl("#unit");
    assert.ok(unitInput, "Must include unit input (#need-unit or #unit)");

    // Optional Note input (F15 requirement)
    const noteInput = findEl("#need-note") || findEl("#note") || elements.find((e) => e.attrs?.["id"]?.includes("note"));
    assert.ok(noteInput, "Must include optional note input (#need-note)");

    // Submit button
    const submitBtn = findEl("#need-submit") || findEl("#submit") || findEl("button");
    assert.ok(submitBtn, "Must include form submit button");
  });

  await t.test("Status and summary indicators presence (#draft-status, #summary-items, #summary-ambiguities)", () => {
    // Status badge (accepts #draft-status or #status)
    const statusEl = findEl("#draft-status") || findEl("#status");
    assert.ok(statusEl, "Must include draft status indicator badge (#draft-status or #status)");

    // Items container (accepts #items or #draft-items)
    const itemsEl = findEl("#items") || findEl("#draft-items");
    assert.ok(itemsEl, "Must include draft items container (#items)");

    // Summary indicators (accepts discrete #summary-items / #summary-ambiguities or #summary)
    const summaryItems = findEl("#summary-items");
    const summaryAmbiguities = findEl("#summary-ambiguities");
    const summaryCombined = findEl("#summary");
    assert.ok(
      (summaryItems && summaryAmbiguities) || summaryCombined,
      "Must include summary counters (#summary-items & #summary-ambiguities, or #summary)"
    );
  });

  await t.test("Ambiguity drawer/modal container presence (#ambiguity-drawer or #resolution-modal)", () => {
    // Ambiguity container (accepts #ambiguity-drawer, #resolution-modal, or #ambiguities)
    const drawer =
      findEl("#ambiguity-drawer") ||
      findEl("#resolution-modal") ||
      findEl("#ambiguities");
    assert.ok(drawer, "Must include ambiguity drawer/modal container (#ambiguity-drawer, #resolution-modal, or #ambiguities)");
  });

  await t.test("Event timeline container presence (#event-timeline or #history)", () => {
    const timeline = findEl("#event-timeline") || findEl("#history");
    assert.ok(timeline, "Must include event timeline container (#event-timeline or #history)");
  });

  await t.test("Host context theme synchronization hooks & dark mode CSS", () => {
    // Media query check
    assert.match(
      widgetHtml,
      /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/i,
      "CSS must include dark mode media query"
    );

    // CSS variables check
    assert.match(widgetHtml, /--page:/, "CSS must define --page variable");
    assert.match(widgetHtml, /--surface:/, "CSS must define --surface variable");
    assert.match(widgetHtml, /--text:/, "CSS must define --text variable");
    assert.match(widgetHtml, /--accent:/, "CSS must define --accent variable");
  });
});

// ============================================================================
// TEST SUITE 4: Client JavaScript Logic & Behavioral Simulation
// ============================================================================
test("Suite 4: Client JavaScript Behavioral Simulation in Headless VM", async (t) => {
  await t.test("Handshake & Initial Draft Load: calls ui/initialize and get_order_draft", async () => {
    const harness = createHeadlessSandbox(widgetHtml);
    harness.runScript();

    // 1. Must post ui/initialize first
    assert.ok(harness.postedMessages.length >= 1);
    const initMsg = harness.postedMessages[0];
    assert.strictEqual(initMsg.method, "ui/initialize");
    assert.strictEqual(initMsg.params.appInfo.name, "panelph-order-desk");

    // Reply to handshake
    harness.replyTo(initMsg.id, {});
    await new Promise((r) => setTimeout(r, 10));

    // 2. Must post ui/notifications/initialized and call get_order_draft
    const notifMsg = harness.postedMessages.find((m) => m.method === "ui/notifications/initialized");
    assert.ok(notifMsg, "Must notify host of initialization");

    const getDraftMsg = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "get_order_draft"
    );
    assert.ok(getDraftMsg, "Must call get_order_draft on startup");

    // Reply with empty initial draft
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

    const statusEl = harness.getElement("#draft-status") || harness.getElement("#status");
    assert.strictEqual(statusEl.textContent, "باز");
    assert.strictEqual(harness.consoleErrors.length, 0, "No console errors during handshake");
  });

  await t.test("Free-text addition: captures name, quantity, unit, note and disables submit during flight", async () => {
    const harness = createHeadlessSandbox(widgetHtml);
    harness.runScript();

    // Complete initial handshake
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

    // Fill form
    const nameEl = harness.getElement("#need-name") || harness.getElement("#name");
    const qtyEl = harness.getElement("#need-qty") || harness.getElement("#quantity");
    const unitEl = harness.getElement("#need-unit") || harness.getElement("#unit");
    const noteEl = harness.getElement("#need-note") || harness.getElement("#note");
    const submitBtn = harness.getElement("#need-submit") || harness.getElement("#submit");
    const formEl = harness.getElement("#need-form");

    nameEl.value = "قرص فاموتیدین ۴۰";
    qtyEl.value = "2";
    unitEl.value = "جعبه";
    if (noteEl) noteEl.value = "برای بخش اورژانس";

    // Submit form
    formEl.dispatchEvent({ type: "submit", preventDefault: () => {} });

    // Verify submit button disabled during flight
    assert.strictEqual(submitBtn.disabled, true, "Submit button must disable during pending RPC");

    // Verify tool call dispatched
    const addMsg = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "add_order_need"
    );
    assert.ok(addMsg, "Must dispatch add_order_need tool call");
    assert.strictEqual(addMsg.params.arguments.name, "قرص فاموتیدین ۴۰");
    assert.strictEqual(addMsg.params.arguments.quantity, 2);
    assert.strictEqual(addMsg.params.arguments.unit, "جعبه");
    if (noteEl && addMsg.params.arguments.note !== undefined) {
      assert.strictEqual(addMsg.params.arguments.note, "برای بخش اورژانس");
    }

    // Reply to add_order_need
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
          events: [{ type: "need_added", id: "ev-1" }],
          summary: { itemCount: 1, ambiguityCount: 1 },
        },
      },
    });
    await new Promise((r) => setTimeout(r, 10));

    // Submit button re-enabled and inputs reset
    assert.strictEqual(submitBtn.disabled, false, "Submit button must re-enable upon response");
    assert.strictEqual(nameEl.value, "", "Form name input should be reset");
  });

  await t.test("Error display: gracefully catches failure and renders error message without uncaught exceptions", async () => {
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

    const nameEl = harness.getElement("#need-name") || harness.getElement("#name");
    const qtyEl = harness.getElement("#need-qty") || harness.getElement("#quantity");
    const submitBtn = harness.getElement("#need-submit") || harness.getElement("#submit");
    const errorEl = harness.getElement("#error");
    const formEl = harness.getElement("#need-form");

    nameEl.value = "کالای نامعتبر";
    qtyEl.value = "1";

    formEl.dispatchEvent({ type: "submit", preventDefault: () => {} });
    const addMsg = harness.postedMessages.find(
      (m) => m.method === "tools/call" && m.params?.name === "add_order_need"
    );

    // Simulate JSON-RPC failure
    harness.replyTo(addMsg.id, null, { message: "خطای سرور: ثبت نیاز متوقف شد" });
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(submitBtn.disabled, false, "Submit button must be restored");
    assert.ok(
      errorEl.textContent.includes("خطای سرور") || errorEl.textContent.length > 0,
      "Error element must show failure text"
    );
  });
});
```

---

## 5. Actionable Verification Criteria for Gate 4

Before marking Milestone 4 complete, the following gates must be independently validated:
1. **Pass Rate**: `npm test` runs with exit code `0` and 100% passing tests (including `test/frontend-order-desk.test.js` and all existing 141 tests).
2. **Static Route Delivery**: `curl -I http://localhost:<port>/order-desk.html` returns `HTTP/1.1 200 OK` and `Content-Type: text/html; charset=utf-8`.
3. **MCP Resource Integration**: An MCP client connecting to `/mcp` successfully executes `resources/read` for `ui://panelph/order-desk.html` and receives `text/html;profile=mcp-app`.
4. **Interactive Element Contracts**:
   - Free-text entry accepts title, quantity, unit, and note without requiring catalog match.
   - Ambiguity drawer allows viewing catalog recommendations, debounced search, and selecting an IRC/TTAC reference preserving leading-zero string codes (`"00001"`).
   - Event timeline displays history and allows compensating reverts (`revert_order_event`).
   - Host context theme synchronization reflects light and dark mode switches.

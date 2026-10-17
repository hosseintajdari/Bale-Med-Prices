# Handoff Report: Milestone 4 (Pharmacist Frontend in `public/order-desk.html`)

**Agent**: `m4_explorer_2_gen7` (Frontend Architecture & Technical Analysis)  
**Parent Orchestrator**: `7625a001-7a29-4bf5-9e8c-d5feff17e404`  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m4_explorer_2_gen7`  
**Target File**: `/home/admin/PanelPH/public/order-desk.html`  
**Reference Code Draft**: `/home/admin/PanelPH/.agents/teamwork/m4_explorer_2_gen7/proposed_order-desk.html`  

---

## 1. Observation

Direct inspection of `/home/admin/PanelPH/public/order-desk.html` (152 lines), `/home/admin/PanelPH/src/server.js`, `/home/admin/PanelPH/src/draft-store.js`, and `/home/admin/PanelPH/docs/UI-DESIGN.md` revealed the following technical realities and gaps:

### 1.1 Current Implementation State
- **Single Static File**: `public/order-desk.html` is read at server startup (`const widgetHtml = readFileSync(join(rootDirectory, "public", "order-desk.html"), "utf8");`) in `src/server.js:18`, registered as an MCP App resource (`ui://panelph/order-desk.html`) at line 304, and served via HTTP `GET /order-desk.html` at line 553.
- **Minimal Handshake**: It implements the JSON-RPC 2.0 handshake (`ui/initialize`, `ui/notifications/initialized`) via `window.parent.postMessage`.
- **Rudimentary Capture**: It has a 1-row form with inputs `#name`, `#quantity`, `#unit`, and `#submit`.

### 1.2 Concrete Feature Gaps
1. **Ambiguity Resolution Drawer / Modal (0% Implemented)**:
   - There is no `<dialog>`, `<aside>`, or sliding drawer in `public/order-desk.html`.
   - Items with status `needs_completion` cannot be clicked or resolved through the interface.
   - The backend exposes `resolve_order_need` (and `POST /api/draft/needs/:id/resolve`), but the UI has zero elements to invoke it or view catalog proposals.
2. **Missing Note Field in Free-Text Entry**:
   - `docs/UI-DESIGN.md § چیدمان پیشنهادی` explicitly specifies an optional note field (`[ یادداشت اختیاری ]`).
   - The backend `addNeed({ name, quantity, unit, note })` supports notes, but the form in `order-desk.html:68-73` omits the `#note` input entirely.
3. **Static, Non-Interactive Item Cards & Duplicate Ambiguities Column**:
   - `order-desk.html:119-127` renders item cards with only title and quantity.
   - Item cards have no click handler or interactive focus states.
   - If an item is resolved (`resolvedReference`), it renders only the title string without generic code, brand code, dosage form, or strength.
   - The `#ambiguities` column (`order-desk.html:133`) simply calls the exact same `itemCard` function, lacking the specific ambiguity description and actionable `[تعیین کالا / رفع ابهام]` button required by `docs/UI-DESIGN.md`.
4. **Non-Functional Event Timeline & Absent Compensating Reverts**:
   - `order-desk.html:134` renders events as plain text: `row.textContent = event.type`.
   - There are no timestamps, human-readable descriptions, before/after values, or revert buttons.
   - `revert_order_event` (and `POST /api/draft/revert`) is never called by the frontend.
5. **Inflexible Theme Synchronization**:
   - Currently, `order-desk.html:17-25` uses only `@media (prefers-color-scheme: dark)`.
   - It ignores `hostContext.theme` returned during `ui/initialize` and does not handle `ui/notifications/host-context-changed` pushed by ChatGPT when the host theme switches without an OS theme change.
6. **Broken Standalone Browser Execution**:
   - If a pharmacist opens `http://localhost:8787/order-desk.html` directly in a browser, `window.parent === window`. The script attempts `window.parent.postMessage` to itself, gets no reply, and hangs on `await request("ui/initialize")` with the error `"اتصال پنل برقرار نشد."`.
   - It fails to leverage the existing REST endpoints (`/api/draft`, `/api/draft/needs`, `/api/draft/needs/:id/resolve`, `/api/draft/revert`, `/api/catalog/search`).

---

## 2. Logic Chain

From the observations above, the following architectural decisions and component designs are synthesized:

```
┌────────────────────────────────────────────────────────────────────────┐
│ HOST ENVIRONMENT DETECTION                                             │
│ window.parent !== window ? Try MCP Handshake (1.2s timeout) : REST    │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   ▼                                 ▼
         [ MCP postMessage Mode ]            [ REST Fetch Mode ]
         callTool("get_order_draft")         fetch("/api/draft")
                   │                                 │
                   └────────────────┬────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ CLIENT-SIDE APPLICATION STATE                                         │
│ state = { draft, selectedItemId, selectedCandidate, theme, mode }      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ UI PRESENTATION LAYER (`public/order-desk.html`)                       │
│ 1. Header: Status badge, summary stats, theme toggle (🌓)              │
│ 2. Rapid Capture Form: 2-row grid (Name, Qty, Unit, Submit + Note)    │
│ 3. 2-Column Operational Grid:                                         │
│    - Right: Draft items overview (interactive cards)                   │
│    - Left: Ambiguity cards with [تعیین کالا و رفع ابهام] button         │
│ 4. Guidance Banner: Suggested dynamic action by draft status           │
│ 5. Event Timeline: Audit log with compensating [↩ بازگردانی] buttons   │
│ 6. Ambiguity Resolution Drawer:                                        │
│    - Section A: Need properties editor (name, qty, unit, note)         │
│    - Section B: Live debounced catalog search & candidate radio cards  │
│    - Section C: Confirmation gate (disabled until candidate chosen)    │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Dual-Transport Controller Architecture
To ensure `order-desk.html` works flawlessly both embedded in ChatGPT Apps SDK and standalone in modern browsers:
- **Detection**: On load, check `window.parent && window.parent !== window`.
- **MCP Branch**: Attempt `request("ui/initialize", ...)` raced against a 1200ms timeout. If successful, set `state.mode = "mcp"`, send `ui/notifications/initialized`, and read `hostContext.theme`.
- **REST Fallback**: If standalone or timeout occurs, set `state.mode = "rest"` and interact with `/api/*` endpoints via `fetch()`.
- **Unified `callApi(action, args)`**:
  - `get_order_draft` -> `GET /api/draft`
  - `add_order_need` -> `POST /api/draft/needs`
  - `update_order_need` -> `PATCH /api/draft/needs/:id`
  - `resolve_order_need` -> `POST /api/draft/needs/:id/resolve`
  - `revert_order_event` -> `POST /api/draft/revert`
  - `search_catalog` -> `GET /api/catalog/search?q=...`

### 2.2 Ambiguity Resolution Drawer Architecture
- **DOM Structure**: A backdrop overlay (`#drawer-backdrop`) plus a slide-over drawer panel (`#ambiguity-drawer`) positioned with RTL awareness (`inset-inline-start: 0`, `transform: translateX(-100%)` -> `transform: translateX(0)`).
- **Behavior & Guardrails**:
  1. Triggered by clicking any item card in `#items` or clicking `[تعیین کالا و رفع ابهام]` in `#ambiguities`.
  2. Automatically prefills the search input with `item.freeTextName` and debounces queries (400ms) to `search_catalog`.
  3. Displays candidate medicine proposals with title, genericCode (preserving leading zeros, e.g. `"00001"`), brandCode, dosageForm, strength, and formatted price.
  4. **Strict Safety Gate**: `#btn-confirm-resolve` is strictly `disabled` by default. It becomes enabled only when the user explicitly clicks a candidate card.
  5. Upon confirmation, calls `resolve_order_need`, closes the drawer, transitions item status to `ready_for_review`, updates draft status, and emits a toast confirmation (`«کالای دقیق در پیش‌نویس تأیید شد.»`).
  6. "فعلاً فقط نیاز آزاد بماند" button closes the drawer without binding, respecting ADR-001.

### 2.3 Event Timeline & Compensating Revert Mechanism
- **Audit Preservation**: Rather than deleting events, `src/draft-store.js` appends an `event_reverted` compensating record.
- **Active vs Cancelled Detection**: The client evaluates `getActiveRevertedTargetIds(events)`:
  - If an event is already targeted by an active revert, its revert button is replaced with a disabled badge: `<span class="badge badge-reverted">بازگردانده شده</span>`.
  - For active action events (`need_added`, `need_updated`, `need_resolved`), an actionable button `<button class="btn-revert">↩ بازگردانی</button>` is rendered.
  - Clicking invokes `revert_order_event({ eventId })` (or `POST /api/draft/revert`), seamlessly appending the compensating event and updating the UI state.

### 2.4 Seamless Theme Synchronization
Theme management operates across three priority tiers:
1. **Host Context Handshake & Notification**:
   - On `ui/initialize`: read `initResponse?.hostContext?.theme`.
   - On `window.addEventListener("message")`: handle `method === "ui/notifications/host-context-changed"`.
   - Set `document.documentElement.setAttribute("data-theme", theme)` and `document.documentElement.style.colorScheme = theme`.
2. **System OS Preference**:
   - In CSS, `@media (prefers-color-scheme: dark)` applies to `:root:not([data-theme="light"])`.
3. **Manual User Toggle**:
   - Header button (`#theme-toggle`) allows cycling between auto -> dark -> light -> auto.

---

## 3. Caveats

1. **Strict Content Security Policy (CSP)**:
   - ChatGPT Apps SDK widgets run in a sandboxed iframe with strict CSP (`default-src 'self'`).
   - **Zero External CDNs**: No Google Fonts, FontAwesome, Tailwind CDN, or external JavaScript libraries may be imported.
   - All styling must be written in pure vanilla CSS; all icons must be Unicode (`✕`, `✓`, `↩`, `🌓`, `✨`) or inline SVG.
2. **Responsive Screen Limits**:
   - The ChatGPT sidebar display mode is narrow (~320px–450px wide).
   - In CSS, use `@media (max-width: 700px)` to collapse the 2-column grid into 1 column, reflow the 4-element form into 2x2, and size the drawer to `width: min(540px, 100vw)`.
3. **Leading Zero Preservation**:
   - Generic codes (`00001`, `08234`) and brand codes must remain strings. JavaScript must never cast them via `Number()` or `parseInt()`.
4. **Accessibility (WCAG 2.1 AA & RTL)**:
   - Root document must declare `<html lang="fa" dir="rtl">`.
   - Use ARIA roles (`role="dialog"`, `aria-modal="true"`, `role="alert"`, `aria-label`).
   - Drawer must close on `Escape` key; candidates must be keyboard-navigable (`Enter` / `Space`).

---

## 4. Conclusion & Implementation Blueprint for M4 Worker

A complete, production-ready implementation of `public/order-desk.html` has been designed, validated for JS syntax, and saved at:
`/home/admin/PanelPH/.agents/teamwork/m4_explorer_2_gen7/proposed_order-desk.html`

### Step-by-Step Instructions for M4 Worker:
1. **Backup Existing File**:
   ```bash
   cp /home/admin/PanelPH/public/order-desk.html /home/admin/PanelPH/public/order-desk.html.bak
   ```
2. **Deploy Proposed File**:
   Copy `/home/admin/PanelPH/.agents/teamwork/m4_explorer_2_gen7/proposed_order-desk.html` over `/home/admin/PanelPH/public/order-desk.html`.
3. **Verify Existing Tests**:
   Execute `npm test`. All 141 existing unit, REST, and E2E tests must remain 100% green.
4. **Add Dedicated M4 Frontend Tests**:
   Create or expand `test/order-desk-ui.test.js` or E2E tests verifying:
   - Free-text capture form includes `#note` and `#need-form`.
   - HTML contains `#ambiguity-drawer`, `#btn-confirm-resolve`, and `#catalog-search`.
   - Event timeline contains revert controls calling `revert_order_event`.
   - Theme variables for light, dark, and host context switching.

---

## 5. Verification Method

To verify the proposed implementation independently:

1. **Syntax & Structure Verification**:
   ```bash
   node -e '
   const fs = require("fs");
   const html = fs.readFileSync("/home/admin/PanelPH/.agents/teamwork/m4_explorer_2_gen7/proposed_order-desk.html", "utf8");
   const vm = require("vm");
   const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
   new vm.Script(scriptMatch[1]);
   console.log("Syntax check passed!");
   '
   ```
2. **Contract Assertions**:
   ```bash
   node -e '
   const fs = require("fs");
   const html = fs.readFileSync("/home/admin/PanelPH/.agents/teamwork/m4_explorer_2_gen7/proposed_order-desk.html", "utf8");
   const assert = require("assert");
   assert.match(html, /<html[^>]*dir="rtl"/i);
   assert.match(html, /<html[^>]*lang="fa"/i);
   assert.match(html, /prefers-color-scheme:\s*dark/i);
   assert.match(html, /id="need-form"/);
   assert.match(html, /id="items"/);
   assert.match(html, /id="ambiguities"/);
   assert.match(html, /id="note"/);
   assert.match(html, /id="ambiguity-drawer"/);
   assert.match(html, /id="btn-confirm-resolve"/);
   assert.match(html, /revert_order_event/);
   console.log("All contract checks passed!");
   '
   ```
3. **Regression Test Run**:
   ```bash
   npm test
   ```
   Exit code must be 0 with 141+ passing tests.

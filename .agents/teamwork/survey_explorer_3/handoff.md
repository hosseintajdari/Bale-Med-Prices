# Handoff Report: Frontend & UI Spec Survey

**Agent**: `survey_explorer_3` (Frontend & UI Spec Explorer)  
**Date**: 2026-10-14  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/survey_explorer_3`  
**Target Repository**: `/home/admin/PanelPH`  
**Handoff Type**: Hard (Investigation & Survey Complete)  

---

## 1. Observation

Directly observed facts and verified states from tools during this investigation:

1. **Existing Frontend File**:
   - Location: `/home/admin/PanelPH/public/order-desk.html`
   - Total lines: 152 lines, size: 10,330 bytes.
   - Architecture: Self-contained single-file HTML, CSS, and Vanilla JavaScript (ES Module). No bundler (Webpack/Vite/Rollup) or external CSS framework is used.
   - Server serving path: `/home/admin/PanelPH/src/server.js:16` reads `public/order-desk.html` via `readFileSync` and registers it under `WIDGET_URI = "ui://panelph/order-desk.html"` at line 19 and 35.

2. **Backend Tools Already Implemented in `src/server.js`**:
   - Lines 47-57: `get_order_draft` (input: `{}`)
   - Lines 59-74: `add_order_need` (input: `{ name: z.string().min(1), quantity: z.number().positive(), unit: z.string().optional(), note: z.string().optional() }`)
   - Lines 76-92: `update_order_need` (input: `{ id: z.string().min(1), name?: string, quantity?: number, unit?: string, note?: string }`)
   - Lines 94-113: `resolve_order_need` (input: `{ id: z.string().min(1), reference: z.object({ title: z.string().min(1), genericCode: z.string().optional(), brandCode: z.string().optional(), dosageForm: z.string().optional(), strength: z.string().optional() }) }`)
   - Lines 115-125: `revert_order_event` (input: `{ eventId: z.string().min(1) }`)
   - Lines 127-141: `render_order_desk` (registers UI resource `ui://panelph/order-desk.html` with `"openai/ui": { entrypoints: [{ type: "global" }] }`)

3. **Front-End Protocol Communication in `public/order-desk.html`**:
   - Lines 95-100:
     ```javascript
     const notify = (method, params) => window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
     const request = (method, params) => new Promise((resolve, reject) => {
       const id = ++rpcId;
       pending.set(id, { resolve, reject });
       window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
     });
     ```
   - Lines 137-141:
     ```javascript
     async function initialize() {
       await request("ui/initialize", { appInfo: { name: "panelph-order-desk", version: "0.1.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" });
       notify("ui/notifications/initialized", {});
       await callTool("get_order_draft");
     }
     ```
   - Lines 104-113: Only handles `message.id` responses and `message.method === "ui/notifications/tool-result"`. Does not handle `ui/notifications/host-context-changed`.

4. **UI Design Specification in `docs/UI-DESIGN.md`**:
   - Visual contract: Lines 9-11 state: Host system fonts, system colors, light/dark co-existence, low contrast surfaces, subtle dividers, compact spacing, host border radii. No gradients, custom fonts, repeated logos, or stark white cards in dark mode.
   - Layout: Lines 13-33 specify a 4-part desk: Header summary (`پیش‌نویس باز ۶ ردیف ۲ ابهام`), Rapid Capture (`ثبت سریع نیاز`), 2-column split (Draft Items vs Ambiguities), Event History, and Suggested Action banner (`اقدام پیشنهادی: تکمیل دو مورد مبهم پیش از بازبینی نهایی`).
   - Resolution rule: Line 41 states: `دکمه «تأیید این کالا» تنها پس از مشاهده پیشنهاد فعال است.` (Confirm button is enabled ONLY after viewing/selecting a proposed product).

5. **Test Suite Verification**:
   - Command: `node --test` executed in `/home/admin/PanelPH`.
   - Result: Exit code 0, 4 tests passed in 1171 ms:
     - `stores a free-text need and preserves it after reopening` (65.8ms)
     - `resolves a need only when the user supplies a concrete reference` (15.8ms)
     - `revert records a new event instead of erasing history` (19.2ms)
     - `serves MCP initialization through the local endpoint` (800.5ms)

6. **Current UI Implementation Gaps**:
   - `public/order-desk.html` lines 68-73: Form lacks the `#note` input field defined in `docs/UI-DESIGN.md` line 21 and `server.js` line 69.
   - `public/order-desk.html` lines 119-127 (`itemCard`): Item cards have no click event listener.
   - `public/order-desk.html` lines 78 and 133: Ambiguities column simply renders the identical `itemCard` with no specific hint on what is missing and no `[باز کردن ردیف]` button.
   - Ambiguity Drawer/Modal: 0% implemented in `public/order-desk.html`.
   - Tool calls in UI: Lines 140 and 144 only call `get_order_draft` and `add_order_need`. `update_order_need`, `resolve_order_need`, and `revert_order_event` are never called by the frontend.
   - Event list rendering: Line 134 only renders `row.textContent = event.type`. No timestamp, no formatted description, no Revert button.
   - Theme handling: Lines 17-25 only use `@media (prefers-color-scheme: dark)`. No dynamic sync from `hostContext.theme` or `ui/notifications/host-context-changed`.

---

## 2. Logic Chain

1. **Premise**: Per `ORIGINAL_REQUEST.md` (R3), PanelPH requires a modern pharmacist frontend supporting:
   - Rapid free-text item capture.
   - Interactive ambiguity resolution drawer/modal.
   - Live draft overview with clear status indicators (`open`, `needs_completion`, `ready_for_review`).
   - Seamless dark/light theme integration matching host design principles.
2. **Analysis of Current Assets (referencing Observation 1, 2, 3)**:
   - The repository hosts a working MCP App server that serves `public/order-desk.html` as an ext-apps UI resource.
   - The backend (`src/server.js`, `src/draft-store.js`) already provides all core operational methods: adding needs, updating needs, resolving references, reverting events, and querying drafts.
3. **Identification of UI Deficiencies (referencing Observation 4, 6)**:
   - While the backend capabilities exist, the frontend `order-desk.html` is merely an early skeleton.
   - The user currently cannot resolve any ambiguity because there is no drawer or modal, no candidate selection UI, and no button triggering `resolve_order_need`.
   - The user cannot revert mistakes from the UI because the event history does not render a revert action triggering `revert_order_event`.
   - Rapid item capture is incomplete because the `note` field is missing from the form.
   - Theme sync is fragile because it depends entirely on the browser's OS-level media query and ignores dynamic in-app theme toggles sent via MCP Apps protocol notifications.
4. **Resolution Path**:
   - Enhancing `public/order-desk.html` by adding:
     1. Form field for `note` and auto-focus retention.
     2. Clickable item cards opening an Ambiguity Resolution Drawer/Modal.
     3. Proposal selection list with the guardrail that "تأیید این کالا" remains disabled until a proposal is chosen.
     4. Interactive Revert buttons in the event history list.
     5. Protocol listener for `ui/notifications/host-context-changed` updating `data-theme`.
     6. Dynamic suggested action banner reflecting draft state.

---

## 3. Caveats

1. **Read-Only Scope**: In accordance with the Explorer role and system instructions, no modifications to source code (`public/order-desk.html`, `src/server.js`, `src/draft-store.js`) were made during this task. All findings and implementation blueprints are documented in `frontend_survey_report.md`.
2. **Catalog Resolution Data Source**: The backend currently verifies `resolve_order_need` when provided a concrete reference, but a dedicated search endpoint (e.g. `search_medicine_catalog`) connecting to Qanoon/sample catalog fixtures is not yet registered on `src/server.js`. The frontend ambiguity drawer will need candidate proposals either passed from a catalog search tool or mock fixtures.
3. **Live Host Verification**: Local unit and integration tests pass via `node --test`, but full live iframe rendering inside a real ChatGPT Plus/Team desktop or web client requires an active public HTTPS tunnel or OpenAI Apps developer configuration.

---

## 4. Conclusion

The pharmacy operational frontend architecture for PanelPH is well-grounded in `public/order-desk.html` and `@modelcontextprotocol/ext-apps`, with a passing backend test suite. However, `order-desk.html` is currently missing the critical interactive components required by `ORIGINAL_REQUEST.md` and `docs/UI-DESIGN.md`:
1. The Ambiguity Resolution Drawer / Modal (including proposal inspection and confirmed binding).
2. UI controls for `update_order_need` and `revert_order_event`.
3. Note field in rapid capture.
4. Dynamic host theme synchronization via `ui/notifications/host-context-changed`.
5. Dynamic suggested action banner.

The detailed gap analysis, component tree, interaction wireframes, state transition tables, and implementation blueprints are fully documented in `/home/admin/PanelPH/.agents/teamwork/survey_explorer_3/frontend_survey_report.md`.

---

## 5. Verification Method

To independently verify the observations and findings:

1. **Verify Backend Tests & Server Health**:
   ```bash
   cd /home/admin/PanelPH && node --test
   ```
   *Expected Output*: 4 passing tests, exit code 0.

2. **Inspect Existing Frontend Implementation**:
   ```bash
   cat /home/admin/PanelPH/public/order-desk.html
   ```
   *Verify*:
   - Form fields on lines 68-73 (`#name`, `#quantity`, `#unit`, missing `#note`).
   - Absence of drawer / modal elements in DOM.
   - Message listener on line 104 lacks `ui/notifications/host-context-changed`.

3. **Inspect Server Tools & Resource Registration**:
   ```bash
   cat /home/admin/PanelPH/src/server.js
   ```
   *Verify*: Lines 47-141 contain `get_order_draft`, `add_order_need`, `update_order_need`, `resolve_order_need`, `revert_order_event`, and `render_order_desk`.

4. **Inspect Core UI Specification**:
   ```bash
   cat /home/admin/PanelPH/docs/UI-DESIGN.md
   ```
   *Verify*: Visual contract, layout schema, rapid capture flow, row details, state definitions, and suggested Persian copy.

5. **Invalidation Conditions**:
   - If `order-desk.html` is rewritten with a build toolchain (e.g. Vite) creating multi-file assets that break single-resource serving via `ui://panelph/order-desk.html`.
   - If `src/server.js` removes or changes tool input schemas for `add_order_need`, `update_order_need`, or `resolve_order_need`.

# Frontend & UI Specification Survey Report: PanelPH Order Desk

**Agent**: `survey_explorer_3` (Frontend & UI Spec Explorer)  
**Date**: 2026-10-14  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/survey_explorer_3`  
**Repository Target**: `/home/admin/PanelPH`  
**Authoritative References**:
- Request: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`
- Core UI Spec: `/home/admin/PanelPH/docs/UI-DESIGN.md`
- Architectural Records: `/home/admin/PanelPH/docs/adr/ADR-001-private-chatgpt-mcp-workspace.md`, `ADR-002-qanoon-authorized-source-access.md`
- Reference Data: `/home/admin/PanelPH/docs/REFERENCE-DATA.md`
- Existing Frontend: `/home/admin/PanelPH/public/order-desk.html`
- Server & Store: `/home/admin/PanelPH/src/server.js`, `/home/admin/PanelPH/src/draft-store.js`
- MCP Apps Extension SDK: `@modelcontextprotocol/ext-apps` (v1.0.1)

---

## 1. Executive Summary

This survey analyzes the frontend specifications, user interface architecture, Apps SDK widget constraints, interaction flows, theme handling, and API/MCP integration points for **PanelPH** (میز سفارش).

### Key Takeaways
1. **Existing Frontend Baseline**: Currently, only one frontend file exists: `/home/admin/PanelPH/public/order-desk.html` (152 lines). It is a standalone, single-file HTML/CSS/vanilla JS implementation registered as an MCP App UI resource (`ui://panelph/order-desk.html`) and served inline inside ChatGPT/Claude hosts.
2. **Current Implementation Status**: The current `order-desk.html` is an initial minimal prototype ("v0"). It successfully implements JSON-RPC 2.0 postMessage handshake (`ui/initialize`, `ui/notifications/initialized`), draft fetching (`get_order_draft`), and simple need submission (`add_order_need`).
3. **Identified Feature & Spec Gaps**:
   - **Ambiguity Drawer/Modal**: Completely absent in current UI. Unresolved items cannot be clicked or resolved through the interface.
   - **Interactive Resolution**: `resolve_order_need` is exposed in `src/server.js`, but `order-desk.html` has no UI elements, search proposals, or confirmation buttons to trigger it.
   - **Audit Reverting & Row Editing**: `revert_order_event` and `update_order_need` are implemented in the backend but unreachable from the UI.
   - **Note Field in Capture**: Form contains `name`, `quantity`, and `unit`, but omits the `note` input specified in `docs/UI-DESIGN.md`.
   - **Suggested Action Banner**: The dynamic footer action prompt ("اقدام پیشنهادی") from `docs/UI-DESIGN.md` is not rendered.
   - **Dynamic Host Theme Synchronization**: The current UI relies strictly on CSS media query `@media (prefers-color-scheme: dark)`. It ignores `ui/notifications/host-context-changed` notifications, causing desynchronization if the ChatGPT web/desktop app switches themes internally.

---

## 2. Inventory of Existing Frontend Files & Assets

| File Path | Size / Lines | Role & Architecture | Current Status |
| :--- | :--- | :--- | :--- |
| `/home/admin/PanelPH/public/order-desk.html` | 10,330 bytes / 152 lines | Primary MCP App HTML widget. Zero-build vanilla HTML, CSS, and JS. Communicates with parent iframe via `window.parent.postMessage`. | Functional minimal prototype. Missing ambiguity drawer, resolution flow, item edit/delete, event revert, and note input. |
| `/home/admin/PanelPH/src/server.js` | 195 lines | Node.js MCP server using `@modelcontextprotocol/sdk` and `@modelcontextprotocol/ext-apps/server`. Reads `order-desk.html` via `readFileSync` and registers it under `ui://panelph/order-desk.html`. | Tools registered: `get_order_draft`, `add_order_need`, `update_order_need`, `resolve_order_need`, `revert_order_event`, `render_order_desk`. |
| `/home/admin/PanelPH/src/draft-store.js` | 181 lines | In-memory + JSON-persisted event-sourced draft store (`state/order-draft.json`). | Implements state derivation (`open`, `needs_completion`, `ready_for_review`), event recording (`need_added`, `need_updated`, `need_resolved`, `event_reverted`), and compensating reverts. |
| `/home/admin/PanelPH/fixtures/catalog.sample.json` | 19 lines | Sample reference medicines (`genericCode`, `brandCode`, `title`, `dosageForm`, `strength`, `referenceDate`). | Used in tests; basis for mock catalog resolution in UI. |

*No other static assets (images, icons, separate CSS or JS bundles) currently exist in `public/` or the repository.*

---

## 3. Detailed Analysis of UI Requirements (`docs/UI-DESIGN.md`)

### 3.1 Design Philosophy & Host Visual Contract
`docs/UI-DESIGN.md` explicitly defines PanelPH as an embedded tool rather than an independent web application:
- **No Independent Brand Identity**: PanelPH must feel natural inside ChatGPT's interface.
- **Typography**: System font stack (`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`) with Persian native script support (`dir="rtl"`, `lang="fa"`). Custom downloaded fonts and heavy font files are prohibited.
- **Low Contrast Surfaces**: Soft background layers (`--surface: #ffffff` light / `#171717` dark) rather than stark, glaring cards.
- **Subtle Dividers & Borders**: 1px subtle borders (`--border: #e5e5e5` light / `#303030` dark; `--divider: #eeeeee` light / `#2a2a2a` dark).
- **Compact Spacing**: Tight spacing suitable for high-density professional pharmacy workflows (12px grid gaps, 38px touch targets, 8px input padding).
- **Brand / Accent Color Discipline**: Accent color (`--accent: #3b82f6` light / `#4d8dff` dark) is strictly reserved for primary actions (`افزودن`, `تأیید این کالا`) and active focus rings.
- **Forbidden Elements**: Gradients, custom external fonts, repeated logos, stark white cards in dark mode, and superfluous decorative graphics are prohibited.
- **Target Display Modes**: ChatGPT sidebar or fullscreen. In-chat inline mode is reserved for compact summaries and brief action triggers.

### 3.2 Layout & Component Tree
The target specification defines a single-view, 4-tier operational desk:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [میز سفارش]                     [پیش‌نویس باز]   [۶ ردیف · ۲ ابهام]       │ (Header Bar)
├────────────────────────────────────────────────────────────────────────┤
│ ثبت سریع نیاز                                                          │ (Rapid Need Capture)
│ [ نام آزاد کالا                         ] [ تعداد ] [ واحد ] [افزودن]   │
│ [ یادداشت اختیاری                                             ]        │
├────────────────────────────────────┬───────────────────────────────────┤
│ ردیف‌های پیش‌نویس (Draft Items)      │ ابهام‌های نیازمند تکمیل (Ambiguities)│ (2-Column Grid)
│                                    │                                   │
│ • استامینوفن | ۲ بسته [نیازمند تکمیل]│ • استامینوفن: شکل و برند [باز کردن]│
│ • سرنگ ۵ سی سی | ۱۰ عدد [آماده ...]│ • ویتامین D: تعداد بسته  [باز کردن]│
│ • ویتامین D | ۳ بسته [نیازمند تکمیل] │                                   │
├────────────────────────────────────┴───────────────────────────────────┤
│ سابقهٔ تغییر (Event History & Audit)                                    │ (History Section)
│ • need_added: استامینوفن (۱۴:۲۲) [بازگردانی]                           │
├────────────────────────────────────────────────────────────────────────┤
│ اقدام پیشنهادی: تکمیل ۲ مورد مبهم پیش از بازبینی نهایی                 │ (Suggested Action)
└────────────────────────────────────────────────────────────────────────┘
```

#### Component Tree Hierarchy:
1. `<main class="desk-container">`
   - `<header class="desk-header">`
     - Title block: `<h1>میز سفارش</h1>`
     - Status badge: `<span class="badge {draft.status}">{statusText}</span>`
     - Summary count: `<div class="summary">{items.length} ردیف · {ambiguities.length} ابهام</div>`
   - `<section class="capture-section">`
     - Section title: `<h2>ثبت سریع نیاز</h2>`
     - Form `<form id="need-form">`:
       - Free-text input: `<input id="name" required placeholder="نام آزاد کالا">`
       - Quantity input: `<input id="quantity" required type="number" min="1" step="any" placeholder="تعداد">`
       - Unit input: `<input id="unit" placeholder="واحد اختیاری">`
       - Note input: `<input id="note" placeholder="یادداشت اختیاری">` *(to be added)*
       - Submit button: `<button type="submit">افزودن</button>`
     - Feedback / error paragraph: `<p id="error" class="error" role="alert">`
   - `<div class="grid desk-grid">`
     - `<section class="items-column">`
       - Section title: `<h2>ردیف‌های پیش‌نویس</h2>`
       - Items container: `<div id="items" class="items">` (Cards with click-to-inspect)
     - `<section class="ambiguities-column">`
       - Section title: `<h2>ابهام‌های نیازمند تکمیل</h2>`
       - Ambiguities container: `<div id="ambiguities" class="ambiguities">` (Cards with direct `[باز کردن ردیف]` button)
   - `<section class="history-section">`
     - Section title: `<h2>سابقهٔ تغییر</h2>`
     - Event list: `<div id="history" class="history">` (Includes timestamp, change summary, and Revert button)
   - `<footer class="action-footer">`
     - Dynamic hint text: `<div id="suggested-action" class="suggested-action">`
   - `<aside id="ambiguity-drawer" class="drawer hidden" role="dialog" aria-modal="true">` *(to be added)*
     - Header with title, close button (`×`)
     - Selected item editor (name, quantity, unit, note)
     - Catalog resolution proposal list (generic code, TTAC / IRC, dosage form, strength)
     - "تأیید این کالا" confirmation button
     - Item-specific audit events & revert action

---

## 4. Rapid Free-Text Item Capture Design

### 4.1 Pharmacy Workflow Reality & Core Design Invariant
In real pharmacy purchasing operations, inventory needs arise rapidly at the counter or in the dispensary. The pharmacist frequently knows only:
- Informal colloquial name: e.g. "استامینوفن" (Acetaminophen), "سرم رینگر", "سرنگ ۵ سی‌سی".
- Approximate quantity and unit: "۲ کارتن", "۱۰ ویال", "۵ بسته".
- Contextual note: "فوری برای بخش", "اگر داروپخش نداشت از زهراوی".

**Core Invariant (ADR-001 & PRD.md § رفتارهای ضروری)**:
> *ثبت اولیه هرگز کاربر را به انتخاب اجباری از کاتالوگ وابسته نمی‌کند.*  
> Initial registration MUST NEVER force catalog lookup or block on unselected IDs. Forced modal search during rapid capture destroys pharmacist efficiency and results in workers abandoning the software for paper pads.

### 4.2 Interaction Specifications
1. **Inputs & Validation**:
   - `name`: String, non-empty, trimmed (client required, server validated `z.string().min(1)`).
   - `quantity`: Number, finite, positive (client required, server validated `z.number().positive()`).
   - `unit`: String, optional (trimmed).
   - `note`: String, optional (trimmed).
2. **Submission Flow**:
   - Keyboard interaction: Pressing `Enter` in any field submits the form.
   - Immediate feedback: Disable submit button during in-flight RPC to prevent duplicate entries; show localized spinner or loading state.
   - RPC call: `callTool("add_order_need", { name, quantity, unit, note })`.
   - On success:
     - Item saved into `draft-store.json` with initial status `status: "needs_completion"`.
     - Toast / status message: `«به پیش‌نویس اضافه شد.»`
     - Form resets all inputs.
     - Focus automatically returns to `#name` input so the pharmacist can immediately type the next item without touching the mouse.
   - On error:
     - Error displayed in `#error` element (`role="alert"`), input values preserved.

---

## 5. Ambiguity Resolution Drawer / Modal Design

### 5.1 Purpose & Role in the Operational Lifecycle
Items in `needs_completion` status represent raw purchasing demands that lack the formal attributes required for a finalized distributor order batch (e.g. manufacturer, IRC/TTAC identity, exact dosage form, or pack size).

The Ambiguity Resolution Drawer / Modal serves as the bridge between **informal free-text demand** and **formal order batches** without cluttering the primary capture screen.

### 5.2 Triggering Mechanisms
The drawer is opened via two entry points:
1. Clicking anywhere on an item card in "ردیف‌های پیش‌نویس".
2. Clicking the explicit `[باز کردن ردیف]` button on any card in "ابهام‌های نیازمند تکمیل".

### 5.3 Detailed Component Architecture of the Drawer
```
┌────────────────────────────────────────────────────────┐
│ [×] جزئیات ردیف: استامینوفن             [نیازمند تکمیل]│
├────────────────────────────────────────────────────────┤
│ نام آزاد: [ استامینوفن                               ]│
│ تعداد:    [ ۲         ] واحد: [ بسته                 ]│
│ یادداشت:  [ از داروپخش باشد                          ]│
│ [ذخیره اصلاحات]                        [حذف از پیش‌نویس]│
├────────────────────────────────────────────────────────┤
│ پیشنهادهای تطبیق کاتالوگ مرجع:                         │
│                                                        │
│ 🔘 استامینوفن ۵۰۰ میلی‌گرم قرص (کد ژنریک: ۰۰۰۰۱)        │
│    شرکت: داروپخش | شکل: قرص | دوز: ۵۰۰ م‌گ            │
│    موجودی قانون: موجود (۵۰ بسته) | سقف سهمیه: ۱۰      │
│                                                        │
│ ○ شربت استامینوفن ۱۲۰ میلی‌گرم/۵ میلی‌لیتر (کد: ۰۰۰۰۲)    │
│    شرکت: خوارزمی | شکل: شربت | دوز: ۱۲۰ م‌گ/۵ م‌ل     │
│                                                        │
│ [ تأیید این کالا ]  (تنها پس از انتخاب یک پیشنهاد فعال) │
├────────────────────────────────────────────────────────┤
│ پیام راهنما:                                           │
│ برای سفارش دقیق، شکل یا بسته‌بندی این مورد را مشخص کنید. │
│ [فعلاً فقط نیاز آزاد بماند]                             │
└────────────────────────────────────────────────────────┘
```

### 5.4 Behavioral Guardrails & Rules
1. **Human-in-the-Loop Confirmation**:
   - Matching suggestions are strictly PROPOSALS. Under ADR-001 and ADR-002, automatic silent binding is prohibited.
   - Rule from `docs/UI-DESIGN.md`: *«دکمه "تأیید این کالا" تنها پس از مشاهده پیشنهاد فعال است.»*
   - The confirmation button (`#confirm-resolution`) must be initialized in a `disabled` state. It becomes enabled only when the user selects a candidate from the proposal list.
2. **Payload on Confirmation**:
   Calls `resolve_order_need` with:
   ```json
   {
     "id": "need-1-1718000000000",
     "reference": {
       "title": "استامینوفن ۵۰۰ میلی‌گرم",
       "genericCode": "00001",
       "brandCode": "00001",
       "dosageForm": "قرص",
       "strength": "۵۰۰ میلی‌گرم"
     }
   }
   ```
3. **Transition on Confirmation**:
   - Item status flips from `needs_completion` to `ready_for_review`.
   - The item immediately disappears from "ابهام‌های نیازمند تکمیل".
   - In "ردیف‌های پیش‌نویس", the item title updates with reference identity (`استامینوفن — قرص ۵۰۰ میلی‌گرم داروپخش`) and receives the green `آماده بازبینی` badge.
   - The drawer closes or displays a success toast: `«کالای دقیق در پیش‌نویس تأیید شد.»`
4. **Direct Field Correction**:
   - Pharmacists can edit free-text name, quantity, unit, or note directly in the drawer.
   - Submitting edits calls `update_order_need({ id, name, quantity, unit, note })`.
5. **Intentional Postponement**:
   - Pharmacists can choose "فعلاً فقط نیاز آزاد بماند" (Leave as free-text need for now).
   - Closes drawer without error. Guidance text: `«فعلاً فقط نیاز آزاد ذخیره شد؛ بعداً می‌توانید کالای دقیق را تعیین کنید.»`

---

## 6. Live Draft Status Indicators & Lifecycle State Transitions

### 6.1 Status Taxonomy & Semantics

| Level | Status Identifier | Persian Label | Visual Appearance | Semantic Definition |
| :--- | :--- | :--- | :--- | :--- |
| **Draft** | `open` | **باز** | Info badge (Light: `#edf4ff` bg, `#2456a6` text; Dark: `#172d4d` bg, `#accbff` text) | The draft is open and has zero items. Ready for entry. |
| **Draft** | `needs_completion` | **نیازمند تکمیل** | Warning badge (Light: `#fff6df` bg, `#8a5100` text; Dark: `#342b17` bg, `#f4c974` text) | Contains at least one item requiring catalog resolution, dosage clarification, or conflict check. |
| **Draft** | `ready_for_review` | **آماده بازبینی** | Success badge (Light: `#e9f8ef` bg, `#176b3a` text; Dark: `#153522` bg, `#a7e8bd` text) | All registered items (≥ 1) have been resolved or consciously confirmed. Ready for batch export. |
| **Item** | `needs_completion` | **نیازمند تکمیل** | Warning badge | Item was registered with free-text and lacks a confirmed catalog reference. |
| **Item** | `ready_for_review` | **آماده بازبینی** | Success badge | Pharmacist has selected and confirmed a catalog reference via `resolve_order_need`. |

### 6.2 Status Derivation Logic (`src/draft-store.js`)
```javascript
function deriveStatus(items) {
  if (items.length === 0) return "open";
  return items.every((item) => item.status === "ready_for_review")
    ? "ready_for_review"
    : "needs_completion";
}
```

### 6.3 State Transition Matrix

```
   [ Empty Draft ] (Status: open)
          │
          │ add_order_need (Item added with needs_completion)
          ▼
   [ Draft has ≥ 1 item with needs_completion ] (Status: needs_completion)
          │
          │ resolve_order_need (Confirmed reference for item)
          ├─────────────────────────────────────────────────┐
          │ (Some items still needs_completion)             │ (All items now ready_for_review)
          ▼                                                 ▼
   [ Status: needs_completion ]                     [ Status: ready_for_review ]
          ▲                                                 │
          │ revert_order_event (Reverts a resolved item)    │ create_order_batch
          └─────────────────────────────────────────────────┼──────────────────┐
                                                            ▼                  ▼
                                                   [ Batch Exported ]   [ Reverted ]
```

### 6.4 Dynamic Footer Actions by Status
`docs/UI-DESIGN.md` specifies dynamic guidance banners based on draft status:
- When `status === "open"`: `«پیش‌نویس خالی است؛ نیازهای دارویی را ثبت کنید.»`
- When `status === "needs_completion"`: `«اقدام پیشنهادی: تکمیل ${ambiguityCount} مورد مبهم پیش از بازبینی نهایی»`
- When `status === "ready_for_review"`: `«پیش‌نویس آماده بازبینی است؛ هنوز هیچ سفارشی ارسال نشده است.»`

---

## 7. Host Theme Handling & Apps SDK Standards

### 7.1 Multi-Layer Theme Synchronization Architecture
MCP Apps run inside an iframe hosted by ChatGPT (or Claude). Theme synchronization must handle three layers:

```
┌────────────────────────────────────────────────────────┐
│ ChatGPT Host Platform (Web / Desktop / Mobile)          │
│ - User switches theme in ChatGPT Settings (Light/Dark) │
└───────────┬────────────────────────────────────────────┘
            │
            ├─► 1. CSS Media Query: @media (prefers-color-scheme: dark)
            │      (Inherited from browser OS/window)
            │
            ├─► 2. Protocol Handshake: ui/initialize result
            │      (Returns hostContext.theme and hostContext.styles)
            │
            └─► 3. Live Protocol Notification: ui/notifications/host-context-changed
                   (Pushed when host theme toggles without page reload)
```

### 7.2 Current Implementation vs Required Enhancement
- **Current State in `order-desk.html`**:
  Uses only Layer 1 (`@media (prefers-color-scheme: dark)`). If the ChatGPT web client toggles between dark and light mode internally (modifying client DOM classes rather than triggering OS `prefers-color-scheme`), the widget stays stuck in the old theme.
- **Required Protocol Implementation**:
  1. During `ui/initialize`: Inspect `result.hostContext.theme`.
  2. In postMessage listener: Listen for `method === "ui/notifications/host-context-changed"`.
  3. Extract `params.theme` and set `document.documentElement.setAttribute("data-theme", theme)`.
  4. Define CSS variables using both `@media` and `[data-theme="dark"]` selectors:
     ```css
     :root, [data-theme="light"] {
       --page: #ffffff;
       --surface: #ffffff;
       --surface-hover: #f7f7f8;
       --border: #e5e5e5;
       --divider: #eeeeee;
       --text: #1f1f1f;
       --muted: #6b6b6b;
       --input: #ffffff;
       --accent: #3b82f6;
       --accent-text: #ffffff;
       --warning-bg: #fff6df;
       --warning-text: #8a5100;
       --success-bg: #e9f8ef;
       --success-text: #176b3a;
       --info-bg: #edf4ff;
       --info-text: #2456a6;
     }
     @media (prefers-color-scheme: dark) {
       :root {
         --page: #121212; --surface: #171717; --surface-hover: #212121;
         --border: #303030; --divider: #2a2a2a; --text: #ececec; --muted: #a0a0a0;
         --input: #212121; --accent: #4d8dff; --accent-text: #ffffff;
         --warning-bg: #342b17; --warning-text: #f4c974;
         --success-bg: #153522; --success-text: #a7e8bd;
         --info-bg: #172d4d; --info-text: #accbff;
       }
     }
     [data-theme="dark"] {
       --page: #121212; --surface: #171717; --surface-hover: #212121;
       --border: #303030; --divider: #2a2a2a; --text: #ececec; --muted: #a0a0a0;
       --input: #212121; --accent: #4d8dff; --accent-text: #ffffff;
       --warning-bg: #342b17; --warning-text: #f4c974;
       --success-bg: #153522; --success-text: #a7e8bd;
       --info-bg: #172d4d; --info-text: #accbff;
     }
     ```
  5. If `hostContext.styles.variables` is provided by the host, map standard host variables (`--color-background-primary`, `--color-text-primary`, `--border-radius-md`) to ensure pixel-perfect harmony.

### 7.3 Apps SDK Right-To-Left (RTL) Guidelines
- Document root: `<html lang="fa" dir="rtl">`.
- Text alignment: Natural right-align for Persian labels, Persian numerals for quantities where appropriate, and LTR isolation for medicine codes, TTAC / IRC, and dosages (e.g. `<span dir="ltr">500 mg</span>`).
- Flow margins and padding: Use logical CSS properties (`padding-inline`, `margin-inline-start`, `border-inline-end`) to guarantee correct rendering across all platforms.

---

## 8. API & MCP Endpoints Interaction Specification

### 8.1 JSON-RPC 2.0 Message Exchange via PostMessage
The frontend communicates exclusively through `window.parent.postMessage`.

#### Initialization Handshake:
1. `ui/initialize` (View -> Host):
   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "ui/initialize",
     "params": {
       "appInfo": { "name": "panelph-order-desk", "version": "0.1.0" },
       "appCapabilities": {},
       "protocolVersion": "2026-01-26"
     }
   }
   ```
2. Host responds with `hostInfo`, `hostCapabilities`, and `hostContext`.
3. `ui/notifications/initialized` (View -> Host):
   ```json
   {
     "jsonrpc": "2.0",
     "method": "ui/notifications/initialized",
     "params": {}
   }
   ```

### 8.2 Tool Execution Mapping

| Action in UI | MCP Tool Name | Tool Input Schema | State Effect & Return Data |
| :--- | :--- | :--- | :--- |
| Initial desk load / refresh | `get_order_draft` | `{}` | Returns entire current draft with items, events, and summary counts. |
| Submit rapid capture form | `add_order_need` | `{ name: string, quantity: number, unit?: string, note?: string }` | Appends item with `status: "needs_completion"`, records `need_added` event, updates draft status. |
| Edit item in drawer | `update_order_need` | `{ id: string, name?: string, quantity?: number, unit?: string, note?: string }` | Updates item properties, records `need_updated` event. |
| Confirm catalog match | `resolve_order_need` | `{ id: string, reference: { title: string, genericCode?: string, brandCode?: string, dosageForm?: string, strength?: string } }` | Sets item status to `ready_for_review`, records `need_resolved` event, updates draft status. |
| Revert audit event | `revert_order_event` | `{ eventId: string }` | Appends compensating `event_reverted` event, restores item state. |
| Open desk in host sidebar | `render_order_desk` | `{}` | Returns UI resource HTML to host (`ui://panelph/order-desk.html`). |

### 8.3 Expected Future Endpoints (R1 & R2 Integration)
To support the full operational lifecycle per `ORIGINAL_REQUEST.md`:
1. `search_medicine_catalog({ query: string })`:
   - Searches reference medicines (fixtures or Qanoon catalog).
   - Returns candidate matches for generic code, TTAC / IRC, brand, dosage form, and strength.
   - Populates proposal options inside the ambiguity drawer.
2. `check_item_stock({ genericCode?: string, brandCode?: string, irc?: string })`:
   - Calls the Qanoon adapter boundary (`src/adapters/qanoon-adapter.js`).
   - Returns real-time stock check and price validation rules.
3. `create_order_batch({})`:
   - Performs final review of `ready_for_review` draft.
   - Highlights discrepancies, generates export-ready batch representation.

---

## 9. Comprehensive Gap Matrix: Current UI vs Final Requirements

| Requirement Feature | Current `order-desk.html` | Required Target Spec | Gap Severity | Action Needed |
| :--- | :--- | :--- | :--- | :--- |
| **Rapid Item Capture** | Captures name, quantity, unit. | Captures name, quantity, unit, note. Auto-focus return. | Medium | Add `#note` input; enhance focus management; add keyboard shortcut. |
| **Draft Items List** | Renders static list cards. No click handler. | Clickable cards to open detail/ambiguity drawer. | High | Add click listener to item cards; bind selected item to drawer. |
| **Ambiguity Column** | Duplicate rendering of item card. No action button. | Highlights exact missing attributes; explicit `[باز کردن ردیف]` button. | High | Render specific ambiguity hint and action button opening drawer. |
| **Ambiguity Drawer / Modal** | **None (0% implemented).** | Slide-out drawer or modal with catalog proposals and confirm button. | **Critical** | Build drawer component with candidate list and `resolve_order_need` call. |
| **Catalog Proposal Binding** | None. | Displays candidate proposals; "تأیید این کالا" enabled only after selection. | **Critical** | Add proposal UI; enforce enable-only-after-selection guardrail. |
| **Event History & Reverting** | Displays raw `event.type` strings. No revert button. | Shows human-readable Persian labels, timestamps, and active Revert button. | High | Format events with timestamps; add Revert button calling `revert_order_event`. |
| **Item Editing / Deletion** | None. | Allows updating fields or removing row via compensating revert. | High | Add edit fields in drawer calling `update_order_need`. |
| **Dynamic Host Theme Sync** | `@media (prefers-color-scheme)` only. | Handles `hostContext.theme` and `host-context-changed` notification. | Medium | Add event listener for host context change; toggle `data-theme` attribute. |
| **Suggested Action Banner** | None. | Dynamic guidance footer based on current draft status. | Low | Add dynamic banner below grid. |

---

## 10. Recommendations for Subsequent Implementation

1. **Keep Single-File Zero-Build Architecture**:
   Preserve `public/order-desk.html` as a clean, self-contained single-file HTML/CSS/JS without introducing heavyweight bundlers or external node modules in client code. This maintains instant loading, zero build friction, and robust iframe security within ChatGPT and Claude hosts.
2. **Implement Ambiguity Drawer as a Native Dialog/Drawer Element**:
   Use HTML5 `<dialog>` or a CSS slide-over drawer styled with host surface tokens (`--surface`, `--surface-hover`, `--border`), keeping the layout accessible and lightweight.
3. **Connect Frontend to Existing Backend Tools**:
   Wire up the already implemented `update_order_need`, `resolve_order_need`, and `revert_order_event` tools in `order-desk.html` before creating new endpoints.
4. **Enforce ADR-001 / ADR-002 Safety Boundaries**:
   Ensure all catalog proposals in the UI have clear human confirmation gates, visible disclaimers that no external live order is dispatched, and complete audit visibility.

---
*Report compiled autonomously by survey_explorer_3. Stored at `/home/admin/PanelPH/.agents/teamwork/survey_explorer_3/frontend_survey_report.md`.*

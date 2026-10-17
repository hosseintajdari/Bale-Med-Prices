# Authoritative Specification Mining Report: Milestone 4 (Pharmacist Frontend & Apps SDK)

**Agent**: `m4_spec_miner_1_gen7` (Specification Miner)  
**Assigned Directory**: `/home/admin/PanelPH/.agents/teamwork/m4_spec_miner_1_gen7`  
**Target Repository**: `/home/admin/PanelPH`  
**Date**: 2026-10-14  
**Milestone**: M4 — Modern Pharmacist Frontend & Apps SDK (`public/order-desk.html`)  
**Parent Orchestrator**: `7625a001-7a29-4bf5-9e8c-d5feff17e404`  

---

## 1. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| F15 | Frontend / Capture | Free-Text Need Entry Form | Rapid pharmacist item capture with free-text name, quantity, unit, and optional note; Enter keyboard shortcut; auto-focus return; RTL Persian layout | `name` (string, min 1), `quantity` (number > 0), `unit` (optional string), `note` (optional string) | Appends need with `status: "needs_completion"`, clears form, focuses `#name`, displays `«به پیش‌نویس اضافه شد.»` | HTTP 400 `VALIDATION_ERROR` on empty name or non-positive quantity; display error in `#error` | `docs/UI-DESIGN.md`, `ORIGINAL_REQUEST.md § R3`, `public/order-desk.html` |
| F16 | Frontend / Resolution | Ambiguity Resolution Drawer / Modal | Sliding drawer/modal triggered by item card click or `[تکمیل و تطبیق]`, searches catalog live via `/api/catalog/search` or `search_catalog`, displays candidate cards with generic/brand codes, dosage, and stock, requires explicit human selection before enabling `[تأیید این کالا]` | `needId` (string), selected candidate reference `{ title, genericCode, brandCode, dosageForm, strength, goodId }` | Sets item status to `ready_for_review`, updates title with reference, closes drawer, recalculates draft status | HTTP 400 on empty reference title; HTTP 404 if needId not found; disabled confirm button prevents submission without selection | `docs/UI-DESIGN.md`, `PROJECT.md § F16`, `src/server.js:670-703` |
| F16b | Frontend / Resolution | In-Drawer Need Field Modification | Pharmacist edits free-text name, quantity, unit, or note inside drawer before or alongside catalog resolution | `id` (string), `name` (optional string), `quantity` (optional number), `unit` (optional string), `note` (optional string) | Updates item attributes, records `need_updated` event, updates item card display | HTTP 400 on invalid field value; HTTP 404 if item does not exist | `docs/UI-DESIGN.md § جزئیات ردیف`, `src/server.js:632-667` |
| F16c | Frontend / Resolution | Intentional Resolution Postponement | Pharmacist consciously closes drawer without choosing a catalog candidate via `[فعلاً فقط نیاز آزاد بماند]` | User click on cancel / postpone button | Closes drawer, preserves `needs_completion` status, renders guidance `«فعلاً فقط نیاز آزاد ذخیره شد؛ بعداً می‌توانید کالای دقیق را تعیین کنید.»` | None (safe user exit) | `docs/UI-DESIGN.md § متن‌های پیشنهادی` |
| F17 | Frontend / State | Live Draft Status Overview & Badges | Dynamic indicator of overall draft status (`open`, `needs_completion`, `ready_for_review`) and item badges | Draft state from server (`items[]`, `status`, `summary`) | Header badge (`#status`), summary counts (`#summary`: `X ردیف · Y ابهام`), individual item badges | Renders fallback "در حال دریافت پیش‌نویس…" during loading; displays network error if server unreachable | `docs/UI-DESIGN.md § وضعیت‌ها`, `PROJECT.md § F17`, `src/draft-store.js:57-74` |
| F17b | Frontend / Guidance | Dynamic Suggested Action Banner | Dynamic guidance text banner in footer based on current draft state | Current draft status and ambiguity count | Rendered text in `#suggested-action`: empty hint (`open`), ambiguity count hint (`needs_completion`), or review readiness hint (`ready_for_review`) | Gracefully handles undefined draft state | `docs/UI-DESIGN.md § چیدمان و متن‌های پیشنهادی` |
| F17c | Frontend / Discrepancy | Discrepancy Indicators | Displays blocking ambiguities or stock shortage warnings when export review is performed | `discrepancies[]` from `/api/orders/export-batch` or `export_order_batch` | Alert banner `#discrepancies` highlighting missing product identities or insufficient inventory | Flags discrepancies without crashing or mutating draft | `PROJECT.md § F11`, `src/server.js:124-150`, `test/server-rest.test.js:238-258` |
| F18 | Frontend / Theme | Automatic Host Theme Synchronization | 3-tier theme synchronization (CSS `@media (prefers-color-scheme)`, Apps SDK handshake `hostContext.theme`, and live `ui/notifications/host-context-changed`) | Host theme string (`"light"` \| `"dark"`), host style tokens | Toggles `data-theme="dark"` / `data-theme="light"` on `document.documentElement`, adjusting all CSS custom properties | Fallbacks safely to `@media (prefers-color-scheme)` if host sends no theme event | `docs/UI-DESIGN.md § قرارداد بصری`, `PROJECT.md § F18`, `survey_explorer_3` |
| F18b | Frontend / Layout | Persian Right-To-Left (RTL) Layout | RTL layout for Persian script with LTR isolation for medicine codes, dosages, and TTAC / IRC strings | Persian texts, English drug codes/strengths | `<html lang="fa" dir="rtl">`, logical CSS properties (`padding-inline`, `margin-inline-start`), `<span dir="ltr">` for codes | Misaligned numbers avoided by explicit LTR spans | `docs/UI-DESIGN.md`, `test/e2e/tier1-feature-coverage.test.js:154-168` |
| F19 | Frontend / Audit | Event History Timeline & Compensating Revert | Visual reverse-chronological event timeline rendering change history with timestamp, action type badge, and active Revert button | `draft.events[]` | Timeline rows in `#history` with time, event type badge, change summary, and Revert button invoking `/api/draft/revert` or `revert_order_event` | Revert button disabled if event was already reverted; HTTP 400/404 displayed in `#error` on invalid revert attempt | `docs/UI-DESIGN.md § سابقه و بازگردانی`, `PROJECT.md § F19`, `src/draft-store.js:409-450` |
| F19b | Frontend / Communication | Dual Protocol Adaptive Transport | Widget automatically operates via ChatGPT Apps SDK `postMessage` JSON-RPC 2.0 when in an iframe, and falls back to standard REST `/api/*` fetch when running standalone | Environment context (`window.parent !== window`) | Transparent API calls through either `callTool` or `fetch` | If iframe RPC handshake times out or errors, logs diagnostic error and displays connection status | `PROJECT.md § Architecture`, `public/order-desk.html:95-116`, `src/server.js:520-584` |

---

## 2. Edge Cases

| # | Feature | Input / Condition | Observed / Documented Behavior |
|---|---------|-------------------|--------------------------------|
| E1 | F15: Free-Text Entry | Empty name (`""`) or whitespace only (`"   "`) submitted in capture form | Client HTML5 `required` blocks submit; server returns HTTP 400 `{"error": {"code": "VALIDATION_ERROR", "message": "نام نیاز الزامی است."}}`. Displayed in `#error`. Form inputs preserved. |
| E2 | F15: Free-Text Entry | Zero quantity (`0`) or negative number (`-5`) | Client `min="1"` blocks submit; server returns HTTP 400 `{"error": {"code": "VALIDATION_ERROR", "message": "تعداد باید عدد مثبت باشد."}}`. Displayed in `#error`. |
| E3 | F15: Free-Text Entry | Persian/Arabic numerals entered (e.g. `"۲"`, `"۵"`) | Form/store digit normalizer transliterates digits to ASCII `2`, `5`; accepted successfully with status 201 without failure. |
| E4 | F15: Free-Text Entry | Pharmacist presses `Enter` key while typing in any input | Triggers form submit event; on success, form resets and focus is automatically returned to `#name` input for continuous typing without mouse use. |
| E5 | F16: Resolution Drawer | Drawer opened with no catalog candidate selected yet | Confirm button (`#drawer-confirm-btn`) is strictly initialized in `disabled` state (`disabled = true`). User cannot submit empty resolution. |
| E6 | F16: Resolution Drawer | Candidate medicine codes have leading zeros (e.g. Generic `"00001"`, Brand `"08234"`) | Leading zeros are strictly preserved as strings throughout catalog resolver, search response, selection payload, and store persistence without numeric coercion. Rendered in `<span dir="ltr">00001</span>`. |
| E7 | F16: Resolution Drawer | User presses `Escape` key or clicks on backdrop overlay | Drawer smoothly closes; active item remains unchanged; focus returns to the triggering item card. |
| E8 | F16: Resolution Drawer | User clicks `[فعلاً فقط نیاز آزاد بماند]` | Drawer closes immediately; item remains in `needs_completion`; guidance message displays `«فعلاً فقط نیاز آزاد ذخیره شد؛ بعداً می‌توانید کالای دقیق را تعیین کنید.»`. |
| E9 | F16: Resolution Drawer | Catalog search query contains isolated dosage units (e.g. `"ویال"`, `"قرص"`, `"mg"`) | `src/catalog-resolver.js` filters out isolated stop tokens, preventing spurious matches and returning clean results. |
| E10 | F17: Draft Status | Draft is empty (0 items) | Draft status is strictly `open` (`باز`), `#summary` displays `0 ردیف · 0 ابهام`, suggested action displays `«پیش‌نویس خالی است؛ نیازهای دارویی را ثبت کنید.»`. |
| E11 | F17: Draft Status | Free-text need added to empty draft | Draft status immediately flips to `needs_completion` (`نیازمند تکمیل`), `#summary` updates to `1 ردیف · 1 ابهام`, suggested action displays `«اقدام پیشنهادی: تکمیل ۱ مورد مبهم پیش از بازبینی نهایی»`. |
| E12 | F17: Draft Status | Single item in draft is resolved via catalog reference | Draft status flips to `ready_for_review` (`آماده بازبینی`), `#summary` displays `1 ردیف · 0 ابهام`, suggested action displays `«پیش‌نویس آماده بازبینی است؛ هنوز هیچ سفارشی ارسال نشده است.»`. |
| E13 | F17: Draft Status | New free-text need added to an already `ready_for_review` draft | Draft status immediately downgrades back to `needs_completion`, and new item appears in both `#items` and `#ambiguities`. |
| E14 | F18: Theme Sync | Host switches theme from light to dark dynamically during session | Host emits `ui/notifications/host-context-changed` with `{ theme: "dark" }`. Widget updates `data-theme="dark"` on `<html>`, instantly switching surface and text colors without page reload. |
| E15 | F18: Theme Sync | Standalone browser mode without ChatGPT host | Widget falls back automatically to CSS `@media (prefers-color-scheme: dark)` and matches OS system preference. |
| E16 | F19: Event Revert | Reverting a `need_resolved` event | Appends compensating `event_reverted` event targeting the resolution event. Store replay recalculates items: item's `resolvedReference` becomes `null`, status reverts to `needs_completion`, draft status downgrades to `needs_completion`. History is never truncated. |
| E17 | F19: Event Revert | Reverting an event that has already been reverted | Store checks active revert targets; rejects with HTTP 400 `{"error": {"code": "REVERT_ERROR", "message": "این رخداد قبلاً بازگردانده شده است."}}`. UI displays error in `#error` and marks button as disabled. |
| E18 | F19: Event Revert | Reverting a `need_added` event | Appends compensating `event_reverted` event. Item is excluded from projected items (item count decreases). If 0 items remain, draft status returns to `open`. |
| E19 | F19b: Dual Transport | Widget loaded in standalone browser (`window.parent === window`) | In standalone mode, `window.parent.postMessage` receives no response. Widget detects standalone mode and routes all API operations to REST endpoints (`/api/draft`, `/api/draft/needs`, etc.) using native `fetch()`. |

---

## 3. Comprehensive Technical Specifications & DOM Interface Architecture

### 3.1 Component Architecture & DOM Identifiers

```
┌────────────────────────────────────────────────────────────────────────┐
│ <header>                                                               │
│   <h1>میز سفارش</h1>                                                  │
│   <div id="summary" class="summary">X ردیف · Y ابهام</div>             │
│   <span id="status" class="badge open">باز</span>                      │
├────────────────────────────────────────────────────────────────────────┤
│ <section class="capture-section">                                      │
│   <h2>ثبت سریع نیاز</h2>                                               │
│   <form id="need-form">                                                │
│     <input id="name" required placeholder="نام آزاد کالا">             │
│     <input id="quantity" required type="number" min="1" step="any">     │
│     <input id="unit" placeholder="واحد اختیاری">                       │
│     <input id="note" placeholder="یادداشت اختیاری">                    │
│     <button id="submit" type="submit">افزودن</button>                  │
│   </form>                                                              │
│   <p id="error" class="error" role="alert"></p>                        │
├────────────────────────────────────┬───────────────────────────────────┤
│ <div class="grid">                 │                                   │
│   <section>                        │ <section>                         │
│     <h2>ردیف‌های پیش‌نویس</h2>      │   <h2>ابهام‌های نیازمند تکمیل</h2>│
│     <div id="items"></div>         │   <div id="ambiguities"></div>    │
│   </section>                       │ </section>                        │
│ </div>                             │                                   │
├────────────────────────────────────┴───────────────────────────────────┤
│ <section>                                                              │
│   <h2>سابقهٔ تغییر</h2>                                                 │
│   <div id="history"></div>                                             │
├────────────────────────────────────────────────────────────────────────┤
│ <footer>                                                               │
│   <div id="suggested-action" class="suggested-action"></div>           │
│   <div id="discrepancies" class="discrepancies hidden"></div>          │
└────────────────────────────────────────────────────────────────────────┘

[ Ambiguity Resolution Drawer (hidden by default) ]
┌────────────────────────────────────────────────────────────────────────┐
│ <aside id="ambiguity-drawer" class="drawer hidden">                    │
│   <div class="drawer-header">                                          │
│     <h2>رفع ابهام: <span id="drawer-item-name"></span></h2>            │
│     <button id="drawer-close-btn">×</button>                           │
│   </div>                                                               │
│   <div class="drawer-edit-section">                                    │
│     <input id="drawer-edit-name"> <input id="drawer-edit-quantity">    │
│     <input id="drawer-edit-unit"> <input id="drawer-edit-note">        │
│     <button id="drawer-save-btn">ذخیره اصلاحات</button>                │
│   </div>                                                               │
│   <div class="drawer-search-section">                                  │
│     <input id="catalog-search-input" placeholder="جستجو در کاتالوگ...">│
│     <div id="catalog-candidates"></div>                                │
│   </div>                                                               │
│   <div class="drawer-actions">                                         │
│     <button id="drawer-confirm-btn" disabled>تأیید این کالا</button>    │
│     <button id="drawer-postpone-btn">فعلاً فقط نیاز آزاد بماند</button>│
│   </div>                                                               │
│ </aside>                                                               │
│ <div id="drawer-backdrop" class="drawer-backdrop hidden"></div>        │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Complete DOM Element & Class Registry

| Element Description | Selector / DOM ID | Tag Name | Attributes & Classes | Required Interaction / Events |
|---|---|---|---|---|
| Main container | `main` | `<main>` | `class="desk-container"` | Max width 1040px, centered |
| Header summary | `#summary` | `<div>` | `class="summary"` | Renders count: `${items.length} ردیف · ${ambiguities.length} ابهام` |
| Draft status badge | `#status` | `<span>` | `class="badge {open\|needs_completion\|ready_for_review}"` | Updates with draft status |
| Need capture form | `#need-form` | `<form>` | `id="need-form" autocomplete="off"` | `submit` event listener with `preventDefault` |
| Need name input | `#name` | `<input>` | `id="name" required placeholder="نام آزاد کالا" aria-label="نام آزاد کالا"` | Auto-focus destination after submission |
| Need quantity input | `#quantity` | `<input>` | `id="quantity" required type="number" min="1" step="any" placeholder="تعداد"` | Number validation; Persian digit translation |
| Need unit input | `#unit` | `<input>` | `id="unit" placeholder="واحد اختیاری" aria-label="واحد اختیاری"` | Optional string |
| Need note input | `#note` | `<input>` | `id="note" placeholder="یادداشت اختیاری" aria-label="یادداشت اختیاری"` | Optional string (M4 enhancement) |
| Capture submit button | `#submit` | `<button>` | `id="submit" type="submit"` | Disabled during in-flight submission |
| Global error alert | `#error` | `<p>` | `id="error" class="error" role="alert"` | Renders error messages in red |
| Draft items container | `#items` | `<div>` | `id="items" class="items"` | Renders list of item cards |
| Ambiguities container | `#ambiguities` | `<div>` | `id="ambiguities" class="ambiguities"` | Renders unresolved item cards with resolve triggers |
| Item card element | `.item` | `<div>` | `class="item [needs_completion\|ready_for_review]"` | Clickable card opening drawer |
| Ambiguity resolve button | `.btn-resolve` | `<button>` | `class="btn-resolve" data-item-id="..."` | Opens drawer for specific item |
| History container | `#history` | `<div>` | `id="history" class="history"` | Renders reverse-chronological event rows |
| Event row element | `.event-row` | `<div>` | `class="event-row"` | Contains time, event badge, details, revert button |
| Event revert button | `.btn-revert` | `<button>` | `class="btn-revert" data-event-id="..."` | Calls `/api/draft/revert` or `revert_order_event` |
| Suggested action banner | `#suggested-action` | `<div>` | `id="suggested-action" class="suggested-action"` | Dynamic guidance footer |
| Discrepancies banner | `#discrepancies` | `<div>` | `id="discrepancies" class="discrepancies hidden"` | Renders batch export discrepancies |
| Ambiguity drawer | `#ambiguity-drawer` | `<aside>` | `id="ambiguity-drawer" class="drawer hidden" role="dialog" aria-modal="true"` | Slide-over panel for resolving ambiguities |
| Drawer backdrop overlay | `#drawer-backdrop` | `<div>` | `id="drawer-backdrop" class="drawer-backdrop hidden"` | Dismisses drawer on click |
| Drawer title | `#drawer-title` | `<h2>` | `id="drawer-title"` | Displays current item title |
| Drawer close button | `#drawer-close-btn` | `<button>` | `id="drawer-close-btn" aria-label="بستن"` | Closes drawer |
| Drawer edit name | `#drawer-edit-name` | `<input>` | `id="drawer-edit-name"` | Direct field editing |
| Drawer edit quantity | `#drawer-edit-quantity`| `<input>` | `id="drawer-edit-quantity" type="number"` | Direct field editing |
| Drawer edit unit | `#drawer-edit-unit` | `<input>` | `id="drawer-edit-unit"` | Direct field editing |
| Drawer edit note | `#drawer-edit-note` | `<input>` | `id="drawer-edit-note"` | Direct field editing |
| Drawer save edit button | `#drawer-save-btn` | `<button>` | `id="drawer-save-btn"` | Calls `update_order_need` / `PATCH` |
| Catalog search input | `#catalog-search-input`| `<input>` | `id="catalog-search-input" placeholder="جستجو..."` | Triggers live search query |
| Catalog candidates list | `#catalog-candidates` | `<div>` | `id="catalog-candidates" class="catalog-candidates"` | Renders candidate cards |
| Candidate card element | `.candidate-card` | `<div>` | `class="candidate-card [selected]"` | Click selects candidate, enables confirm button |
| Drawer confirm button | `#drawer-confirm-btn`| `<button>` | `id="drawer-confirm-btn" disabled` | Human confirmation gate: enabled only after candidate selection |
| Drawer postpone button | `#drawer-postpone-btn`| `<button>` | `id="drawer-postpone-btn"` | Postpones resolution, keeps free-text need |

---

### 3.3 CSS Theme Custom Property Tokens

```css
:root, [data-theme="light"] {
  color-scheme: light;
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
  --danger-bg: #fef2f2;
  --danger-text: #dc2626;
  --drawer-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  --backdrop-bg: rgba(0, 0, 0, 0.35);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --page: #121212;
    --surface: #171717;
    --surface-hover: #212121;
    --border: #303030;
    --divider: #2a2a2a;
    --text: #ececec;
    --muted: #a0a0a0;
    --input: #212121;
    --accent: #4d8dff;
    --accent-text: #ffffff;
    --warning-bg: #342b17;
    --warning-text: #f4c974;
    --success-bg: #153522;
    --success-text: #a7e8bd;
    --info-bg: #172d4d;
    --info-text: #accbff;
    --danger-bg: #451a1a;
    --danger-text: #fca5a5;
    --drawer-shadow: -4px 0 24px rgba(0, 0, 0, 0.5);
    --backdrop-bg: rgba(0, 0, 0, 0.65);
  }
}

[data-theme="dark"] {
  color-scheme: dark;
  --page: #121212;
  --surface: #171717;
  --surface-hover: #212121;
  --border: #303030;
  --divider: #2a2a2a;
  --text: #ececec;
  --muted: #a0a0a0;
  --input: #212121;
  --accent: #4d8dff;
  --accent-text: #ffffff;
  --warning-bg: #342b17;
  --warning-text: #f4c974;
  --success-bg: #153522;
  --success-text: #a7e8bd;
  --info-bg: #172d4d;
  --info-text: #accbff;
  --danger-bg: #451a1a;
  --danger-text: #fca5a5;
  --drawer-shadow: -4px 0 24px rgba(0, 0, 0, 0.5);
  --backdrop-bg: rgba(0, 0, 0, 0.65);
}
```

---

### 3.4 Interaction & Data Flow Specifications

#### 1. Free-Text Item Entry Flow (F15)
1. Pharmacist types item name into `#name`, quantity into `#quantity`, optional unit into `#unit`, optional note into `#note`.
2. Pharmacist presses `Enter` or clicks `#submit`.
3. UI sets `#submit` to `disabled = true`.
4. Client validates inputs:
   - `name.trim().length > 0`
   - `Number(quantity) > 0 && Number.isFinite(Number(quantity))`
5. If invalid: displays error in `#error` and reenables button.
6. If valid: calls `POST /api/draft/needs` (or MCP `add_order_need`) with payload `{ name, quantity, unit, note }`.
7. On 201 response:
   - Resets form fields.
   - Sets focus to `#name` (`nameInput.focus()`).
   - Updates draft state and re-renders `#items`, `#ambiguities`, `#summary`, `#status`, `#history`, `#suggested-action`.
   - Re-enables `#submit`.

#### 2. Ambiguity Resolution Drawer Flow (F16)
1. Pharmacist clicks `[تکمیل و تطبیق]` or clicks on any item card in `needs_completion` status.
2. Drawer opens (`#ambiguity-drawer.hidden` removed, `#drawer-backdrop.hidden` removed).
3. Header displays item name; direct edit inputs populate with current values.
4. Search input `#catalog-search-input` auto-populates with `item.freeTextName`.
5. Automatic query sent to `GET /api/catalog/search?q=${encodeURIComponent(item.freeTextName)}&limit=20` (or MCP `search_catalog`).
6. Results rendered in `#catalog-candidates`:
   - Each card displays Persian/English title, genericCode (preserving leading zeros e.g. `"00001"`), brandCode, dosageForm, and strength.
   - Advisory stock availability indicator (`POST /api/stock/check`).
7. `#drawer-confirm-btn` starts in `disabled` state (`disabled = true`).
8. When user clicks a candidate card:
   - Removes `.selected` from other candidate cards, adds `.selected` to chosen card.
   - Stores selected candidate reference.
   - Enables `#drawer-confirm-btn` (`disabled = false`).
9. When user clicks `#drawer-confirm-btn`:
   - Submits `POST /api/draft/needs/${needId}/resolve` (or MCP `resolve_order_need`) with payload:
     ```json
     {
       "reference": {
         "title": candidate.title,
         "genericCode": candidate.genericCode,
         "brandCode": candidate.brandCode,
         "dosageForm": candidate.dosageForm,
         "strength": candidate.strength,
         "goodId": candidate.goodId
       }
     }
     ```
   - On 200 response: closes drawer, item moves to `ready_for_review`, updates UI.
10. If user clicks `#drawer-postpone-btn`:
    - Drawer closes immediately without mutating draft.

#### 3. Compensating Event Revert Flow (F19)
1. In `#history`, each active event displays a `[بازگردانی]` button (`.btn-revert`).
2. Pharmacist clicks `[بازگردانی]` on an event (e.g. `need_resolved` or `need_updated` or `need_added`).
3. UI sends `POST /api/draft/revert` (or MCP `revert_order_event`) with `{ eventId }`.
4. Store appends `event_reverted` compensating event without truncating history.
5. On 200 response:
   - Server returns updated projected draft.
   - Reverted event button becomes disabled with text `«بازگردانده شده»`.
   - UI updates items and draft status accordingly.

---

## 4. 5-Component Handoff Report

### 1. Observation
- **Authoritative Specifications Checked**:
  - `docs/UI-DESIGN.md`: lines 1-64. Quotes:
    - Line 9: *"PanelPH یک صفحه وب مستقل با هویت بصری جدا نیست. پنل باید درون ChatGPT طبیعی به نظر برسد: فونت سیستمی میزبان، رنگ های سیستمی، زمینه هم خوان با حالت روشن و تیره..."*
    - Line 16-33: Visual 4-tier ASCII layout with header summary, rapid capture form, 2-column items/ambiguities grid, history, and suggested action.
    - Line 37: *"کاربر نام آزاد و تعداد را وارد می کند و «افزودن» را می زند. سیستم همان لحظه ردیف را در پیش نویس ذخیره می کند. اگر نام و تعداد برای ثبت کافی باشند اما هویت سفارش روشن نباشد، ردیف با وضعیت «نیازمند تکمیل» دیده می شود؛ ثبت متوقف نمی شود."*
    - Line 41: *"دکمه «تأیید این کالا» تنها پس از مشاهده پیشنهاد فعال است."*
    - Line 49: *"بازگردانی از یک رخداد مشخص، یک رخداد تازه ایجاد می کند و سابقه قبلی را پاک نمی کند."*
  - `docs/adr/ADR-001-private-chatgpt-mcp-workspace.md`: lines 1-26. Confirms private MCP App embedding, human confirmation guardrails, no unprompted external financial mutations.
  - `PROJECT.md`: lines 1-95. Interface contracts:
    - Line 5: `order-desk.html` serves as `ui://panelph/order-desk.html` with rapid free-text entry, ambiguity resolution drawer, status badges, history reverts, host theme sync.
    - Line 28-32: Feature definitions F15-F19.
    - Line 73-82: Operational REST endpoints (`/api/draft`, `/api/draft/needs`, `/api/draft/needs/:needId`, `/api/draft/needs/:needId/resolve`, `/api/draft/revert`, `/api/catalog/search`, `/api/stock/check`, `/api/orders/export-batch`).
  - `src/server.js`: lines 1-810. Verified REST handlers and 9 MCP tools: `get_order_draft`, `add_order_need`, `update_order_need`, `resolve_order_need`, `revert_order_event`, `render_order_desk`, `search_catalog`, `check_stock`, `export_order_batch`.
  - `src/draft-store.js`: lines 1-453. Verified draft mutex, append-only event sourcing, `deriveStatus` (`open` -> `needs_completion` -> `ready_for_review`), `projectItems`, `revertEvent`.
  - `src/catalog-resolver.js`: lines 1-635. Verified `searchCatalog`, Persian/Arabic normalization, digit preservation, leading zero retention.
  - `test/e2e/tier1-feature-coverage.test.js`: lines 154-168. Asserts widget resource contract, RTL Persian layout (`dir="rtl"`, `lang="fa"`), `prefers-color-scheme: dark`, `#need-form`, `#items`, `#ambiguities`.
  - Test suite execution: Verified by running `node --test` exiting code 0 with 141 passed tests.

### 2. Logic Chain
1. `docs/UI-DESIGN.md` and `ORIGINAL_REQUEST.md § R3` mandate that the pharmacist interface must support rapid entry without forced catalog matching.
2. In `src/draft-store.js`, when a need is created via `addNeed`, its initial status is always `needs_completion` unless resolved. The draft status function `deriveStatus` sets draft status to `needs_completion` whenever any item is not `ready_for_review`.
3. `docs/UI-DESIGN.md` explicitly specifies a 2-column layout where unresolved items appear in both "ردیف‌های پیش‌نویس" and "ابهام‌های نیازمند تکمیل". The latter requires an explicit trigger to open the resolution view.
4. In `src/server.js`, `/api/catalog/search` and tool `search_catalog` provide ranked medicine candidates while preserving leading zeros on `genericCode` and `brandCode`.
5. `docs/UI-DESIGN.md § جزئیات ردیف` specifies that candidate selection is human-gated: the confirmation button is disabled until a candidate is selected.
6. Confirming a candidate sends `{ reference: { title, genericCode, brandCode, dosageForm, strength } }` to `/api/draft/needs/:needId/resolve` (or `resolve_order_need`), which sets the item status to `ready_for_review`.
7. When all items reach `ready_for_review`, draft status becomes `ready_for_review`.
8. Compensating reversibility is implemented in `revertEvent`: targeting an event appends `event_reverted` and dynamically recalculates projected items without truncating the event array.
9. ChatGPT Apps SDK posts host theme changes via `ui/notifications/host-context-changed`. Synchronizing this with `document.documentElement.setAttribute("data-theme", ...)` ensures the UI dynamically toggles between light and dark modes in both embedded and browser environments.

### 3. Caveats
- No external network or live Qanoon endpoints are used; the offline mock mode in `src/adapters/qanoon-adapter.js` and local fixtures provide all required data.
- The UI widget in `public/order-desk.html` must remain a single, self-contained HTML file (zero-build vanilla JS/CSS) to be directly readable by `src/server.js` (`widgetHtml = readFileSync(...)`) and servable as an MCP App UI resource (`ui://panelph/order-desk.html`). External bundle tools (Webpack, Vite) are not required or recommended for this widget.

### 4. Conclusion
All visual, structural, behavioral, and API specifications for Milestone 4 (F15 through F19) have been comprehensively mined, verified, and cross-referenced against authoritative sources (`docs/UI-DESIGN.md`, `ORIGINAL_REQUEST.md`, `PROJECT.md`, `src/server.js`, `src/draft-store.js`, and `src/catalog-resolver.js`). The exact DOM IDs, CSS theme tokens, data models, error codes, and interaction sequences are fully defined and ready for direct implementation in `public/order-desk.html`.

### 5. Verification Method
1. **Automated Test Suite**:
   Run `node --test` from `/home/admin/PanelPH`. Confirms all 141 tests pass (exit code 0).
2. **Widget Resource Contract Verification**:
   Inspect `public/order-desk.html` to confirm presence of:
   - `<html lang="fa" dir="rtl">`
   - Form `#need-form` with inputs `#name`, `#quantity`, `#unit`, `#note`
   - Containers `#items`, `#ambiguities`, `#history`, `#suggested-action`
   - Drawer element `#ambiguity-drawer` with `#drawer-confirm-btn`, `#catalog-search-input`, `#catalog-candidates`
   - CSS tokens for light and dark modes (`[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`)
   - Revert action buttons calling `POST /api/draft/revert` or `revert_order_event`
3. **API Contract Verification**:
   Confirm endpoints via `test/server-rest.test.js`:
   - `POST /api/draft/needs`
   - `PATCH /api/draft/needs/:needId`
   - `POST /api/draft/needs/:needId/resolve`
   - `POST /api/draft/revert`
   - `GET /api/catalog/search`

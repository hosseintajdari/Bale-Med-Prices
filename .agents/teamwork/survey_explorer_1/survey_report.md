# Codebase Architecture Survey Report: PanelPH

**Author**: survey_explorer_1 (Codebase Architecture Explorer)  
**Date**: 2026-10-14  
**Project Root**: `/home/admin/PanelPH`  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/survey_explorer_1`  
**Reference Request**: `/home/admin/PanelPH/.agents/teamwork/ORIGINAL_REQUEST.md`  

---

## 1. Executive Summary

PanelPH is designed as a pharmacy operational layer and private ChatGPT MCP App. Its primary objective is to allow pharmacy staff to capture free-text product needs rapidly during daily operations, maintain a stable, auditable draft order workspace, resolve ambiguities progressively (connecting free text to verified catalog/Qanoon medicine identities), and produce export-ready order batches without forcing catalog lookups at entry time.

The current codebase is in an early functional prototype state:
1. **Runtime & Tests**: Node.js v24.21.0 native ESM project with zero build step. The automated test suite (`node --test`) executes with **exit code 0** and **4/4 passing tests** in ~1.8s.
2. **Backend**: A minimal HTTP server (`src/server.js`) implemented with Node's native `node:http`, `@modelcontextprotocol/sdk` (v1.32.1), and `@modelcontextprotocol/ext-apps` (v1.7.5). It exposes an MCP Streamable HTTP endpoint at `/mcp` with 6 registered MCP tools and 1 HTML widget resource. **No REST API endpoints exist currently** (all non-`/mcp` requests return 404, except `GET /`).
3. **State Management**: A JSON-file-backed draft store (`src/draft-store.js`) managing a singleton draft (`current-order-draft`) with in-memory caching, status derivation (`open`, `needs_completion`, `ready_for_review`), and a compensating event mechanism (`draft.events.unshift(...)` and `event_reverted`).
4. **Frontend**: A single-file HTML/CSS/JS client (`public/order-desk.html`) served as an MCP App resource (`ui://panelph/order-desk.html`), interacting via JSON-RPC `window.parent.postMessage`.
5. **Gaps Against R1–R4**:
   - **R1 (Qanoon Adapter)**: No adapter exists (`src/adapters/qanoon-adapter.js` is missing). No `docs/qanoon-api-spec.md` exists.
   - **R2 (Backend & MCP)**: Only MCP tools exist; no standard REST endpoints exist. Catalog resolution, stock checks, and export batch creation are not yet implemented.
   - **R3 (Frontend)**: Only basic need entry and card rendering exist; interactive ambiguity resolution drawer/modal, batch export view, and stock discrepancy highlights are missing.
   - **R4 (Event Sourcing & Concurrency)**: Events are logged alongside mutable state rather than projecting state from an immutable append-only event stream; no concurrency control or mutex exists around `state/order-draft.json`, creating vulnerability to race conditions during concurrent reverts or updates.

---

## 2. Complete File & Directory Inventory

The repository root at `/home/admin/PanelPH` contains the following layout (inspected via `list_dir` and `view_file`):

```
/home/admin/PanelPH/
├── .agents/
│   └── teamwork/
│       ├── ORIGINAL_REQUEST.md                     (3,355 bytes, 57 lines)
│       ├── BRIEFING.md                             (1,520 bytes)
│       ├── orchestrator/                           (plan.md, progress.md, BRIEFING.md, DISPATCH.md)
│       ├── survey_explorer_1/                      (working directory)
│       ├── survey_spec_miner_2/
│       └── survey_explorer_3/
├── docs/
│   ├── REFERENCE-DATA.md                           (3,281 bytes, 26 lines)
│   ├── UI-DESIGN.md                                (6,509 bytes, 64 lines)
│   └── adr/
│       ├── ADR-001-private-chatgpt-mcp-workspace.md (2,366 bytes, 26 lines)
│       └── ADR-002-qanoon-authorized-source-access.md (2,735 bytes, 26 lines)
├── fixtures/
│   └── catalog.sample.json                         (488 bytes, 19 lines)
├── node_modules/                                   (installed npm dependencies)
├── public/
│   └── order-desk.html                             (10,330 bytes, 152 lines)
├── src/
│   ├── draft-store.js                              (5,834 bytes, 181 lines)
│   └── server.js                                   (7,401 bytes, 195 lines)
├── state/
│   └── .gitkeep                                    (1 byte, 1 line)
├── test/
│   ├── draft-store.test.js                         (1,689 bytes, 37 lines)
│   └── server.test.js                              (1,905 bytes, 53 lines)
├── .gitignore                                      (58 bytes, 6 lines)
├── HANDOFF.md                                      (3,456 bytes, 35 lines)
├── package-lock.json                               (44,131 bytes)
├── package.json                                    (426 bytes, 20 lines)
├── pnpm-lock.yaml                                  (24,813 bytes)
├── PRD.md                                          (5,087 bytes, 53 lines)
└── README.md                                       (2,165 bytes, 31 lines)
```

### Git Repository State
- Command: `git status`
- Branch: `master`
- Commits: None (`fatal: your current branch 'master' does not have any commits yet`)
- Tracked status: All project files are currently untracked working-tree files.
- `.gitignore` ignores: `node_modules/`, `state/*.json`, `!state/.gitkeep`, `.env`, `.DS_Store`.

---

## 3. Dependencies, Runtimes & Scripts

### Runtime Environment
- **Node.js**: `v24.21.0` (meets `engines.node >= 20` defined in `package.json:12`)
- **npm**: `11.19.0`
- **pnpm**: Not installed on host (`bash: line 1: pnpm: command not found`). All package operations and tests should use `npm` or direct `node` commands.

### `package.json` Configuration
```json
{
  "name": "panelph",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Private ChatGPT MCP App for a pharmacy order draft workspace.",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@modelcontextprotocol/ext-apps": "^1.0.1",
    "@modelcontextprotocol/sdk": "^1.20.2",
    "zod": "^3.25.76"
  }
}
```

### Dependency Resolution (`npm ls`)
- `@modelcontextprotocol/ext-apps`: installed version `1.7.5`
- `@modelcontextprotocol/sdk`: installed version `1.32.1`
- `zod`: installed version `3.25.76`
- **No external HTTP frameworks** (e.g. Express, Fastify, Koa) are installed. The project relies strictly on Node's standard `node:http`.
- **No external test libraries** (e.g. Mocha, Jest, Vitest) are installed. The project relies strictly on native `node:test` and `node:assert/strict`.

---

## 4. Backend Implementation Analysis

### 4.1 Server Implementation (`src/server.js`)

#### Architecture & Lifecycles
- **Entry Point**: `startServer({ port = Number(process.env.PORT ?? 8787) } = {})` (`src/server.js:146`).
- **HTTP Engine**: `node:http` `createServer` (`src/server.js:1, 148`).
- **State Storage**: Default file path is `join(rootDirectory, "state", "order-draft.json")`, configurable via `process.env.PANELPH_STATE_PATH` (`src/server.js:17`).
- **Draft Store**: Instantiated as a module-scoped singleton `const store = createOrderDraftStore(statePath)` (`src/server.js:18`).
- **MCP Factory**: `createPanelServer()` returns a configured `McpServer` (`src/server.js:26-144`).
- **Per-Request MCP Transport**: On each incoming HTTP request matching `/mcp` with method `POST`, `GET`, or `DELETE`, a new `McpServer` and a new `StreamableHTTPServerTransport` (`enableJsonResponse: true`) are instantiated and connected (`src/server.js:172-184`):
  ```javascript
  const server = createPanelServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  response.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
  ```

#### HTTP Routes
| Method | Path | Handler Logic | Status / Output |
|---|---|---|---|
| `GET` | `/` | Root health/info route | `200` with text `"PanelPH MCP App"` (`src/server.js:152-154`) |
| `OPTIONS` | `/mcp` | CORS preflight handler | `204` with CORS headers (`src/server.js:155-163`) |
| `POST`, `GET`, `DELETE` | `/mcp` | MCP Streamable HTTP transport | Processed by `StreamableHTTPServerTransport` |
| Any other | Any | Fallback | `404 Not Found` (`src/server.js:166-168`) |

#### Registered MCP App Resources
- **Resource**: `panelph-order-desk`
- **URI**: `ui://panelph/order-desk.html`
- **MIME**: `RESOURCE_MIME_TYPE` (`text/html;profile=mcp-app`)
- **Metadata**:
  - `openai/ui.availableDisplayModes`: `["inline", "fullscreen"]`
  - `openai/widgetDescription`: `"میز سفارش PanelPH برای ثبت و بازبینی پیش‌نویس سفارش."`
- **Payload**: Reads file `public/order-desk.html` synchronously on server module load (`src/server.js:16`).

#### Registered MCP Tools
The server registers 6 tools via `registerAppTool` with `_meta: { ui: { visibility: ["model", "app"] } }`:

1. **`get_order_draft`**:
   - Schema: `{}`
   - Action: Calls `store.getDraft()`.
   - Returns: `{ content: [], structuredContent: { draft } }`
2. **`add_order_need`**:
   - Schema: `{ name: z.string().min(1), quantity: z.number().positive(), unit: z.string().optional(), note: z.string().optional() }`
   - Action: Calls `store.addNeed(args)`.
   - Returns: `{ content: [{ type: "text", text: "نیاز به پیش‌نویس اضافه شد." }], structuredContent: { draft } }`
3. **`update_order_need`**:
   - Schema: `{ id: z.string().min(1), name: z.string().optional(), quantity: z.number().positive().optional(), unit: z.string().optional(), note: z.string().optional() }`
   - Action: Calls `store.updateNeed(args)`.
   - Returns: `{ content: [{ type: "text", text: "ردیف پیش‌نویس اصلاح شد." }], structuredContent: { draft } }`
4. **`resolve_order_need`**:
   - Schema: `{ id: z.string().min(1), reference: z.object({ title: z.string().min(1), genericCode: z.string().optional(), brandCode: z.string().optional(), dosageForm: z.string().optional(), strength: z.string().optional() }) }`
   - Action: Calls `store.resolveNeed(args)`.
   - Returns: `{ content: [{ type: "text", text: "کالای دقیق در پیش‌نویس تأیید شد." }], structuredContent: { draft } }`
5. **`revert_order_event`**:
   - Schema: `{ eventId: z.string().min(1) }`
   - Action: Calls `store.revertEvent(args)`.
   - Returns: `{ content: [{ type: "text", text: "تغییر انتخاب‌شده بازگردانده شد." }], structuredContent: { draft } }`
6. **`render_order_desk`**:
   - Schema: `{}`
   - Meta: `{ ui: { resourceUri: "ui://panelph/order-desk.html" }, "openai/ui": { entrypoints: [{ type: "global" }] } }`
   - Action: Calls `store.getDraft()`.
   - Returns: `{ content: [{ type: "text", text: "میز سفارش PanelPH آماده است." }], structuredContent: { draft } }`

---

### 4.2 Draft Store Implementation (`src/draft-store.js`)

#### Factory Function & Interface
`createOrderDraftStore(statePath)` returns an object exposing 5 asynchronous methods:
- `getDraft()`: returns `publicDraft(draft)`
- `addNeed({ name, quantity, unit, note })`: adds need, appends `need_added` event, persists, returns public draft
- `updateNeed({ id, name, quantity, unit, note })`: updates need fields, appends `need_updated` event, persists, returns public draft
- `resolveNeed({ id, reference })`: links resolved reference, sets status to `ready_for_review`, appends `need_resolved` event, persists, returns public draft
- `revertEvent({ eventId })`: restores previous state for target item, appends `event_reverted` event, persists, returns public draft

#### Data Schema

##### Draft Entity (`createEmptyDraft`)
```javascript
{
  id: "current-order-draft",
  status: "open", // derived: "open" | "needs_completion" | "ready_for_review"
  items: [],
  events: [],
  createdAt: "2026-10-14T...",
  updatedAt: "2026-10-14T..."
}
```

##### Item Entity (`draft.items[i]`)
```javascript
{
  id: "need-1-1760433720000",
  freeTextName: "آموکسی‌سیلین",
  quantity: 2,
  unit: "بسته",
  note: "فوری",
  status: "needs_completion", // or "ready_for_review"
  resolvedReference: null,     // or { title, genericCode, brandCode, dosageForm, strength }
  createdAt: "2026-10-14T...",
  updatedAt: "2026-10-14T..."
}
```

##### Event Entity (`draft.events[i]`)
Events are stored at the beginning of the array (`unshift`):
```javascript
{
  id: "event-1-1760433720000",
  type: "need_added", // "need_added" | "need_updated" | "need_resolved" | "event_reverted"
  itemId: "need-1-1760433720000",
  before: null,       // snapshot before mutation (or null/undefined)
  after: { ... },     // snapshot after mutation (or null/undefined)
  occurredAt: "2026-10-14T..."
}
```

##### Public Summary (`publicDraft`)
```javascript
{
  ...draft,
  summary: {
    itemCount: number,
    ambiguityCount: number // items where status === "needs_completion"
  }
}
```

#### Status Derivation Rules (`deriveStatus`)
1. If `items.length === 0` -> `"open"`
2. If `items.every(item => item.status === "ready_for_review")` -> `"ready_for_review"`
3. Otherwise -> `"needs_completion"`

#### Persistence Mechanism
- Reads from `statePath` using `fs/promises.readFile`. If file does not exist (`ENOENT`), creates an empty draft and writes it.
- Writes to `statePath` using `fs/promises.writeFile` with formatted JSON (`JSON.stringify(loadedDraft, null, 2)\n`).
- Caches the draft object in a module closure variable `loadedDraft`. Subsequent `load()` calls return `loadedDraft` directly without reading disk.

---

## 5. Test Suite Inspection & Verification

### Executed Test Run
- **Command**: `node --test`
- **Working Directory**: `/home/admin/PanelPH`
- **Exit Code**: `0`
- **Verbatim Output**:
```
✔ stores a free-text need and preserves it after reopening (128.025038ms)
✔ resolves a need only when the user supplies a concrete reference (22.535048ms)
✔ revert records a new event instead of erasing history (51.486568ms)
PanelPH MCP App listening at http://localhost:0/mcp
✔ serves MCP initialization through the local endpoint (1345.371467ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1811.183672
```

### Detailed Breakdown of Current Tests

#### `test/draft-store.test.js` (3 unit tests)
1. **Line 13: `stores a free-text need and preserves it after reopening`**:
   - Asserts that adding a need with `{ name: "نام آزاد", quantity: 2, unit: "بسته" }` results in `status === "needs_completion"`, `items[0].freeTextName === "نام آزاد"`, and `summary.ambiguityCount === 1`.
2. **Line 21: `resolves a need only when the user supplies a concrete reference`**:
   - Asserts that resolving a need with `{ title: "نمونه آموزشی قرص", genericCode: "00001" }` transitions the item and draft status to `ready_for_review` and sets `resolvedReference.genericCode === "00001"`.
3. **Line 29: `revert records a new event instead of erasing history`**:
   - Asserts that calling `revertEvent` on a `need_added` event removes the item from `draft.items` while appending a new event of type `event_reverted` to `draft.events`.

#### `test/server.test.js` (1 integration test)
1. **Line 8: `serves MCP initialization through the local endpoint`**:
   - Spawns `startServer({ port: 0 })` dynamically with a temporary state path.
   - Dispatches JSON-RPC `initialize` method to `http://127.0.0.1:${port}/mcp`. Asserts HTTP 200 and `serverInfo.name === "panelph"`.
   - Dispatches JSON-RPC `tools/list` method to `http://127.0.0.1:${port}/mcp`. Asserts HTTP 200 and that `render_order_desk` is present in the registered tools list.

---

## 6. Frontend Architecture & MCP Apps SDK Widget

### File: `public/order-desk.html` (152 lines)
- **Role**: Serves as the UI payload for the MCP resource `ui://panelph/order-desk.html`.
- **Styling & Theming**:
  - Implements light and dark themes using CSS custom variables (`--page`, `--surface`, `--border`, `--text`, `--accent`, etc.) with `@media (prefers-color-scheme: dark)`.
  - Follows the Apps SDK design principles described in `docs/UI-DESIGN.md`: system fonts (`ui-sans-serif, system-ui`), subtle borders, no saturated card backgrounds in dark mode, compact density suitable for inline ChatGPT cards or sidebar drawers.
  - Direction: Native RTL (`<html lang="fa" dir="rtl">`).
- **Communication Protocol**:
  - Acts as an iframe client communicating with the ChatGPT host via `window.parent.postMessage` using JSON-RPC 2.0.
  - Lifecycle:
    1. Sends `ui/initialize` with app info (`panelph-order-desk`, version `0.1.0`) and protocol version `2026-01-26`.
    2. Sends notification `ui/notifications/initialized`.
    3. Calls tool `get_order_draft` via `request("tools/call", { name: "get_order_draft", arguments: {} })`.
    4. Listens for parent window messages (`message` event):
       - Resolves/rejects pending RPC promises matching message ID.
       - Handles push notifications: `ui/notifications/tool-result` triggers state update and re-render.
- **UI Sections**:
  - Header: Draft title, summary counter (`X ردیف · Y ابهام`), status badge (`باز`, `نیازمند تکمیل`, `آماده بازبینی`).
  - Need Entry Form: Inputs for `name`, `quantity`, `unit`, and an "افزودن" submit button.
  - Grid:
    - Left column: List of all items (`#items`).
    - Right column: Ambiguities needing completion (`#ambiguities`, filtered to `status === "needs_completion"`).
  - Bottom section: Change history list (`#history`, displaying up to 8 recent events).

---

## 7. Event Sourcing, Reversibility & Concurrency Audit (R4)

### Strengths in Existing Code
1. Every mutating operation (`addNeed`, `updateNeed`, `resolveNeed`, `revertEvent`) records an event object with `id`, `type`, `itemId`, `before`, `after`, and `occurredAt`.
2. Reverting an event does **not** erase past events; it appends a compensating event (`event_reverted`) at the head of `draft.events`.
3. Changes are written to disk (`state/order-draft.json`) immediately after mutation.

### Architectural Deficiencies & Vulnerabilities
1. **Hybrid Log vs. True Event Sourcing**:
   - The store persists both `items` and `events`.
   - State is mutated directly in-place (`draft.items.push`, `draft.items[index] = next`, `draft.items.splice`).
   - If `items` and `events` get out of sync, there is no replay projection mechanism to rebuild `items` deterministically from the ordered event stream.
2. **Revert Semantics on Multi-Step Edits**:
   - In `draft-store.js:163-173`, `revertEvent` simply takes `sourceEvent.before` and assigns `draft.items[currentIndex] = restored`.
   - Consider a sequence:
     - Event 1 (`need_added`): Quantity = 2
     - Event 2 (`need_updated`): Quantity = 5 (before = 2, after = 5)
     - Event 3 (`need_updated`): Note = "Urgent" (before: { qty: 5, note: "" }, after: { qty: 5, note: "Urgent" })
     - If the user reverts Event 2, `sourceEvent.before` has `{ qty: 2, note: "" }`. Assigning this restored object directly will silently clobber Event 3's note change.
   - There is no field-level inverse patch or conflict detection.
3. **Double-Revert / Invalid Revert Handling**:
   - There is no guard checking whether an event has already been reverted. Reverting the same event twice will perform undefined state mutations.
   - Reverting an `event_reverted` event is undefined.
4. **Race Conditions & Concurrency Vulnerabilities**:
   - **Requirement AC 50** specifies: *"Event-revert functionality tested and verified against race conditions."*
   - Currently, `createOrderDraftStore` has **no synchronization, mutex, or atomic file locking**.
   - If two asynchronous requests invoke `addNeed`, `updateNeed`, or `revertEvent` concurrently:
     - Both read the cached `loadedDraft` in memory before either finishes writing.
     - Both mutate `draft.items` and call `persist()`.
     - File writes (`writeFile`) can interleave or overwrite each other.
     - Event IDs (`collection.length + 1`) can collide if two events are generated concurrently within the same millisecond.
   - Writes to `statePath` are performed via direct `writeFile` rather than atomic write-and-rename (`writeFile(tmpPath)` -> `rename(tmpPath, statePath)`). A crash or interruption mid-write would leave `state/order-draft.json` corrupted (torn write).

---

## 8. Gap Analysis Against ORIGINAL_REQUEST.md

| Requirement Area | Specification in ORIGINAL_REQUEST.md | Current Implementation Status | Gap / Required Work |
|---|---|---|---|
| **R1. Qanoon API Adapter** | Isolated adapter boundary in `src/adapters/qanoon-adapter.js`, document schema in `docs/qanoon-api-spec.md`, support REST JSON exchange, stock checks, retry-safe `uniqueId`. | **0% Present** | Must create `src/adapters/qanoon-adapter.js`, write `docs/qanoon-api-spec.md`, provide mock fixtures for stock check and price validation, and add unit tests without live network calls. |
| **R2. Operational Backend** | Full operational lifecycle: free-text entry, catalog resolution, stock checks, batch review, export-ready batches. Expose via **both REST endpoints and MCP tools**. | **35% Present** | Basic free-text entry exists in MCP. **Zero REST endpoints exist**. Missing catalog resolution service, live stock check tool/endpoint, price rule validation, discrepancy highlighting, and batch export tools/endpoints. |
| **R3. Modern Pharmacist Frontend** | Rapid free-text capture, ambiguity resolution drawer/modal, live draft overview, status indicators, dark/light theme. | **40% Present** | Basic single-page widget exists with dark/light CSS and need form. Missing interactive ambiguity resolution drawer/modal, catalog suggestion picker, and export batch review. |
| **R4. Event Sourcing & Resilience** | Strict event sourcing (`need_added`, `need_updated`, `need_resolved`, `event_reverted`), compensating revert, race condition safety, restart resilience. | **50% Present** | Basic events and compensating revert exist. Missing concurrency protection/mutex, atomic persistence, double-revert guards, and comprehensive race-condition test coverage. |
| **Acceptance Criteria** | 100% tests pass via `node --test`; mock fixtures for Qanoon; event-revert tested against race conditions; `docs/qanoon-api-spec.md` complete; local `/mcp` intact. | **Partial** | Current 4 tests pass, but no tests exist yet for Qanoon adapter, catalog resolution, order batches, or concurrency race conditions. |

---

## 9. Recommendations for Downstream Milestones

1. **Milestone 1 (R1 - Qanoon Adapter)**:
   - Implement `src/adapters/qanoon-adapter.js` with clear boundaries: `checkStock(itemIds)`, `validatePriceRules(items)`, and `submitOrderBatch(batch, { uniqueId })`.
   - Include offline fixture-based mocking so `node --test` runs hermetically without external dependencies.
   - Author `docs/qanoon-api-spec.md` detailing endpoint structures, payload schemas, headers, error codes, and retry semantics.
2. **Milestone 2 (R2 - Operational Backend & REST)**:
   - Expand `src/server.js` HTTP router to handle REST routes:
     - `GET /api/draft` -> returns current draft
     - `POST /api/needs` -> adds need
     - `PATCH /api/needs/:id` -> updates need
     - `POST /api/needs/:id/resolve` -> resolves catalog item
     - `POST /api/events/:id/revert` -> reverts event
     - `GET /api/catalog/search?q=...` -> searches `fixtures/catalog.sample.json`
     - `POST /api/draft/export-batch` -> creates export batch
   - Mirror these capabilities in MCP tools using `@modelcontextprotocol/sdk`.
3. **Milestone 3 (R4 - Event Sourcing Hardening)**:
   - Implement an async operation queue or mutex in `src/draft-store.js` to serialize all state mutations and file writes.
   - Use atomic file replacement (`writeFile` to `.tmp` file + `rename`) to prevent corrupt state files.
   - Add concurrency stress tests in `test/draft-store.test.js` running 50+ simultaneous async operations to verify zero race conditions.
   - Add validation guards against double-reverting or reverting invalid event chains.
4. **Milestone 4 (R3 - Frontend Widget Enhancements)**:
   - Enhance `public/order-desk.html` with an ambiguity drawer/modal allowing pharmacists to click an ambiguous item and select a matching catalog item or refine dosage form/strength.
   - Display discrepancy badges (e.g. price difference or out-of-stock indicator).
   - Add export batch action and preview.
5. **Milestone 5 (Integration & Verification Gate)**:
   - Expand test suite to cover all 4 tiers (Unit, Integration, Edge/Corner, E2E).
   - Ensure all tests run with `node --test` with exit code 0.

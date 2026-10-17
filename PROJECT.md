# Project: PanelPH (Pharmacy Operational Layer & ChatGPT MCP App)

## Architecture
PanelPH operates as a decoupled pharmacy operational layer and private ChatGPT MCP App:
1. **Frontend Layer (`public/order-desk.html`)**: Single-page vanilla web client served as an MCP App UI resource (`ui://panelph/order-desk.html`) and accessible via web browser. Provides rapid free-text entry, ambiguity resolution drawer/modal, status badges (`open`, `needs_completion`, `ready_for_review`), live event timeline with compensating reverts, and dark/light host theme sync.
2. **Operational Server (`src/server.js`)**: Dual-protocol Node.js ESM server. Serves MCP JSON-RPC protocol at `/mcp` via `@modelcontextprotocol/sdk` and standard REST endpoints at `/api/*` for web clients and integration testing.
3. **Draft Store & Event Sourcing (`src/draft-store.js`)**: In-memory and disk-persisted (`state/order-draft.json`) transactional store. Strictly maintains append-only event sourcing (`need_added`, `need_updated`, `need_resolved`, `event_reverted`) with serialized mutex locking to prevent race conditions during concurrent operations.
4. **Catalog Resolution (`src/catalog-resolver.js`)**: Matches unstructured pharmacist text against medicine catalog references, preserving leading zeros on generic and brand codes without blocking free-text input.
5. **Qanoon Adapter Boundary (`src/adapters/qanoon-adapter.js`)**: Clean abstraction isolating PanelPH from legacy Qanoon webservices. Implements 24-hour `uniqueId` retry/idempotency cache, stock checks (preliminary and batch pre-check), deterministic 7-step pricing calculation (with 75/25 VAT/toll split and >10,000 Rial TTAC divergence warning), and offline mock fixtures for reproducible tests.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Qanoon REST Adapter Boundary | Decoupled adapter client wrapping Qanoon endpoints (`/stock/check`, `/orders/batch`, `/pricing/calculate`, `/goods/search`) | M1 | R1, spec_miner_2 |
| F2 | Qanoon Idempotency & Retry Semantics | Stable 24h `uniqueId` caching to prevent duplicate orders/allocations on retries | M1 | R1, spec_miner_2 |
| F3 | Qanoon Two-Stage Stock Verification | Advisory check during need resolution + pre-batch validation check | M1 | R1, spec_miner_2 |
| F4 | Deterministic Pricing & Tax/Toll Engine | Base price, 75/25 VAT/toll split, technical fee, and >10,000 Rial TTAC divergence warning | M1 | R1, spec_miner_2 |
| F5 | Offline Mock Fixtures & Testing Mode | Self-contained fixtures for catalog, pricing, and stock checks without live network dependencies | M1 | R1, Acceptance |
| F6 | Qanoon API Specification Document | Comprehensive contract documentation in `docs/qanoon-api-spec.md` | M1 | R1, Acceptance |
| F7 | Free-Text Need Entry (REST & MCP) | Capture item name, quantity, unit, and optional note without requiring catalog match | M2 | R2, PRD |
| F8 | Catalog Resolution Engine | Progression matching text to genericCode, brandCode (preserving leading zeros), strength, dosage form | M2 | R2, REFERENCE-DATA |
| F9 | Operational REST API Endpoints | Full REST API (`/api/draft/*`, `/api/catalog/*`, `/api/stock/*`, `/api/orders/*`) | M2 | R2, survey_explorer_1 |
| F10 | MCP Tools Expansion | Ensure all draft and operational tools are registered and functional on `/mcp` | M2 | R2, Acceptance |
| F11 | Order Batch Generation & Discrepancy Highlighting | Validate draft, flag unapproved discrepancies or out-of-stock items, export ready batch | M2 | R2, PRD |
| F12 | Strict Event Sourcing & Compensating Events | Append-only event history with `event_reverted` compensation without mutating past events | M3 | R4, draft-store |
| F13 | Concurrency Lock & Race Condition Protection | Mutex queue preventing corrupted writes during simultaneous edits or reverts | M3 | R4, Acceptance |
| F14 | Resilient Persistence Across Restarts | Atomic file write (temp file + rename) for `state/order-draft.json` | M3 | R4, PRD |
| F15 | Pharmacist Free-Text UI Capture Form | Rapid entry form with name, quantity, unit, and note in `order-desk.html` | M4 | R3, UI-DESIGN |
| F16 | Interactive Ambiguity Resolution Drawer/Modal | Drawer allowing pharmacist to view catalog suggestions, pick IRC/TTAC, and confirm resolution | M4 | R3, UI-DESIGN |
| F17 | Live Draft Overview & Status Badges | Dynamic rendering of `open`, `needs_completion`, and `ready_for_review` states | M4 | R3, UI-DESIGN |
| F18 | Host Context & Theme Synchronization | Automatic dark/light theme switching via CSS media query and ChatGPT host context events | M4 | R3, survey_explorer_3 |
| F19 | UI Event Timeline & Revert Action | Visual history of changes with instant revert buttons invoking `revert_order_event` | M4 | R3, UI-DESIGN |
| F20 | E2E Automated Verification Suite | 100% pass on test suite via `node --test` across Tiers 1-4 | M5 | Acceptance |
| F21 | Adversarial Coverage Hardening | Tier 5 adversarial verification and edge-case testing | M5 | Project Pattern |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Qanoon Adapter & Docs | `src/adapters/qanoon-adapter.js`, `docs/qanoon-api-spec.md`, `fixtures/qanoon-mock-data.json`, `test/qanoon-adapter.test.js` | none | DONE |
| M2 | Operational Backend & MCP Tools | `src/server.js`, `src/catalog-resolver.js`, REST endpoints, MCP tools, batch export | M1 | DONE |
| M3 | Event Sourcing & Concurrency | `src/draft-store.js` mutex queue, atomic writes, race condition tests | M2 | IN_PROGRESS |
| M4 | Pharmacist Frontend & Apps SDK | `public/order-desk.html` ambiguity drawer, note field, theme sync, timeline reverts | M2, M3 | PLANNED |
| M5 | E2E Verification & Hardening | Full test run across Tiers 1-4, Tier 5 adversarial testing, acceptance sign-off | M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### Qanoon Adapter (`src/adapters/qanoon-adapter.js`)
- `checkStock({ genericCode, brandCode, requestedCount })`:
  - Returns: `{ inStock: boolean, availableCount: number, warehouseId: string, advisoryWarning?: string }`
- `calculatePrice({ goodId, quantity, roundingRule?: string })`:
  - Returns: `{ unitBasePrice: number, basePrice: number, vatAmount: number, tollAmount: number, technicalFee: number, finalPrice: number, warnings: string[] }`
- `createBatchOrder({ draftId, uniqueId, items: Array<{ goodId, genericCode, quantity, price }> })`:
  - Headers: `{ "X-Unique-Id": uniqueId }`
  - Returns: `{ success: boolean, batchId: string, uniqueId: string, timestamp: string, status: "SUBMITTED" | "CACHED" }`
- `searchGoods({ query })`:
  - Returns: `Array<{ goodId: string, genericCode: string, brandCode: string, title: string, dosageForm: string, strength: string, sellPrice: number }>`

### Catalog Resolver (`src/catalog-resolver.js`)
- `searchCatalog(query: string)`:
  - Returns: `Array<{ genericCode: string, brandCode: string, title: string, dosageForm: string, strength: string, score: number }>`
- Strings with leading zeros (`"00001"`, `"08234"`) are strictly preserved as strings.

### Draft Store (`src/draft-store.js`)
- `addNeed({ draftId, rawText, quantity, unit, note })`: Promise<Draft>
- `updateNeed({ draftId, needId, updates })`: Promise<Draft>
- `resolveNeed({ draftId, needId, catalogReference })`: Promise<Draft>
- `revertEvent({ draftId, eventId })`: Promise<Draft>
- `getDraft({ draftId })`: Promise<Draft>
- `exportBatch({ draftId, adapter })`: Promise<{ batch: object, discrepancies: string[] }>
- Status lifecycle: `open` -> `needs_completion` -> `ready_for_review`
- Concurrency contract: All mutating methods pass through an internal mutex queue ensuring serial execution per draftId.

### REST Endpoints (`src/server.js`)
- `GET /api/draft` -> `200 { draft: {...} }`
- `POST /api/draft/needs` -> `201 { draft: {...}, need: {...} }`
- `PATCH /api/draft/needs/:needId` -> `200 { draft: {...} }`
- `POST /api/draft/needs/:needId/resolve` -> `200 { draft: {...} }`
- `POST /api/draft/revert` -> `200 { draft: {...} }`
- `GET /api/catalog/search?q=...` -> `200 { results: [...] }`
- `POST /api/stock/check` -> `200 { inStock: true, ... }`
- `POST /api/orders/export-batch` -> `200 { batch: {...}, discrepancies: [...] }`

## Code Layout
- `src/adapters/qanoon-adapter.js` (Owned by M1 Worker)
- `docs/qanoon-api-spec.md` (Owned by M1 Worker)
- `fixtures/qanoon-mock-data.json` (Owned by M1 Worker)
- `src/catalog-resolver.js` (Owned by M2 Worker)
- `src/server.js` (Owned by M2 Worker)
- `src/draft-store.js` (Owned by M3 Worker)
- `public/order-desk.html` (Owned by M4 Worker)
- `test/qanoon-adapter.test.js` (M1 unit tests)
- `test/server-rest.test.js` (M2 integration tests)
- `test/draft-store-concurrency.test.js` (M3 race condition tests)
- `test/e2e/*` (Owned by E2E Testing Track)

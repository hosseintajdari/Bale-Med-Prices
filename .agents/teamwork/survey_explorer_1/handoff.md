# Handoff Report: Codebase Architecture Survey (PanelPH)

**Agent**: `survey_explorer_1` (Codebase Architecture Explorer)  
**Date**: 2026-10-14  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/survey_explorer_1`  
**Handoff Type**: Hard (Phase 0 Architecture Survey Complete)  
**Recipient**: `ba9cb93f-aa16-41f9-a7c1-f88d790936d4` (Orchestrator)  

---

## 1. Observation

### Obs 1: Working Tree & Git Status
- Inspected repository root `/home/admin/PanelPH` via `list_dir` and `run_command` with `git status && git log -n 5 --oneline`.
- Result:
  ```
  On branch master
  No commits yet
  Untracked files:
    .agents/
    .gitignore
    HANDOFF.md
    PRD.md
    README.md
    docs/
    fixtures/
    package-lock.json
    package.json
    pnpm-lock.yaml
    public/
    src/
    state/
    test/
  fatal: your current branch 'master' does not have any commits yet
  ```
  Exit code: `128` on `git log` because the repository has an initial empty branch `master` with no commits yet.

### Obs 2: Dependencies & Engine
- Inspected `/home/admin/PanelPH/package.json` (lines 1–20) and ran `npm ls`:
  - `package.json` specifies:
    ```json
    "type": "module",
    "scripts": { "start": "node src/server.js", "test": "node --test" },
    "engines": { "node": ">=20" },
    "dependencies": {
      "@modelcontextprotocol/ext-apps": "^1.0.1",
      "@modelcontextprotocol/sdk": "^1.20.2",
      "zod": "^3.25.76"
    }
    ```
  - `npm ls` exit code: `0`:
    ```
    panelph@0.1.0 /home/admin/PanelPH
    ├── @modelcontextprotocol/ext-apps@1.7.5
    ├── @modelcontextprotocol/sdk@1.32.1
    └── zod@3.25.76
    ```
  - Host environment: `node -v` output `v24.21.0`, `npm -v` output `11.19.0`, `pnpm` command not found (exit code 127).

### Obs 3: Automated Test Suite Baseline
- Executed `node --test` in `/home/admin/PanelPH`.
- Verbatim execution output:
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
  Exit code: `0`. 4 total tests across `test/draft-store.test.js` (3 tests) and `test/server.test.js` (1 test).

### Obs 4: Server Architecture & MCP Implementation (`src/server.js`)
- Inspected `src/server.js` (195 lines):
  - Uses native `node:http.createServer` (`line 1, 148`).
  - Registers 1 MCP App Resource (`ui://panelph/order-desk.html`) reading `public/order-desk.html` (`lines 35-45`).
  - Registers 6 MCP Tools: `get_order_draft` (`lines 47-57`), `add_order_need` (`lines 59-74`), `update_order_need` (`lines 76-92`), `resolve_order_need` (`lines 94-113`), `revert_order_event` (`lines 115-125`), and `render_order_desk` (`lines 127-141`).
  - HTTP routing (`lines 152-168`):
    - `GET /` -> 200 `"PanelPH MCP App"`
    - `OPTIONS /mcp` -> 204 with CORS headers
    - `POST /mcp`, `GET /mcp`, `DELETE /mcp` -> handled by `StreamableHTTPServerTransport`
    - All other routes return `404 Not Found` (`lines 166-168`).
  - **No REST endpoints** (e.g. `/api/draft`, `/api/needs`, `/api/catalog`) exist in `src/server.js`.

### Obs 5: Draft Store & Event Sourcing (`src/draft-store.js`)
- Inspected `src/draft-store.js` (181 lines):
  - State file: `state/order-draft.json` (or `process.env.PANELPH_STATE_PATH`).
  - In-memory cache `loadedDraft` (`line 42`).
  - Methods: `getDraft`, `addNeed`, `updateNeed`, `resolveNeed`, `revertEvent`.
  - Mutating operations prepend events to `draft.events` with `draft.events.unshift(...)` (`lines 67-77`).
  - `revertEvent` (`lines 159-178`) finds `sourceEvent.before` and assigns `draft.items[currentIndex] = restored`, appending a new event of type `"event_reverted"`.
  - **Absence of locking / concurrency protection**: Mutations directly modify in-memory object and invoke `writeFile` without mutex, transaction, or atomic rename (`lines 56-61`).

### Obs 6: Frontend MCP Widget (`public/order-desk.html`)
- Inspected `public/order-desk.html` (152 lines):
  - Self-contained single-page HTML/CSS/JS.
  - Supports light/dark mode via `color-scheme: light dark` and `@media (prefers-color-scheme: dark)`.
  - Communicates with ChatGPT container via `window.parent.postMessage` JSON-RPC 2.0 (`ui/initialize`, `ui/notifications/initialized`, `tools/call`).
  - Renders need entry form, item list, ambiguities list, and 8 recent history events.
  - Lacks interactive ambiguity resolution modal, catalog search drawer, and batch export review UI.

---

## 2. Logic Chain

1. **Premise 1 (Obs 1, 2, 3)**: The project has a working Node.js 24 ESM foundation with zero external framework dependencies and a 100% passing automated test suite (`node --test`, exit code 0, 4 tests). Therefore, any architectural expansion must preserve ESM native imports, work within `node:test`, and avoid breaking existing test contracts.
2. **Premise 2 (Obs 4 vs. ORIGINAL_REQUEST.md R2)**: Requirement R2 explicitly requires: *"Expose all capabilities via both standard REST endpoints and MCP App tools (using @modelcontextprotocol/sdk)."* In `src/server.js:166-168`, all non-`/mcp` requests return 404. Therefore, REST routes (e.g., `/api/draft`, `/api/needs`, `/api/catalog`, `/api/batches`) must be introduced into `src/server.js` alongside the MCP handler.
3. **Premise 3 (Obs 4 vs. ORIGINAL_REQUEST.md R1)**: Requirement R1 mandates an isolated Qanoon adapter boundary (`src/adapters/qanoon-adapter.js`) and schema specification (`docs/qanoon-api-spec.md`). Neither file currently exists in `src/` or `docs/`. Therefore, Phase 1 must implement this adapter with offline fixtures (`fixtures/catalog.sample.json` and new mock data) to preserve hermetic tests.
4. **Premise 4 (Obs 5 vs. ORIGINAL_REQUEST.md R4 & AC 50)**: Acceptance Criteria specify: *"Event-revert functionality tested and verified against race conditions."* Because `src/draft-store.js` relies on an unsynchronized in-memory object and non-atomic `writeFile`, concurrent async requests will create race conditions (lost writes or corrupt state files). Therefore, an async queue/mutex and atomic file replacement pattern must be introduced in `draft-store.js`.
5. **Premise 5 (Obs 6 vs. ORIGINAL_REQUEST.md R3)**: Requirement R3 mandates an interactive ambiguity resolution drawer/modal and order batch creation in `public/order-desk.html`. The current HTML only provides an "افزودن" input form and read-only card lists. Therefore, the widget needs UI components for modal resolution and order batch review.

---

## 3. Caveats

1. **Live Network Isolation**: Investigation confirmed that no live Qanoon production API endpoint is configured or accessible locally. All development and testing must remain hermetic and fixture-backed as required by ADR-002 and security rules.
2. **External Notes Scope**: `/home/admin/projects/Bale-Med-Prices/docs/qanoon-webservices-notes.md` and `pricing-rules.md` were reviewed for domain context, but are external references; PanelPH must maintain its own isolated adapter and specification in `docs/qanoon-api-spec.md`.
3. **`pnpm` Absense**: `pnpm` is not installed on the Linux `ct` container. Scripts and instructions referencing `pnpm` in `README.md` should use `npm` or `node` directly.

---

## 4. Conclusion

The PanelPH repository possesses a clean, lean architectural baseline:
- A working Streamable HTTP MCP server at `/mcp` with 6 core draft tools and an Apps SDK widget.
- An in-memory/JSON-persisted draft store with compensating event history.
- A passing test suite (`node --test`, exit 0).

To fulfill `ORIGINAL_REQUEST.md`, downstream development must address four specific pillars:
1. **R1**: Build `src/adapters/qanoon-adapter.js` and `docs/qanoon-api-spec.md` with offline fixtures for stock check and price validation.
2. **R2**: Implement standard REST routes in `src/server.js` matching all draft and catalog capabilities, alongside MCP tools.
3. **R3**: Enhance `public/order-desk.html` with an ambiguity resolution drawer and batch export controls.
4. **R4**: Harden `src/draft-store.js` with an async concurrency mutex, atomic file writes, and race-condition test suites.

Detailed architectural analysis is recorded in `/home/admin/PanelPH/.agents/teamwork/survey_explorer_1/survey_report.md`.

---

## 5. Verification Method

To independently verify the observations and claims in this handoff report:

1. **Verify Test Suite**:
   ```bash
   cd /home/admin/PanelPH
   node --test
   ```
   *Expected result*: Exit code 0, 4 tests passing (3 draft-store tests, 1 server test), 0 failing.
2. **Verify Dependencies**:
   ```bash
   cd /home/admin/PanelPH
   npm ls
   ```
   *Expected result*: Exit code 0, tree containing `@modelcontextprotocol/ext-apps@1.7.5`, `@modelcontextprotocol/sdk@1.32.1`, `zod@3.25.76`.
3. **Inspect Server Routing**:
   Check `src/server.js` lines 148–170 to verify that only `/` and `/mcp` are routed, confirming the absence of REST endpoints.
4. **Inspect Draft Store Persistence**:
   Check `src/draft-store.js` lines 56–61 to verify lack of mutex/atomic write.
5. **Inspect Survey Report**:
   Read `/home/admin/PanelPH/.agents/teamwork/survey_explorer_1/survey_report.md` for full component breakdown and gap analysis.

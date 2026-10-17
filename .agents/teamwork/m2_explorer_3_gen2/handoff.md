# Handoff Report: Milestone 2 — MCP Tools Expansion, Order Batch Generation & Discrepancy Highlighting

**Agent**: `m2_explorer_3` (Generation 2)  
**Date**: 2026-10-14  
**Target Audience**: Orchestrator & M2 Worker  
**Working Directory**: `/home/admin/PanelPH/.agents/teamwork/m2_explorer_3_gen2`

---

## 1. Observation

1. **Current MCP Toolset in `src/server.js`**:
   - In `/home/admin/PanelPH/src/server.js` (lines 47–143), the server currently registers exactly six tools and one UI resource:
     - Line 35: `panelph-order-desk` (resource `ui://panelph/order-desk.html`)
     - Line 47: `get_order_draft`
     - Line 60: `add_order_need`
     - Line 76: `update_order_need`
     - Line 94: `resolve_order_need`
     - Line 115: `revert_order_event`
     - Line 127: `render_order_desk`
   - Three tools required by Milestone 2 (Feature F10 in `PROJECT.md` line 23) are currently unregistered: `search_catalog`, `check_stock`, and `export_order_batch`.

2. **HTTP Preflight (`OPTIONS`) Route Restriction in `src/server.js`**:
   - In `/home/admin/PanelPH/src/server.js` (lines 155–168):
     ```javascript
     if (request.method === "OPTIONS" && url.pathname === mcpPath) {
       response.writeHead(204, { ... });
       return response.end();
     }
     const methods = new Set(["POST", "GET", "DELETE"]);
     if (url.pathname !== mcpPath || !methods.has(request.method ?? "")) {
       return response.writeHead(404).end("Not Found");
     }
     ```
   - Preflight `OPTIONS` requests are exclusively accepted for `url.pathname === "/mcp"`.
   - In `/home/admin/PanelPH/test/e2e/test-helper.js` (lines 51–59):
     ```javascript
     export async function isEndpointAvailable(baseUrl, path) {
       try {
         const res = await fetch(`${baseUrl}${path}`, { method: "OPTIONS" });
         if (res.status === 404) return false;
         return true;
       } catch {
         return false;
       }
     }
     ```
   - Because `src/server.js` returns 404 for `OPTIONS` on `/api/orders/export-batch`, `isEndpointAvailable` returns `false`.

3. **Current Test Baseline Output (`npm test`)**:
   - Running `npm test` inside `/home/admin/PanelPH` yields exit code 0:
     ```
     ℹ tests 85
     ℹ suites 0
     ℹ pass 83
     ℹ fail 0
     ℹ cancelled 0
     ℹ skipped 2
     ℹ todo 0
     ℹ duration_ms 4770.79942
     ```
   - The two skipped tests are:
     1. `F9: Operational REST API endpoints (/api/draft/*)` (line 203 of `test/e2e/tier1-feature-coverage.test.js`)
     2. `F11: Order Batch Generation & Discrepancy Highlighting` (line 295 of `test/e2e/tier1-feature-coverage.test.js`):
        ```javascript
        await t.test("F11: Order Batch Generation & Discrepancy Highlighting", async (t) => {
          const hasBatchExport = await isEndpointAvailable(env.baseUrl, "/api/orders/export-batch");
          if (!hasBatchExport && !process.env.PANELPH_E2E_STRICT) {
            t.skip("Batch export endpoint /api/orders/export-batch not yet mounted (Milestone 2 dependency)");
            return;
          }
          await env.mcpClient.callTool("add_order_need", { name: "مورد مبهم", quantity: 1 });
          const exportRes = await env.restClient.post("/api/orders/export-batch", {
            draftId: "current-order-draft",
          });
          assert.equal(exportRes.status, 200);
          assert.ok(exportRes.body.discrepancies?.length > 0, "Unresolved items must be flagged as discrepancies");
        });
        ```

4. **Available Qanoon Adapter Engine Capabilities**:
   - `/home/admin/PanelPH/src/adapters/qanoon-adapter.js` exposes fully verified, production-ready methods:
     - `checkStock({ genericCode, brandCode, goodId, warehouseId, requestedCount })` (line 131)
     - `checkBatchStock({ warehouseId, items })` (line 231) -> returns `{ allAvailable: boolean, items: [...], discrepancies: string[] }`
     - `calculatePrice({ goodId, quantity, documentDate, includeTechnicalFee, roundingRule, warehouseId })` (line 275) -> returns 7-step pricing with TTAC divergence guard (>10,000 Rial)
     - `createBatchOrder({ draftId, uniqueId, items, warehouseId, notes })` (line 435) -> handles 24-hour SHA-256 payload caching (`SUBMITTED` vs `CACHED`) and concurrency locking
     - `searchGoods({ query, limit })` (line 525) -> preserves leading zeroes in `genericCode` and `brandCode` strings

5. **Draft State Model in `src/draft-store.js`**:
   - In `/home/admin/PanelPH/src/draft-store.js` (lines 10–39, 93–103, 145–156):
     - Unresolved items have `status: "needs_completion"` and `resolvedReference: null`.
     - Resolved items have `status: "ready_for_review"` and `resolvedReference: { title, genericCode, brandCode, dosageForm, strength }`.
     - Summary provides `summary: { itemCount, ambiguityCount }`.

---

## 2. Logic Chain

1. **Step 1 (Tool Expansion)**:
   - *Supported by*: Observation 1 & Observation 4.
   - *Reasoning*: Milestone 2 requires expanding the MCP surface on `/mcp` with `search_catalog`, `check_stock`, and `export_order_batch`. The adapter functions `searchGoods`, `checkStock`, and `createBatchOrder` are already implemented and tested in `src/adapters/qanoon-adapter.js`. Registering these tools with `@modelcontextprotocol/sdk` and `zod` fulfills Feature F10 and exposes full counter capabilities to ChatGPT and MCP clients.

2. **Step 2 (Discrepancy Highlighting & Validation Pipeline)**:
   - *Supported by*: Observation 3, Observation 4, & Observation 5.
   - *Reasoning*: Test `F11` in `tier1-feature-coverage.test.js` expects that calling `POST /api/orders/export-batch` on a draft with unresolved items returns HTTP 200 with `discrepancies.length > 0`.
   - By creating a 4-tier discrepancy validator:
     1. Tier 1: Empty draft (`draft.items.length === 0`) -> returns blocking discrepancy: `"پیش‌نویس سفارش خالی است و هیچ ردیف نیازی برای صدور ثبت نشده است."`.
     2. Tier 2: Unresolved needs (`status !== "ready_for_review"` or `resolvedReference === null`) -> flags each item as a blocking discrepancy: `"قلم '${item.freeTextName}' (${item.id}) تعیین هویت نشده و فاقد کالای مرجع تأییدشده است."`.
     3. Tier 3: Inventory availability check via `adapter.checkBatchStock` -> flags out-of-stock items as blocking discrepancies: `"کسری موجودی برای ${title}: درخواستی ${requested}، موجود ${availableCount}"`.
     4. Tier 4: Pricing calculation via `adapter.calculatePrice` -> compiles advisory warnings (e.g. TTAC divergence > 10,000 Rials).
     5. If blocking discrepancies exist (Tiers 1–3), submission is halted and `{ success: false, status: "DISCREPANCIES_DETECTED", batch: null, discrepancies }` is returned.
     6. If all items are resolved and in stock, a stable `uniqueId` is used to invoke `adapter.createBatchOrder`, returning `{ success: true, status: "SUBMITTED" | "CACHED", batch, uniqueId, discrepancies, pricingSummary }`.

3. **Step 3 (Dual-Protocol REST and OPTIONS Preflight Alignment)**:
   - *Supported by*: Observation 2 & Observation 3.
   - *Reasoning*: Because test-helper's `isEndpointAvailable` issues an HTTP `OPTIONS` probe to check if an endpoint is mounted, widening `src/server.js` to return HTTP 204 with CORS headers for any `OPTIONS` request unblocks endpoint discovery. Mounting `POST /api/orders/export-batch`, `POST /api/stock/check`, and `GET /api/catalog/search` immediately activates test `F11` and makes it pass.

---

## 3. Caveats

1. **Coordination with `m2_explorer_1_gen2` (REST Routing Architecture)**: Explorer 1 is designing the overall REST routing structure in `src/server.js`. The batch export logic has been architected as an isolated, modular engine (`src/batch-exporter.js`) so that it can be invoked cleanly by both REST handlers and MCP tool handlers without code duplication.
2. **Coordination with `m2_explorer_2_gen2` (Catalog Resolver)**: Explorer 2 is developing `src/catalog-resolver.js`. The `search_catalog` tool can delegate directly to `adapter.searchGoods` or `catalogResolver.searchCatalog`. Both ensure string preservation of leading zeroes (`"00001"`).
3. **No Changes Needed in `qanoon-adapter.js`**: `src/adapters/qanoon-adapter.js` is 100% complete and verified by 18 unit tests in `test/qanoon-adapter.test.js`. No changes or extensions are required inside the adapter itself.

---

## 4. Conclusion

1. **Complete Technical Blueprint Provided**:
   - A detailed analysis report has been authored at `/home/admin/PanelPH/.agents/teamwork/m2_explorer_3_gen2/analysis.md`.
   - Specifications, Zod input schemas, Persian descriptions, and response envelopes are defined for `search_catalog`, `check_stock`, and `export_order_batch`.
   - A complete 4-tier discrepancy highlighting engine has been designed to validate empty drafts, ambiguous items, warehouse inventory, and pricing divergences.
   - The root cause of the skipped `F11` test has been diagnosed (CORS/OPTIONS handling) and a concrete drop-in fix provided.
2. **Actionable for M2 Worker**:
   - The M2 Worker can directly adopt the modular `exportBatch` code and server wiring from `analysis.md` to complete Feature F10 and Feature F11.

---

## 5. Verification Method

1. **Files to Inspect**:
   - `/home/admin/PanelPH/.agents/teamwork/m2_explorer_3_gen2/analysis.md` (complete architectural design and drop-in code blueprints)
   - `/home/admin/PanelPH/src/server.js` (existing tool definitions and request listener)
   - `/home/admin/PanelPH/src/adapters/qanoon-adapter.js` (verified adapter methods)

2. **Automated Verification Command**:
   ```bash
   cd /home/admin/PanelPH && npm test
   ```
   - Baseline: 83 passed, 2 skipped, 0 failed.
   - Target post-M2 implementation: **85 passed (100%), 0 skipped, 0 failed**.

3. **Invalidation Conditions**:
   - If `F11: Order Batch Generation & Discrepancy Highlighting` continues to be skipped, the `OPTIONS` preflight handler was not mounted or did not return HTTP 204.
   - If `export_order_batch` permits an empty or ambiguous draft to create a batch in Qanoon, the discrepancy validation gate was bypassed.
   - If numeric coercion converts `"00001"` to `1`, string preservation invariants are violated.

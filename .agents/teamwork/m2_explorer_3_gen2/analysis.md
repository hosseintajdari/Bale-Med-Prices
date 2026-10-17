# Milestone 2 Technical Analysis: Order Batch Generation, Discrepancy Highlighting, and MCP Tools Expansion

**Agent**: `m2_explorer_3` (Generation 2)  
**Date**: 2026-10-14  
**Context**: PanelPH Operational Layer — Milestone 2 (`M2: Operational Backend & MCP Tools`)  
**Scope**: Batch Export Engine, Discrepancy Highlighting Pipeline, MCP Tools Expansion, Qanoon Adapter Integration, and Dual-Protocol REST Alignment in `src/server.js`.

---

## 1. Executive Summary

Milestone 2 operationalizes PanelPH by extending the Node.js server (`src/server.js`) to provide full operational counter-to-export workflows. While peer explorer `m2_explorer_1_gen2` investigates REST API routing and `m2_explorer_2_gen2` focuses on the catalog resolution engine (`src/catalog-resolver.js`), this analysis defines the complete architectural blueprint and implementation specification for:

1. **Expanding MCP Tools on `/mcp`**: Registering three new first-class operational tools (`search_catalog`, `check_stock`, `export_order_batch`) using `@modelcontextprotocol/sdk` alongside the six pre-existing tools, bringing total registered MCP tools to nine.
2. **Order Batch Generation & Discrepancy Highlighting Engine**: Formulating an end-to-end validation barrier that systematically identifies empty drafts, flags ambiguous/unresolved items, runs Stage 2 pre-batch stock validation via `adapter.checkBatchStock`, evaluates 7-step pricing and TTAC price divergences (>10,000 Rials) via `adapter.calculatePrice`, and submits approved batches to `adapter.createBatchOrder`.
3. **24-Hour Idempotency & Batch Data Structure**: Generating stable `uniqueId` tokens, formatting export payloads compatible with Qanoon ERP schemas, strictly preserving string codes with leading zeroes (e.g. `"00001"`), and handling both initial submissions (`SUBMITTED`) and cached replays (`CACHED`).
4. **Dual-Protocol Alignment & Preflight Routing**: Rectifying the HTTP `OPTIONS` preflight routing in `src/server.js` so that `isEndpointAvailable(env.baseUrl, "/api/orders/export-batch")` succeeds, immediately converting the skipped test `F11: Order Batch Generation & Discrepancy Highlighting` in `test/e2e/tier1-feature-coverage.test.js` into an active, passing verification test.

---

## 2. Current State Inspection & Baseline Findings

### 2.1 Existing MCP Tools in `src/server.js`

Inspection of `src/server.js` reveals an MCP server configured with `@modelcontextprotocol/sdk` (v1.20.2) and `@modelcontextprotocol/ext-apps` (v1.0.1) mounted over Streamable HTTP transport at `/mcp`:

| # | Tool / Resource | Registration Type | Input Schema (Zod) | Current Functionality |
|---|-----------------|-------------------|--------------------|-----------------------|
| 1 | `panelph-order-desk` | Resource (`registerAppResource`) | `ui://panelph/order-desk.html` | Serves HTML/CSS/JS frontend desk for ChatGPT widget display. |
| 2 | `get_order_draft` | Tool (`registerAppTool`) | `{}` | Returns draft state (`items`, `events`, `status`, `summary`). |
| 3 | `add_order_need` | Tool (`registerAppTool`) | `{ name, quantity, unit?, note? }` | Appends free-text need without catalog lookup (`status: "needs_completion"`). |
| 4 | `update_order_need` | Tool (`registerAppTool`) | `{ id, name?, quantity?, unit?, note? }` | Modifies item properties and records `need_updated` event. |
| 5 | `resolve_order_need` | Tool (`registerAppTool`) | `{ id, reference: { title, genericCode?, ... } }` | Attaches catalog reference, moves item to `ready_for_review`. |
| 6 | `revert_order_event` | Tool (`registerAppTool`) | `{ eventId }` | Appends compensating `event_reverted` event. |
| 7 | `render_order_desk` | Tool (`registerAppTool`) | `{}` | Global entrypoint launching UI widget inside ChatGPT container. |

**Observation**: Noticeably absent from `src/server.js` are tools for catalog searching, stock queries, and batch order export, which are required by Feature F10 and Feature F11 in `PROJECT.md`.

### 2.2 Baseline Test Suite Status

Executing `npm test` across the test suite produces the following verified baseline:
- Total tests: **85**
- Passing: **83**
- Failing: **0**
- Skipped: **2**
  1. `F9: Operational REST API endpoints (/api/draft/*)` (line 203 of `test/e2e/tier1-feature-coverage.test.js`)
  2. `F11: Order Batch Generation & Discrepancy Highlighting` (line 295 of `test/e2e/tier1-feature-coverage.test.js`)

### 2.3 Root Cause of Skipped F11 Test

In `test/e2e/tier1-feature-coverage.test.js` (lines 295–309):
```javascript
await t.test("F11: Order Batch Generation & Discrepancy Highlighting", async (t) => {
  const hasBatchExport = await isEndpointAvailable(env.baseUrl, "/api/orders/export-batch");
  if (!hasBatchExport && !process.env.PANELPH_E2E_STRICT) {
    t.skip("Batch export endpoint /api/orders/export-batch not yet mounted (Milestone 2 dependency)");
    return;
  }
  // Try exporting draft with ambiguous items -> should flag discrepancies
  await env.mcpClient.callTool("add_order_need", { name: "مورد مبهم", quantity: 1 });
  const exportRes = await env.restClient.post("/api/orders/export-batch", {
    draftId: "current-order-draft",
  });
  assert.equal(exportRes.status, 200);
  assert.ok(exportRes.body.discrepancies?.length > 0, "Unresolved items must be flagged as discrepancies");
});
```

And in `test/e2e/test-helper.js` (lines 51–59):
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

In `src/server.js` (lines 155–168):
- Currently, `OPTIONS` is handled **only** when `url.pathname === mcpPath` (`/mcp`).
- Any `OPTIONS` request to `/api/orders/export-batch` falls through to the 404 handler.
- Therefore, `isEndpointAvailable(env.baseUrl, "/api/orders/export-batch")` receives 404 and returns `false`, skipping `F11`.
- **Key Insight**: To enable `F11`, the server must handle `OPTIONS` for all `/api/*` routes and return HTTP 204 with CORS headers, in addition to implementing `POST /api/orders/export-batch`.

---

## 3. Discrepancy Highlighting Engine Specification

The discrepancy highlighting engine is the core validation barrier between local draft state and external order placement in Qanoon ERP. It enforces pharmacy safety, inventory availability, and pricing transparency before any order batch is exported.

### 3.1 Four-Tier Discrepancy Taxonomy

| Tier | Category | Severity | Detection Rule | Verbatim Message Format | Action |
|---|---|---|---|---|---|
| **Tier 1** | **Empty Draft** | BLOCKING | `draft.items.length === 0` | `"پیش‌نویس سفارش خالی است و هیچ ردیف نیازی برای صدور ثبت نشده است."` | Blocks submission; returns `batch: null`. |
| **Tier 2** | **Ambiguity & Unresolved Needs** | BLOCKING | `item.status !== "ready_for_review"` OR `item.resolvedReference === null` OR `!item.resolvedReference.title` | `"قلم '${item.freeTextName}' (${item.id}) تعیین هویت نشده و فاقد کالای مرجع تأییدشده است."` | Blocks submission; returns `batch: null` with each ambiguous item listed. |
| **Tier 3** | **Inventory Shortages & Stockout** | BLOCKING | Evaluated via `adapter.checkBatchStock({ warehouseId, items })`. Item has `inStock === false`. | `"کسری موجودی برای ${title}: درخواستی ${requested}، موجود ${availableCount}"` | Blocks submission; returns `batch: null`. |
| **Tier 4** | **Pricing Divergence & Warnings** | ADVISORY | Evaluated via `adapter.calculatePrice({ goodId, quantity, roundingRule, warehouseId })`. Warnings array returned by adapter (e.g. TTAC divergence > 10,000 Rials, tempPrice used). | `"هشدار قیمت برای ${title}: ${warningMessage}"` (e.g. `Price divergence: TTAC price (...) differs from Qanoon price (...) by more than 10,000 Rials.`) | Highlighted in discrepancies array. If Tiers 1-3 pass, order submission may proceed with warnings recorded. |

### 3.2 Decision Gate & Execution Flow

```
                      ┌────────────────────────────────┐
                      │ POST /api/orders/export-batch  │
                      │  or export_order_batch Tool    │
                      └───────────────┬────────────────┘
                                      ▼
                      ┌────────────────────────────────┐
                      │ 1. Load Draft State            │
                      │    draft = store.getDraft()    │
                      └───────────────┬────────────────┘
                                      ▼
                       /──────────────────────────────\
                      <   Is draft.items.length === 0? >
                       \──────────────────────────────/
                               /              \
                        Yes   /                \  No
                             ▼                  ▼
               ┌───────────────────────┐ ┌────────────────────────────────┐
               │ Flag Empty Draft      │ │ 2. Check Item Resolution       │
               │ (Category 1)          │ │    Filter unresolved items     │
               └───────────┬───────────┘ └──────────────┬─────────────────┘
                           │                            ▼
                           │              /──────────────────────────────\
                           │             <   Any unresolved items exist?  >
                           │              \──────────────────────────────/
                           │                      /              \
                           │               Yes   /                \  No
                           │                    ▼                  ▼
                           │      ┌───────────────────────┐ ┌────────────────────────────────┐
                           │      │ Flag Ambiguities      │ │ 3. Stage 2 Stock Barrier       │
                           │      │ (Category 2)          │ │    adapter.checkBatchStock()   │
                           │      └───────────┬───────────┘ └──────────────┬─────────────────┘
                           │                  │                            ▼
                           │                  │              /──────────────────────────────\
                           │                  │             <   Any items out of stock?      >
                           │                  │              \──────────────────────────────/
                           │                  │                      /              \
                           │                  │               Yes   /                \  No
                           │                  │                    ▼                  ▼
                           │                  │      ┌───────────────────────┐ ┌────────────────────────────────┐
                           │                  │      │ Flag Stock Shortages  │ │ 4. 7-Step Pricing Calculation  │
                           │                  │      │ (Category 3)          │ │    adapter.calculatePrice()    │
                           │                  │      └───────────┬───────────┘ └──────────────┬─────────────────┘
                           │                  │                  │                            ▼
                           │                  │                  │              /──────────────────────────────\
                           │                  │                  │             <   Check Pricing Warnings       >
                           │                  │                  │              \──────────────────────────────/
                           │                  │                  │                      /              \
                           │                  │                  │            Warnings /                \ Clean
                           │                  │                  │                    ▼                  │
                           │                  │                  │      ┌───────────────────────┐        │
                           │                  │                  │      │ Flag Price Divergence │        │
                           │                  │                  │      │ (Category 4 Advisory) │        │
                           │                  │                  │      └───────────┬───────────┘        │
                           │                  │                  │                  │                    │
                           ▼                  ▼                  ▼                  ▼                    ▼
                      /───────────────────────────────────────────────────────────────────\
                     <       Are there any BLOCKING discrepancies (Tiers 1, 2, or 3)?      >
                      \───────────────────────────────────────────────────────────────────/
                                           /                                 \
                                    Yes   /                                   \  No
                                         ▼                                     ▼
                      ┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
                      │ HALT ORDER SUBMISSION                │  │ PROCEED TO IDEMPOTENT BATCH ORDER    │
                      │ Return HTTP 200:                     │  │ Call adapter.createBatchOrder()      │
                      │ {                                    │  │ Return HTTP 200:                     │
                      │   success: false,                    │  │ {                                    │
                      │   batch: null,                       │  │   success: true,                     │
                      │   status: "DISCREPANCIES_DETECTED",  │  │   status: "SUBMITTED" | "CACHED",    │
                      │   discrepancies: [...],              │  │   batch: { batchId, uniqueId, ... }, │
                      │   summary: { ... }                   │  │   discrepancies: [...advisories],    │
                      │ }                                    │  │   pricingSummary: { ... }            │
                      └──────────────────────────────────────┘  │ }                                    │
                                                                └──────────────────────────────────────┘
```

---

## 4. Exported Batch Data Structure & Adapter Integration

### 4.1 Interface Contract with `QanoonAdapter.createBatchOrder`

The exported batch data structure must match the exact parameter schema expected by `src/adapters/qanoon-adapter.js` (lines 435–520):

```javascript
adapter.createBatchOrder({
  draftId: string,          // e.g. "current-order-draft"
  uniqueId: string,         // e.g. "ord-current-order-draft-1728900000000"
  warehouseId: string,      // default "main"
  notes: string,            // optional pharmacist notes
  items: Array<{
    goodId: string,         // Qanoon internal good ID (e.g. "g-1001")
    genericCode: string,    // EXACT string with leading zeroes preserved (e.g. "00001")
    brandCode?: string,     // EXACT string with leading zeroes preserved (e.g. "00001")
    title?: string,         // Medicine title
    quantity: number,       // Positive number of units
    price: number,          // Calculated final price from calculatePrice
    unitPrice?: number,     // Unit base price
  }>
})
```

### 4.2 Good ID Resolution Strategy

In `draft-store.js`, items resolved via `resolveNeed({ id, reference })` store:
```javascript
{
  title: string,
  genericCode: string,
  brandCode: string,
  dosageForm: string,
  strength: string,
  // Note: goodId might or might not be in reference depending on caller
}
```
During batch export:
1. If `reference.goodId` is present, use it directly.
2. If `reference.goodId` is absent, look up the good via `adapter.searchGoods({ query: reference.genericCode, limit: 10 })` or `catalogResolver.resolveItem`.
3. Match against `genericCode` (and `brandCode` if present) to extract `good.goodId`.
4. If no good match is found in the catalog, append a Category 2/4 discrepancy: `"شناسه معادل در قانون برای ${title} یافت نشد."` and treat as blocking.

### 4.3 24-Hour Idempotency Cycle

1. **UniqueId Generation**:
   - If caller supplies `uniqueId` in request, use it directly.
   - If `uniqueId` is omitted, generate a deterministic uniqueId: `ord-${draft.id}-${Date.now()}`.
2. **First Invocation**:
   - Adapter hashes the normalized payload (SHA-256).
   - Generates batch ID: `QAN-ORD-<timestamp>`.
   - Stores entry in in-memory 24-hour cache.
   - Returns `{ success: true, batchId, uniqueId, status: "SUBMITTED", isIdempotentReplay: false, ... }`.
3. **Replay (Network Retry)**:
   - If client retries with identical `uniqueId` and payload, adapter detects cached entry (within 24h).
   - Returns `{ ...cachedResponse, status: "CACHED", isIdempotentReplay: true }`.
4. **Conflict (Altered Payload with Same UniqueId)**:
   - If client submits identical `uniqueId` but with changed payload (e.g. different quantity or items), adapter throws `QanoonConflictError` (`UNIQUE_ID_PAYLOAD_MISMATCH`).
   - Server maps `QanoonConflictError` to HTTP 409 Conflict.

---

## 5. Expanded MCP Tools Specification

Feature F10 requires registering operational tools on `/mcp` via `@modelcontextprotocol/sdk`. Below are the complete specifications:

### 5.1 Tool: `search_catalog`

- **Identifier**: `search_catalog`
- **Title**: `جستجوی کاتالوگ داروها` (Search Medicine Catalog)
- **Description**: `جستجوی هوشمند در کاتالوگ رسمی داروها بر اساس نام ژنریک، نام تجاری، کد ژنریک یا بارکد با حفظ دقیق صفرهای اولیه کدهای رسمی.`
- **Input Schema (Zod v4)**:
  ```javascript
  {
    query: z.string().min(1).describe("متن جستجو یا کد دارو"),
    limit: z.number().int().positive().max(50).optional().default(20).describe("حداکثر تعداد نتایج"),
  }
  ```
- **Execution**:
  Calls `adapter.searchGoods({ query, limit })` (or `catalogResolver.searchCatalog(query)`).
- **Return Shape**:
  ```json
  {
    "content": [{ "type": "text", "text": "تعداد ۲ مورد در کاتالوگ یافت شد." }],
    "structuredContent": {
      "query": "امپرازول",
      "count": 2,
      "results": [
        {
          "goodId": "g-1005",
          "genericCode": "00025",
          "brandCode": "00010",
          "barcode": "6261001100059",
          "title": "Omeprazole 20mg Capsule",
          "persianTitle": "امپرازول ۲۰ میلی گرم",
          "dosageForm": "کپسول",
          "strength": "۲۰ میلی‌گرم",
          "sellPrice": 95000,
          "nonPharma": false
        }
      ]
    }
  }
  ```

### 5.2 Tool: `check_stock`

- **Identifier**: `check_stock`
- **Title**: `استعلام موجودی دارو در انبار` (Check Stock Availability)
- **Description**: `بررسی موجودی لحظه‌ای یک قلم دارو در انبار قانون (مرحله اول: استعلام مشورتی).`
- **Input Schema (Zod v4)**:
  ```javascript
  {
    goodId: z.string().optional().describe("شناسه یکتای کالا در قانون"),
    genericCode: z.string().optional().describe("کد ژنریک با حفظ صفر اولیه"),
    brandCode: z.string().optional().describe("کد برند با حفظ صفر اولیه"),
    warehouseId: z.string().optional().default("main").describe("شناسه انبار مورد نظر"),
    quantity: z.number().positive().optional().default(1).describe("تعداد درخواستی"),
  }
  ```
- **Execution**:
  Calls `adapter.checkStock({ goodId, genericCode, brandCode, warehouseId, requestedCount: quantity })`.
- **Return Shape**:
  ```json
  {
    "content": [{ "type": "text", "text": "کالا در انبار main موجود است (۱۴۰ عدد)." }],
    "structuredContent": {
      "stock": {
        "goodId": "g-1001",
        "genericCode": "00001",
        "brandCode": "00001",
        "warehouseId": "main",
        "requestedCount": 2,
        "availableCount": 140,
        "inStock": true,
        "stockStatus": "in_stock",
        "earliestExpDate": "2027-02-01",
        "advisoryWarning": null
      }
    }
  }
  ```

### 5.3 Tool: `export_order_batch`

- **Identifier**: `export_order_batch`
- **Title**: `صدور و بررسی نهایی بچ سفارش` (Export Order Batch)
- **Description**: `بررسی کامل پیش‌نویس، اعتبارسنجی موجودی در انبار، محاسبه قیمت نهایی طبق قواعد قانون، شناسایی مغایرت‌ها و ثبت بچ سفارش با شناسه یکتا.`
- **Input Schema (Zod v4)**:
  ```javascript
  {
    draftId: z.string().optional().default("current-order-draft").describe("شناسه پیش‌نویس"),
    warehouseId: z.string().optional().default("main").describe("شناسه انبار مقصد"),
    uniqueId: z.string().optional().describe("شناسه یکتای ارسال جهت رعایت اصل تکرارپذیری ۲۴ ساعته"),
    notes: z.string().optional().describe("یادداشت یا توضیحات سفارش"),
    roundingRule: z.enum(["round", "ceil", "floor"]).optional().default("round").describe("قاعده گرد کردن قیمت"),
  }
  ```
- **Execution**:
  Calls the shared `exportBatch` engine.
- **Return Shape**:
  ```json
  {
    "content": [{ "type": "text", "text": "بچ سفارش با شناسه QAN-ORD-1728900000000 صادر شد." }],
    "structuredContent": {
      "success": true,
      "status": "SUBMITTED",
      "batch": {
        "success": true,
        "batchId": "QAN-ORD-1728900000000",
        "uniqueId": "ord-current-order-draft-1728900000000",
        "timestamp": "2026-10-14T10:15:00.000Z",
        "status": "SUBMITTED",
        "isIdempotentReplay": false,
        "totalItems": 2,
        "totalPrice": 756400,
        "items": [...]
      },
      "uniqueId": "ord-current-order-draft-1728900000000",
      "discrepancies": [],
      "pricingSummary": {
        "totalBasePrice": 740000,
        "totalVat": 27300,
        "totalToll": 9100,
        "totalTechnicalFee": 0,
        "totalFinalPrice": 776400
      }
    }
  }
  ```

---

## 6. Dual-Protocol REST Alignment & Preflight Routing

To satisfy both web browser clients and automated E2E test runners (specifically `test/e2e/tier1-feature-coverage.test.js`), the following REST endpoints must be mounted in `src/server.js`:

| Route | Method | Payload / Query | Response Status | Response Schema |
|---|---|---|---|---|
| `/api/orders/export-batch` | `POST` | `{ draftId?, warehouseId?, uniqueId?, notes?, roundingRule? }` | `200` | `{ success: boolean, status: string, batch: object \| null, discrepancies: string[], uniqueId?: string, pricingSummary?: object, summary?: object }` |
| `/api/stock/check` | `POST` | `{ goodId?, genericCode?, brandCode?, warehouseId?, quantity? }` | `200` | `{ goodId, genericCode, brandCode, warehouseId, inStock, availableCount, stockStatus, advisoryWarning }` |
| `/api/catalog/search` | `GET` | `?q={query}&limit={limit}` | `200` | `{ query: string, count: number, results: Array<GoodsResult> }` |

### Critical Fix: Universal CORS & Preflight (`OPTIONS`)

In `src/server.js`:
```javascript
// Universal CORS & Preflight Handler
if (request.method === "OPTIONS") {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, mcp-session-id, x-pharmacy-id, x-client-id, x-unique-id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  });
  return response.end();
}
```
This guarantees that `isEndpointAvailable(env.baseUrl, "/api/orders/export-batch")` receives HTTP 204 instead of 404, unblocking the execution of test `F11`.

---

## 7. Concrete Implementation Blueprints for M2 Worker

### 7.1 Modular Batch Exporter (`src/batch-exporter.js`)

Below is the complete implementation for the batch export engine:

```javascript
/**
 * src/batch-exporter.js
 * 
 * Order Batch Export & Discrepancy Highlighting Engine
 * Validates draft completeness, checks warehouse inventory, calculates prices,
 * highlights discrepancies, and submits idempotent order batches to Qanoon.
 */

export async function exportBatch({
  draftId = "current-order-draft",
  warehouseId = "main",
  uniqueId = null,
  notes = "",
  roundingRule = "round",
  store,
  adapter,
}) {
  const draft = await store.getDraft();
  const discrepancies = [];

  // 1. Tier 1: Empty Draft Check
  if (!draft.items || draft.items.length === 0) {
    discrepancies.push("پیش‌نویس سفارش خالی است و هیچ ردیف نیازی برای صدور ثبت نشده است.");
    return {
      success: false,
      status: "EMPTY_DRAFT",
      batch: null,
      discrepancies,
      summary: { totalItems: 0, resolvedItems: 0, unresolvedItems: 0, stockAvailable: false },
    };
  }

  // 2. Tier 2: Unresolved / Ambiguous Items Check
  const unresolvedItems = draft.items.filter(
    (item) => item.status !== "ready_for_review" || !item.resolvedReference || !item.resolvedReference.title
  );
  const resolvedItems = draft.items.filter(
    (item) => item.status === "ready_for_review" && item.resolvedReference && item.resolvedReference.title
  );

  for (const item of unresolvedItems) {
    discrepancies.push(
      `قلم '${item.freeTextName}' (${item.id}) تعیین هویت نشده و فاقد کالای مرجع تأییدشده است.`
    );
  }

  let batchStockResult = null;
  const pricedItems = [];
  const pricingWarnings = [];

  if (resolvedItems.length > 0) {
    // 3. Tier 3: Stage 2 Pre-Batch Stock Check
    const stockItems = resolvedItems.map((item) => ({
      goodId: item.resolvedReference.goodId,
      genericCode: item.resolvedReference.genericCode,
      brandCode: item.resolvedReference.brandCode,
      title: item.resolvedReference.title,
      requestedCount: item.quantity,
    }));

    batchStockResult = await adapter.checkBatchStock({
      warehouseId,
      items: stockItems,
    });

    if (batchStockResult?.discrepancies?.length > 0) {
      discrepancies.push(...batchStockResult.discrepancies);
    }

    // 4. Tier 4: Pricing Calculation & TTAC Divergence Check
    for (const item of resolvedItems) {
      let goodId = item.resolvedReference.goodId;

      // Fallback lookup for goodId if absent
      if (!goodId && item.resolvedReference.genericCode) {
        try {
          const matches = await adapter.searchGoods({
            query: item.resolvedReference.genericCode,
            limit: 5,
          });
          const match = matches.find((m) =>
            m.genericCode === item.resolvedReference.genericCode &&
            (!item.resolvedReference.brandCode || m.brandCode === item.resolvedReference.brandCode)
          ) || matches[0];
          if (match) goodId = match.goodId;
        } catch {
          // Ignore lookup failure, handled below
        }
      }

      if (goodId) {
        try {
          const pricing = await adapter.calculatePrice({
            goodId,
            quantity: item.quantity,
            roundingRule,
            warehouseId,
          });
          pricedItems.push({ item, goodId, pricing });

          if (Array.isArray(pricing.warnings) && pricing.warnings.length > 0) {
            pricingWarnings.push(
              ...pricing.warnings.map(
                (w) => `هشدار قیمت برای ${item.resolvedReference.title}: ${w}`
              )
            );
          }
        } catch (err) {
          discrepancies.push(`خطا در استعلام قیمت برای ${item.resolvedReference.title}: ${err.message}`);
        }
      } else {
        discrepancies.push(
          `شناسه معادل در قانون برای ${item.resolvedReference.title} یافت نشد.`
        );
      }
    }
  }

  if (pricingWarnings.length > 0) {
    discrepancies.push(...pricingWarnings);
  }

  // 5. Decision Gate: Block on Tiers 1-3 issues
  const hasBlockingIssues =
    unresolvedItems.length > 0 ||
    (batchStockResult && !batchStockResult.allAvailable) ||
    pricedItems.length !== resolvedItems.length;

  if (hasBlockingIssues) {
    return {
      success: false,
      status: "DISCREPANCIES_DETECTED",
      batch: null,
      discrepancies,
      summary: {
        totalItems: draft.items.length,
        resolvedItems: resolvedItems.length,
        unresolvedItems: unresolvedItems.length,
        stockAvailable: batchStockResult ? batchStockResult.allAvailable : false,
      },
    };
  }

  // 6. Idempotent Submission via Qanoon Adapter
  const finalUniqueId = uniqueId || `ord-${draft.id}-${Date.now()}`;
  const batchOrderItems = pricedItems.map(({ item, goodId, pricing }) => ({
    goodId,
    genericCode: item.resolvedReference.genericCode,
    brandCode: item.resolvedReference.brandCode,
    title: item.resolvedReference.title,
    quantity: item.quantity,
    price: pricing.finalPrice,
    unitPrice: pricing.unitBasePrice,
  }));

  const batchResponse = await adapter.createBatchOrder({
    draftId,
    uniqueId: finalUniqueId,
    warehouseId,
    notes,
    items: batchOrderItems,
  });

  return {
    success: true,
    status: batchResponse.status, // "SUBMITTED" or "CACHED"
    batch: batchResponse,
    uniqueId: finalUniqueId,
    discrepancies,
    pricingSummary: {
      totalBasePrice: pricedItems.reduce((acc, p) => acc + (p.pricing.basePrice || 0), 0),
      totalVat: pricedItems.reduce((acc, p) => acc + (p.pricing.vatAmount || 0), 0),
      totalToll: pricedItems.reduce((acc, p) => acc + (p.pricing.tollAmount || 0), 0),
      totalTechnicalFee: pricedItems.reduce((acc, p) => acc + (p.pricing.technicalFee || 0), 0),
      totalFinalPrice: pricedItems.reduce((acc, p) => acc + (p.pricing.finalPrice || 0), 0),
    },
    summary: {
      totalItems: draft.items.length,
      resolvedItems: resolvedItems.length,
      unresolvedItems: 0,
      stockAvailable: true,
    },
  };
}
```

### 7.2 Integration into `src/server.js`

```javascript
// At top of src/server.js:
import { createQanoonAdapter } from "./adapters/qanoon-adapter.js";
import { exportBatch } from "./batch-exporter.js";

const adapter = createQanoonAdapter();

// Inside createPanelServer(store, adapter):
registerAppTool(
  server,
  "search_catalog",
  {
    title: "جستجوی کاتالوگ داروها",
    description: "جستجوی هوشمند در کاتالوگ رسمی داروها بر اساس نام ژنریک، نام تجاری، کد ژنریک یا بارکد.",
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().positive().max(50).optional().default(20),
    },
    _meta: { ui: { visibility: ["model", "app"] } },
  },
  async ({ query, limit = 20 }) => {
    const results = await adapter.searchGoods({ query, limit });
    return {
      content: [{ type: "text", text: `تعداد ${results.length} مورد در کاتالوگ یافت شد.` }],
      structuredContent: { query, count: results.length, results },
    };
  }
);

registerAppTool(
  server,
  "check_stock",
  {
    title: "استعلام موجودی دارو در انبار",
    description: "بررسی موجودی لحظه‌ای یک قلم دارو در انبار قانون (مرحله اول: استعلام مشورتی).",
    inputSchema: {
      goodId: z.string().optional(),
      genericCode: z.string().optional(),
      brandCode: z.string().optional(),
      warehouseId: z.string().optional().default("main"),
      quantity: z.number().positive().optional().default(1),
    },
    _meta: { ui: { visibility: ["model", "app"] } },
  },
  async (args) => {
    const stock = await adapter.checkStock(args);
    return {
      content: [{ type: "text", text: stock.inStock ? `موجودی در انبار: ${stock.availableCount}` : stock.advisoryWarning }],
      structuredContent: { stock },
    };
  }
);

registerAppTool(
  server,
  "export_order_batch",
  {
    title: "صدور و بررسی نهایی بچ سفارش",
    description: "بررسی کامل پیش‌نویس، اعتبارسنجی موجودی در انبار، محاسبه قیمت نهایی طبق قواعد قانون، شناسایی مغایرت‌ها و ثبت بچ سفارش با شناسه یکتا.",
    inputSchema: {
      draftId: z.string().optional().default("current-order-draft"),
      warehouseId: z.string().optional().default("main"),
      uniqueId: z.string().optional(),
      notes: z.string().optional(),
      roundingRule: z.enum(["round", "ceil", "floor"]).optional().default("round"),
    },
    _meta: { ui: { visibility: ["model", "app"] } },
  },
  async (args) => {
    const result = await exportBatch({ ...args, store, adapter });
    const text = result.success
      ? `بچ سفارش صادر شد (شناسه بچ: ${result.batch?.batchId}).`
      : `صدور سفارش ناموفق بود: ${result.discrepancies.length} مغایرت شناسایی شد.`;
    return {
      content: [{ type: "text", text }],
      structuredContent: result,
    };
  }
);
```

### 7.3 REST Endpoint Handlers in `src/server.js`

```javascript
// Inside startServer httpServer request listener:

// CORS & Preflight
if (request.method === "OPTIONS") {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, mcp-session-id, x-pharmacy-id, x-client-id, x-unique-id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  });
  return response.end();
}

// REST: POST /api/orders/export-batch
if (request.method === "POST" && url.pathname === "/api/orders/export-batch") {
  response.setHeader("Access-Control-Allow-Origin", "*");
  const body = await parseJsonBody(request);
  const result = await exportBatch({ ...body, store, adapter });
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  return response.end(JSON.stringify(result));
}

// REST: POST /api/stock/check
if (request.method === "POST" && url.pathname === "/api/stock/check") {
  response.setHeader("Access-Control-Allow-Origin", "*");
  const body = await parseJsonBody(request);
  const stock = await adapter.checkStock(body);
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  return response.end(JSON.stringify(stock));
}

// REST: GET /api/catalog/search
if (request.method === "GET" && url.pathname === "/api/catalog/search") {
  response.setHeader("Access-Control-Allow-Origin", "*");
  const q = url.searchParams.get("q") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const results = await adapter.searchGoods({ query: q, limit });
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  return response.end(JSON.stringify({ query: q, count: results.length, results }));
}
```

---

## 8. Verification Strategy & Test Matrix

### 8.1 Verification Test Cases

| Test Case | Method / Endpoint | Scenario | Expected Outcome |
|---|---|---|---|
| **TC-01** | `POST /api/orders/export-batch` | Empty draft (`items: []`) | HTTP 200, `success: false`, `status: "EMPTY_DRAFT"`, `discrepancies.length > 0`. |
| **TC-02** | `POST /api/orders/export-batch` | Draft with unresolved item (`status: "needs_completion"`) | HTTP 200, `success: false`, `discrepancies` contains item name (activates and passes E2E `F11`). |
| **TC-03** | `POST /api/orders/export-batch` | Resolved draft with inventory shortage (e.g. 10x Cough Syrup `g-1004`) | HTTP 200, `success: false`, `discrepancies` mentions stock shortage. |
| **TC-04** | `POST /api/orders/export-batch` | Fully resolved draft with sufficient stock | HTTP 200, `success: true`, `status: "SUBMITTED"`, valid `batchId`, `discrepancies: []`. |
| **TC-05** | `POST /api/orders/export-batch` | Replay with identical `uniqueId` | HTTP 200, `success: true`, `status: "CACHED"`, `isIdempotentReplay: true`. |
| **TC-06** | `MCP tools/list` | List tools on `/mcp` | Returns 9 tools including `search_catalog`, `check_stock`, `export_order_batch`. |
| **TC-07** | `MCP callTool: export_order_batch` | Invocations match REST responses | Identical schema and discrepancy payload. |

### 8.2 Execution Command

```bash
cd /home/admin/PanelPH && npm test
```

Expected result after M2 Worker incorporates this design:
- **85 tests passing (100%), 0 skipped, 0 failing.**

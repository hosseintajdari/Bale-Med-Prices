# Milestone 2 Analysis: MCP Tools Expansion & Order Batch Export with Discrepancy Highlighting

**Author**: `m2_explorer_3`  
**Date**: 2026-10-14  
**Scope**: MCP Tools Expansion (`search_catalog`, `check_stock`, `export_order_batch`), Discrepancy Highlighting Engine, Batch Order Creation, 24-Hour Idempotency Integration, and REST Mirroring in `src/server.js`.

---

## 1. Executive Summary

Milestone 2 expands the PanelPH operational server (`src/server.js`) to support the full counter-to-export operational lifecycle. While Explorer 1 focuses on REST API routing and Explorer 2 focuses on catalog search scoring, this analysis establishes the contract, architectural pipeline, and implementation specifications for:
1. **Expanding MCP Tools**: Registering three new first-class operational tools (`search_catalog`, `check_stock`, `export_order_batch`) on `/mcp` via `@modelcontextprotocol/sdk` alongside the six pre-existing tools.
2. **Order Batch Export & Discrepancy Highlighting Engine**: Implementing an automated validation barrier that evaluates unresolved needs, runs Stage 2 pre-batch inventory checks via `adapter.checkBatchStock`, executes the 7-step pricing calculation with TTAC divergence guard (>10,000 Rial) via `adapter.calculatePrice`, and generates batch orders via `adapter.createBatchOrder` using a stable 24-hour `uniqueId`.
3. **Dual Protocol Alignment**: Ensuring the REST endpoint `POST /api/orders/export-batch` perfectly mirrors the MCP tool `export_order_batch`, satisfying automated test criteria in `test/e2e/tier1-feature-coverage.test.js` (F11) while preventing regressions on existing tests.

---

## 2. Inventory of Existing MCP Tools in `src/server.js`

Currently, `src/server.js` defines an MCP server using `@modelcontextprotocol/sdk` (v1.20.2) and `@modelcontextprotocol/ext-apps` (v1.0.1) with Streamable HTTP transport at `/mcp`.

| # | Tool / Resource Name | Type | Input Schema | Purpose & Return Shape |
|---|----------------------|------|--------------|------------------------|
| 1 | `panelph-order-desk` | App Resource | `ui://panelph/order-desk.html` | Serves the HTML/CSS/JS frontend widget for ChatGPT / browser embed. |
| 2 | `get_order_draft` | Tool | `{}` | Returns the active draft state (`id`, `status`, `items`, `events`, `summary`). |
| 3 | `add_order_need` | Tool | `{ name, quantity, unit?, note? }` | Appends a free-text need without forced catalog resolution. Sets status to `needs_completion`. |
| 4 | `update_order_need` | Tool | `{ id, name?, quantity?, unit?, note? }` | Modifies item properties. |
| 5 | `resolve_order_need` | Tool | `{ id, reference: { title, genericCode?, brandCode?, dosageForm?, strength? } }` | Attaches a confirmed catalog reference to a need, moving it to `ready_for_review`. Strictly preserves leading zeroes in string codes. |
| 6 | `revert_order_event` | Tool | `{ eventId }` | Appends a compensating `event_reverted` event restoring prior item state without mutating history. |
| 7 | `render_order_desk` | Tool | `{}` | Global entrypoint launching the order desk UI inside the ChatGPT host container. |

---

## 3. Specification for Expanded MCP Tools

To complete R2 and Feature F10 ("MCP Tools Expansion"), three additional tools must be registered:

### 3.1 `search_catalog`
- **MCP Identifier**: `search_catalog`
- **Title**: `جستجوی کاتالوگ داروها` (Search Medicine Catalog)
- **Description**: `جستجوی کاتالوگ داروها بر اساس نام فارسی، انگلیسی، کد ژنریک یا بارکد با حفظ دقیق صفر ابتدایی کدهای رسمی.`
- **Schema (Zod v4)**:
  ```javascript
  {
    query: z.string().min(1).describe("متن جستجو یا کد دارو"),
    limit: z.number().int().positive().max(50).optional().default(20).describe("حداکثر تعداد نتایج"),
  }
  ```
- **Metadata**: `_meta: { ui: { visibility: ["model", "app"] } }`
- **Handler Delegation**:
  Queries `catalogResolver.searchCatalog(query)` or `adapter.searchGoods({ query, limit })`.
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

### 3.2 `check_stock`
- **MCP Identifier**: `check_stock`
- **Title**: `استعلام موجودی دارو در انبار` (Check Stock Availability)
- **Description**: `بررسی موجودی لحظه‌ای یک قلم دارو در انبار قانون (مرحله اول: استعلام مشورتی).`
- **Schema (Zod v4)**:
  ```javascript
  {
    goodId: z.string().optional().describe("شناسه یکتای کالا در قانون"),
    genericCode: z.string().optional().describe("کد ژنریک با حفظ صفر اولیه"),
    brandCode: z.string().optional().describe("کد برند با حفظ صفر اولیه"),
    warehouseId: z.string().optional().default("main").describe("شناسه انبار مورد نظر"),
    quantity: z.number().positive().optional().default(1).describe("تعداد درخواستی"),
  }
  ```
- **Metadata**: `_meta: { ui: { visibility: ["model", "app"] } }`
- **Handler Delegation**:
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

### 3.3 `export_order_batch`
- **MCP Identifier**: `export_order_batch`
- **Title**: `صدور و بررسی نهایی بچ سفارش` (Export Order Batch)
- **Description**: `بررسی کامل پیش‌نویس، اعتبارسنجی موجودی در انبار، محاسبه قیمت نهایی طبق قواعد قانون، شناسایی مغایرت‌ها و ثبت بچ سفارش با شناسه یکتا.`
- **Schema (Zod v4)**:
  ```javascript
  {
    draftId: z.string().optional().default("current-order-draft").describe("شناسه پیش‌نویس"),
    warehouseId: z.string().optional().default("main").describe("شناسه انبار مقصد"),
    uniqueId: z.string().optional().describe("شناسه یکتای ارسال جهت رعایت اصل تکرارپذیری ۲۴ ساعته"),
    notes: z.string().optional().describe("یادداشت یا توضیحات سفارش"),
    roundingRule: z.enum(["round", "ceil", "floor"]).optional().default("round").describe("قاعده گرد کردن قیمت"),
  }
  ```
- **Metadata**: `_meta: { ui: { visibility: ["model", "app"] } }`
- **Handler Delegation**:
  Executes the Batch Export & Discrepancy Highlighting engine.

---

## 4. Architecture of the Order Batch Export & Discrepancy Highlighting Engine

### 4.1 Four-Category Discrepancy Taxonomy

The discrepancy highlighting engine systematically classifies issues into four categories:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Batch Export Validation Pipeline                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┼──────────────────────────────┐
    ▼                               ▼                              ▼
[Category 1: Ambiguity]   [Category 2: Inventory]      [Category 3: Financial]
Unresolved Needs          Pre-Batch Stock Shortage     TTAC Price Divergence
item.status !== "ready"   adapter.checkBatchStock      adapter.calculatePrice
!resolvedReference        inStock === false            |TTAC - Qan| > 10,000 Rial
(BLOCKING)                (BLOCKING)                   (WARNING / ADVISORY)
```

1. **Category 1: Ambiguity & Unresolved Needs (Blocking)**:
   - *Detection Rule*: Any item where `item.status !== "ready_for_review"` or `!item.resolvedReference || !item.resolvedReference.title`.
   - *Message Pattern*: `"قلم '${item.freeTextName}' (${item.id}) تعیین هویت نشده و فاقد کالای مرجع تأییدشده است."`
   - *Behavior*: Blocks submission to Qanoon. Returns HTTP 200 with `batch: null` and `discrepancies` populated.

2. **Category 2: Inventory Shortage & Expiration (Blocking)**:
   - *Detection Rule*: Evaluated across all resolved items via `adapter.checkBatchStock({ warehouseId, items })`.
   - *Message Pattern*:
     - Zero stock: `"کسری موجودی برای ${title}: درخواستی ${quantity}، موجود 0 (کالا در انبار موجود نیست)"`
     - Insufficient stock: `"کسری موجودی برای ${title}: درخواستی ${quantity}، موجود ${availableCount} (موجودی ناکافی)"`
     - Expired batch: `"تاریخ انقضای محموله دارویی برای ${title} به پایان رسیده است"`
   - *Behavior*: Blocks submission to Qanoon.

3. **Category 3: Price Divergence & Pricing Warnings (Advisory / Warning)**:
   - *Detection Rule*: Evaluated for each resolved item via 7-step pricing engine `adapter.calculatePrice({ goodId, quantity, roundingRule, warehouseId })`.
   - *TTAC Divergence Guard*: If $|\text{good.ttacPrice} - \text{unitBasePrice}| > 10,000\text{ Rials}$, adapter emits:
     `"Price divergence: TTAC price (...) differs from Qanoon price (...) by more than 10,000 Rials."`
   - *Temporary Price*: `"از قیمت موقت (tempPrice) استفاده شد چون sellPrice موجود نبود."`
   - *Behavior*: Highlighting warning included in `discrepancies` array for pharmacist visibility. If no blocking Category 1 or 2 issues exist, batch submission proceeds with warnings noted.

4. **Category 4: Data Validation & State Integrity (Blocking)**:
   - Empty draft (`items.length === 0`): `"پیش‌نویس سفارش خالی است و هیچ ردیف نیازی برای صدور ثبت نشده است."`
   - Unmapped `goodId`: Item has a genericCode but no matching record exists in the Qanoon catalog.

### 4.2 Step-by-Step Execution Sequence

```
1. Fetch Draft: draft = await store.getDraft(draftId)
2. Empty Check: if (!draft.items?.length) -> return { success: false, batch: null, discrepancies: [...] }
3. Check Ambiguities:
     unresolved = draft.items.filter(item => item.status !== "ready_for_review" || !item.resolvedReference)
     resolved   = draft.items.filter(item => item.status === "ready_for_review" && item.resolvedReference)
     add Category 1 messages to discrepancies
4. Stage 2 Stock Check:
     stockResult = await adapter.checkBatchStock({ warehouseId, items: resolved })
     add Category 2 messages to discrepancies
5. Price Calculation:
     for each item in resolved:
       priceInfo = await adapter.calculatePrice({ goodId, quantity, roundingRule, warehouseId })
       add Category 3 warnings to discrepancies
6. Decision Gate:
     if (unresolved.length > 0 || !stockResult.allAvailable || unpricedCount > 0) {
       return { success: false, batch: null, discrepancies, status: "DISCREPANCIES_DETECTED" }
     }
7. Idempotent Submission:
     finalUniqueId = uniqueId || `ord-${draft.id}-${Date.now()}`
     batch = await adapter.createBatchOrder({ draftId, uniqueId: finalUniqueId, warehouseId, notes, items })
     return { success: true, batch, uniqueId: finalUniqueId, discrepancies, pricingSummary }
```

### 4.3 24-Hour Idempotency Cycle via `uniqueId`

`QanoonAdapter.createBatchOrder` enforces 24-hour deduplication:
- **First Attempt**: Payload is hashed (SHA-256), cached in memory, and returns `status: "SUBMITTED"`, `batchId: "QAN-ORD-..."`.
- **Identical Replay (Within 24h)**: If caller retries with the same `uniqueId` and identical payload, returns `status: "CACHED"`, `isIdempotentReplay: true`. Prevents duplicate order placement in Qanoon ERP.
- **Divergent Replay**: If caller retries with the same `uniqueId` but altered payload (e.g. quantity changed), throws `QanoonConflictError` (`UNIQUE_ID_PAYLOAD_MISMATCH`). The server maps this to HTTP 409 Conflict.

---

## 5. Dual Protocol REST API Mirroring

In `src/server.js`, standard REST endpoints mirror the operational tools:

| Endpoint | Method | Input (JSON/Query) | Status | Output Envelope |
|---|---|---|---|---|
| `/api/catalog/search` | `GET` | `?q={query}&limit={limit}` | `200` | `{ results: Array<GoodsResult> }` |
| `/api/stock/check` | `POST` | `{ goodId?, genericCode?, brandCode?, warehouseId?, quantity? }` | `200` | `{ goodId, genericCode, inStock, availableCount, stockStatus, advisoryWarning }` |
| `/api/orders/export-batch` | `POST` | `{ draftId?, warehouseId?, uniqueId?, notes?, roundingRule? }` | `200` | `{ success: boolean, batch: object \| null, discrepancies: string[], pricingSummary?: object }` |

### Crucial Finding: HTTP Preflight (`OPTIONS`) in `src/server.js`

In `test/e2e/test-helper.js`:
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
Currently in `src/server.js` (lines 155–168), `OPTIONS` is handled **only** when `url.pathname === "/mcp"`. Any `OPTIONS` request to `/api/orders/export-batch` falls through to line 167 and returns `404 Not Found`, causing `isEndpointAvailable` to return `false` and skipping test F11!

**Resolution Requirement**:
The `OPTIONS` handler in `src/server.js` must handle all `/api/*` routes and `/mcp`, returning `204 No Content` with CORS headers (`Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS`).

---

## 6. Concrete Implementation Proposal

### 6.1 Order Batch Export Engine (`src/batch-exporter.js` or `src/server.js`)

```javascript
/**
 * Executes draft validation, Stage 2 stock barrier, 7-step pricing,
 * discrepancy compilation, and idempotent batch creation in Qanoon.
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

  if (!draft.items || draft.items.length === 0) {
    discrepancies.push("پیش‌نویس سفارش خالی است و هیچ ردیف نیازی برای صدور ثبت نشده است.");
    return {
      success: false,
      batch: null,
      discrepancies,
      summary: { totalItems: 0, resolvedItems: 0, unresolvedItems: 0 },
    };
  }

  // 1. Ambiguity Check (Category 1)
  const unresolvedItems = draft.items.filter(
    (item) => item.status !== "ready_for_review" || !item.resolvedReference
  );
  const resolvedItems = draft.items.filter(
    (item) => item.status === "ready_for_review" && item.resolvedReference
  );

  for (const item of unresolvedItems) {
    discrepancies.push(
      `قلم '${item.freeTextName}' (${item.id}) تعیین هویت نشده و نیازمند تکمیل است.`
    );
  }

  let batchStockResult = null;
  const pricedItems = [];
  const pricingWarnings = [];

  if (resolvedItems.length > 0) {
    // 2. Stage 2 Pre-Batch Stock Check (Category 2)
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

    // 3. Pricing Calculation & Divergence Checks (Category 3)
    for (const item of resolvedItems) {
      let goodId = item.resolvedReference.goodId;

      // Fallback lookup if goodId was not set during resolution
      if (!goodId && item.resolvedReference.genericCode) {
        const matches = await adapter.searchGoods({
          query: item.resolvedReference.genericCode,
          limit: 5,
        });
        const matched = matches.find((m) =>
          m.genericCode === item.resolvedReference.genericCode &&
          (!item.resolvedReference.brandCode || m.brandCode === item.resolvedReference.brandCode)
        ) || matches[0];
        if (matched) goodId = matched.goodId;
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

          if (pricing.warnings?.length > 0) {
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

  // 4. Decision Barrier: Can the batch order proceed?
  const hasBlockingIssues =
    unresolvedItems.length > 0 ||
    (batchStockResult && !batchStockResult.allAvailable) ||
    pricedItems.length !== resolvedItems.length;

  if (hasBlockingIssues) {
    return {
      success: false,
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

  // 5. Submit to Qanoon Adapter with Idempotent uniqueId
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
  };
}
```

### 6.2 Server Wiring in `src/server.js`

```javascript
// Import Qanoon Adapter
import { createQanoonAdapter } from "./adapters/qanoon-adapter.js";
const adapter = createQanoonAdapter();

// Register the 3 tools inside createPanelServer(store, adapter, catalogResolver):
registerAppTool(server, "search_catalog", { ... }, async ({ query, limit = 20 }) => {
  const results = await adapter.searchGoods({ query, limit });
  return {
    content: [{ type: "text", text: `تعداد ${results.length} مورد در کاتالوگ یافت شد.` }],
    structuredContent: { query, results },
  };
});

registerAppTool(server, "check_stock", { ... }, async (args) => {
  const stock = await adapter.checkStock(args);
  return {
    content: [{ type: "text", text: stock.inStock ? `موجودی: ${stock.availableCount}` : stock.advisoryWarning }],
    structuredContent: { stock },
  };
});

registerAppTool(server, "export_order_batch", { ... }, async (args) => {
  const result = await exportBatch({ ...args, store, adapter });
  return {
    content: [{ type: "text", text: result.discrepancies.length > 0 ? `مغایرت‌ها: ${result.discrepancies.length}` : `بچ صادر شد: ${result.batch?.batchId}` }],
    structuredContent: result,
  };
});

// In HTTP request listener:
// OPTIONS preflight for CORS & test-helper isEndpointAvailable
if (request.method === "OPTIONS") {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, mcp-session-id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  });
  return response.end();
}

// REST route: POST /api/orders/export-batch
if (request.method === "POST" && url.pathname === "/api/orders/export-batch") {
  const body = await parseJsonBody(request);
  const result = await exportBatch({ ...body, store, adapter });
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  return response.end(JSON.stringify(result));
}

// REST route: POST /api/stock/check
if (request.method === "POST" && url.pathname === "/api/stock/check") {
  const body = await parseJsonBody(request);
  const stock = await adapter.checkStock(body);
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  return response.end(JSON.stringify(stock));
}

// REST route: GET /api/catalog/search
if (request.method === "GET" && url.pathname === "/api/catalog/search") {
  const q = url.searchParams.get("q") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const results = await adapter.searchGoods({ query: q, limit });
  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  return response.end(JSON.stringify({ results }));
}
```

---

## 7. Verification & Test Plan

### Test Scenarios for M2 Integration (`test/server-rest.test.js` or `test/batch-export.test.js`)
1. **MCP Discovery**: `tools/list` on `/mcp` returns 9 tools total (existing 6 + `search_catalog` + `check_stock` + `export_order_batch`).
2. **MCP Tool Invocations**:
   - `search_catalog` with `"amoxicillin"` returns results preserving `"00001"`.
   - `check_stock` with `goodId: "g-1001"` returns `inStock: true`.
   - `export_order_batch` on ambiguous draft returns `discrepancies` array.
3. **REST Batch Export Validation**:
   - `POST /api/orders/export-batch` on empty draft -> returns 200 with empty draft discrepancy.
   - `POST /api/orders/export-batch` on draft with unresolved need -> returns 200 with unresolved discrepancy (satisfying Tier 1 F11 test).
   - `POST /api/orders/export-batch` on resolved draft with shortage (e.g. 10 bottles of Cough Syrup `g-1004` when only 2 in stock) -> returns 200 with shortage discrepancy.
   - `POST /api/orders/export-batch` on fully resolved in-stock draft -> returns 200, `success: true`, `status: "SUBMITTED"`, and non-empty `batchId`.
   - Replay with identical `uniqueId` -> returns 200, `success: true`, `status: "CACHED"`, `isIdempotentReplay: true`.
4. **Leading-Zero Integrity**: Verify `genericCode: "00001"` and `brandCode: "00001"` are never coerced to integers across all batch payloads and responses.
5. **Regression Verification**: Run `npm test` to ensure all 85 existing tests continue to pass and the 2 skipped tests (`F9` and `F11`) now pass 100%.

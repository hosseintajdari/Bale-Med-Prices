import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod/v4";
import { createOrderDraftStore } from "./draft-store.js";
import { createQanoonAdapter } from "./adapters/qanoon-adapter.js";
import { createCatalogResolver } from "./catalog-resolver.js";

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const widgetHtml = readFileSync(join(rootDirectory, "public", "order-desk.html"), "utf8");
export function wrapWithMutex(store) {
  return store;
}

const defaultStatePath = process.env.PANELPH_STATE_PATH ?? join(rootDirectory, "state", "order-draft.json");
const defaultStore = wrapWithMutex(createOrderDraftStore(defaultStatePath));
const defaultAdapter = createQanoonAdapter({ mockMode: true });
const defaultCatalogResolver = createCatalogResolver({ adapter: defaultAdapter });
const WIDGET_URI = "ui://panelph/order-desk.html";

const draftResult = (draft, text = "") => ({
  content: text ? [{ type: "text", text }] : [],
  structuredContent: { draft },
});

/**
 * Safely parse JSON body from incoming HTTP request.
 * Enforces 1MB size limit and catches malformed JSON.
 *
 * @param {import("node:http").IncomingMessage} request
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function readJsonBody(request, { maxBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytesReceived = 0;

    request.setEncoding("utf8");

    request.on("data", (chunk) => {
      bytesReceived += Buffer.byteLength(chunk);
      if (bytesReceived > maxBytes) {
        const err = new Error("Payload Too Large");
        err.statusCode = 413;
        err.code = "PAYLOAD_TOO_LARGE";
        request.destroy();
        reject(err);
        return;
      }
      body += chunk;
    });

    request.on("end", () => {
      const trimmed = body.trim();
      if (!trimmed) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed !== "object" || parsed === null) {
          const err = new Error("Request body must be a JSON object");
          err.statusCode = 400;
          err.code = "INVALID_JSON";
          reject(err);
          return;
        }
        resolve(parsed);
      } catch (parseError) {
        const err = new Error(`Malformed JSON: ${parseError.message}`);
        err.statusCode = 400;
        err.code = "INVALID_JSON";
        reject(err);
      }
    });

    request.on("error", (err) => reject(err));
  });
}

function sendJson(response, statusCode, data, headers = {}) {
  const json = JSON.stringify(data);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Location",
    ...headers,
  });
  response.end(json);
}

function sendError(response, statusCode, code, message) {
  sendJson(response, statusCode, {
    error: {
      code,
      message,
    },
  });
}

/**
 * Executes draft validation, Stage 2 stock barrier, 7-step pricing,
 * discrepancy compilation, and idempotent batch creation in Qanoon.
 */
export async function runExportBatch({
  draftId = "current-order-draft",
  warehouseId = "main",
  uniqueId = null,
  notes = "",
  roundingRule = "round",
  store,
  adapter,
  catalogResolver,
}) {
  const draft = await store.getDraft();
  const discrepancies = [];

  if (!draft.items || draft.items.length === 0) {
    discrepancies.push("پیش‌نویس سفارش خالی است و هیچ ردیف نیازی برای صدور ثبت نشده است.");
    return {
      success: false,
      batch: null,
      discrepancies,
      status: "DISCREPANCIES_DETECTED",
      summary: { totalItems: 0, resolvedItems: 0, unresolvedItems: 0 },
    };
  }

  // 1. Ambiguity Check (Category 1: Blocking)
  const unresolvedItems = draft.items.filter(
    (item) => item.status !== "ready_for_review" || !item.resolvedReference
  );
  const resolvedItems = draft.items.filter(
    (item) => item.status === "ready_for_review" && item.resolvedReference
  );

  for (const item of unresolvedItems) {
    discrepancies.push(
      `قلم '${item.freeTextName}' (${item.id}) تعیین تکلیف نشده است (فاقد کالای مرجع).`
    );
  }

  let batchStockResult = null;
  const pricedItems = [];
  const pricingWarnings = [];

  if (resolvedItems.length > 0) {
    // 2. Stage 2 Pre-Batch Stock Check (Category 2: Blocking)
    const stockItems = resolvedItems.map((item) => ({
      goodId: item.resolvedReference.goodId,
      genericCode: item.resolvedReference.genericCode,
      brandCode: item.resolvedReference.brandCode,
      title: item.resolvedReference.title,
      requestedCount: item.quantity,
    }));

    batchStockResult = await adapter.checkBatchStock({
      warehouseId: warehouseId || "main",
      items: stockItems,
    });

    if (batchStockResult?.discrepancies?.length > 0) {
      discrepancies.push(...batchStockResult.discrepancies);
    }

    // 3. Pricing Calculation & Divergence Checks (Category 3: Advisory)
    for (const item of resolvedItems) {
      let goodId = item.resolvedReference.goodId;

      if (!goodId && item.resolvedReference.genericCode) {
        if (catalogResolver && typeof catalogResolver.getGoodByCode === "function") {
          const match = await catalogResolver.getGoodByCode(
            item.resolvedReference.genericCode,
            item.resolvedReference.brandCode
          );
          if (match) goodId = match.goodId;
        }
        if (!goodId) {
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
      }

      if (goodId) {
        try {
          const pricing = await adapter.calculatePrice({
            goodId,
            quantity: item.quantity,
            roundingRule: roundingRule || "round",
            warehouseId: warehouseId || "main",
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

  // 4. Decision Gate: Check for blocking issues
  const hasBlockingIssues =
    unresolvedItems.length > 0 ||
    (batchStockResult && !batchStockResult.allAvailable) ||
    pricedItems.length !== resolvedItems.length;

  if (hasBlockingIssues) {
    return {
      success: false,
      batch: null,
      discrepancies,
      status: "DISCREPANCIES_DETECTED",
      summary: {
        totalItems: draft.items.length,
        resolvedItems: resolvedItems.length,
        unresolvedItems: unresolvedItems.length,
        stockAvailable: batchStockResult ? batchStockResult.allAvailable : false,
      },
    };
  }

  // 5. Submit to Qanoon Adapter with Idempotent uniqueId
  const finalUniqueId = uniqueId || `ord-${draft.id || "current-order-draft"}-${Date.now()}`;
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
    draftId: draft.id || "current-order-draft",
    uniqueId: finalUniqueId,
    warehouseId: warehouseId || "main",
    notes: notes || "",
    items: batchOrderItems,
  });

  return {
    success: true,
    batch: batchResponse,
    discrepancies,
    uniqueId: finalUniqueId,
    status: batchResponse.status,
    pricingSummary: {
      totalBasePrice: pricedItems.reduce((acc, p) => acc + (p.pricing.basePrice || 0), 0),
      totalVat: pricedItems.reduce((acc, p) => acc + (p.pricing.vatAmount || 0), 0),
      totalToll: pricedItems.reduce((acc, p) => acc + (p.pricing.tollAmount || 0), 0),
      totalTechnicalFee: pricedItems.reduce((acc, p) => acc + (p.pricing.technicalFee || 0), 0),
      totalFinalPrice: pricedItems.reduce((acc, p) => acc + (p.pricing.finalPrice || 0), 0),
    },
  };
}

export const exportBatch = runExportBatch;

export function createPanelServer(
  store = defaultStore,
  adapter = defaultAdapter,
  catalogResolver = defaultCatalogResolver
) {
  const server = new McpServer(
    { name: "panelph", version: "0.1.0" },
    {
      instructions:
        "PanelPH نگهدارنده پیش‌نویس سفارش است. ثبت نیاز آزاد را هرگز به تطبیق کاتالوگ مشروط نکنید. هیچ سفارش، پرداخت یا تغییر بیرونی انجام ندهید.",
    }
  );

  registerAppResource(server, "panelph-order-desk", WIDGET_URI, {}, async () => ({
    contents: [{
      uri: WIDGET_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: widgetHtml,
      _meta: {
        "openai/ui": { availableDisplayModes: ["inline", "fullscreen"] },
        "openai/widgetDescription": "میز سفارش PanelPH برای ثبت و بازبینی پیش‌نویس سفارش.",
      },
    }],
  }));

  registerAppTool(
    server,
    "get_order_draft",
    {
      title: "مشاهده پیش‌نویس سفارش",
      description: "پیش‌نویس پایدار سفارش و ابهام‌های آن را بدون تغییر برمی‌گرداند.",
      inputSchema: {},
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async () => draftResult(await store.getDraft())
  );

  registerAppTool(
    server,
    "add_order_need",
    {
      title: "افزودن نیاز به پیش‌نویس",
      description: "یک نیاز آزاد را با نام و تعداد در پیش‌نویس سفارش ذخیره می‌کند.",
      inputSchema: {
        name: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().optional(),
        note: z.string().optional(),
      },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async (args) => draftResult(await store.addNeed(args), "نیاز به پیش‌نویس اضافه شد.")
  );

  registerAppTool(
    server,
    "update_order_need",
    {
      title: "اصلاح نیاز پیش‌نویس",
      description: "نام، تعداد، واحد یا یادداشت یک نیاز موجود را اصلاح می‌کند.",
      inputSchema: {
        id: z.string().min(1),
        name: z.string().optional(),
        quantity: z.number().positive().optional(),
        unit: z.string().optional(),
        note: z.string().optional(),
      },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async (args) => draftResult(await store.updateNeed(args), "ردیف پیش‌نویس اصلاح شد.")
  );

  registerAppTool(
    server,
    "resolve_order_need",
    {
      title: "تأیید کالای دقیق",
      description: "یک نیاز آزاد را پس از تأیید کاربر با یک کالای مرجع مشخص پیوند می‌دهد.",
      inputSchema: {
        id: z.string().min(1),
        reference: z.object({
          title: z.string().min(1),
          genericCode: z.string().optional(),
          brandCode: z.string().optional(),
          dosageForm: z.string().optional(),
          strength: z.string().optional(),
        }),
      },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async (args) => draftResult(await store.resolveNeed(args), "کالای دقیق در پیش‌نویس تأیید شد.")
  );

  registerAppTool(
    server,
    "revert_order_event",
    {
      title: "بازگرداندن تغییر پیش‌نویس",
      description: "اثر یک رخداد ثبت‌شده را با ایجاد رخداد بازگردانی جدید برمی‌گرداند.",
      inputSchema: { eventId: z.string().min(1) },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async (args) => draftResult(await store.revertEvent(args), "تغییر انتخاب‌شده بازگردانده شد.")
  );

  registerAppTool(
    server,
    "render_order_desk",
    {
      title: "باز کردن میز سفارش PanelPH",
      description: "میز سفارش تعاملی PanelPH را در سایدبار ChatGPT باز می‌کند.",
      inputSchema: {},
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/ui": { entrypoints: [{ type: "global" }] },
      },
    },
    async () => draftResult(await store.getDraft(), "میز سفارش PanelPH آماده است.")
  );

  // M2 Expansion: search_catalog tool
  registerAppTool(
    server,
    "search_catalog",
    {
      title: "جستجوی کاتالوگ دارو",
      description: "جستجوی داروها در کاتالوگ با نام فارسی، انگلیسی، شکل، دوز یا کد ژنریک با حفظ دقیق صفر ابتدایی کدهای رسمی.",
      inputSchema: {
        query: z.string().min(1),
        limit: z.number().int().positive().max(100).optional(),
      },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async ({ query, limit = 20 }) => {
      const results = await catalogResolver.searchCatalog(query, { limit });
      return {
        content: [{ type: "text", text: `تعداد ${results.length} مورد در کاتالوگ یافت شد.` }],
        structuredContent: { query, count: results.length, results },
      };
    }
  );

  // M2 Expansion: check_stock tool
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
        warehouseId: z.string().optional(),
        quantity: z.number().positive().optional(),
      },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async ({ goodId, genericCode, brandCode, warehouseId = "main", quantity = 1 }) => {
      const stock = await adapter.checkStock({
        goodId,
        genericCode,
        brandCode,
        warehouseId,
        requestedCount: quantity,
      });
      return {
        content: [{
          type: "text",
          text: stock.inStock
            ? `کالا در انبار ${stock.warehouseId} موجود است (${stock.availableCount} عدد).`
            : (stock.advisoryWarning || "کالا موجود نیست."),
        }],
        structuredContent: { stock },
      };
    }
  );

  // M2 Expansion: export_order_batch tool
  registerAppTool(
    server,
    "export_order_batch",
    {
      title: "صدور و بررسی نهایی بچ سفارش",
      description: "بررسی کامل پیش‌نویس، اعتبارسنجی موجودی در انبار، محاسبه قیمت نهایی طبق قواعد قانون، شناسایی مغایرت‌ها و ثبت بچ سفارش با شناسه یکتا.",
      inputSchema: {
        draftId: z.string().optional(),
        warehouseId: z.string().optional(),
        uniqueId: z.string().optional(),
        notes: z.string().optional(),
        roundingRule: z.enum(["round", "ceil", "floor"]).optional(),
      },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async (args) => {
      const result = await runExportBatch({
        ...args,
        store,
        adapter,
        catalogResolver,
      });
      return {
        content: [{
          type: "text",
          text: result.discrepancies?.length > 0
            ? `تعداد مغایرت‌ها: ${result.discrepancies.length}`
            : `بچ سفارش صادر شد: ${result.batch?.batchId}`,
        }],
        structuredContent: result,
      };
    }
  );

  return server;
}

export function startServer({
  port = Number(process.env.PORT ?? 8787),
  statePath = process.env.PANELPH_STATE_PATH ?? join(rootDirectory, "state", "order-draft.json"),
  store: customStore = null,
  adapter: customAdapter = null,
  catalogResolver: customResolver = null,
} = {}) {
  const rawStore = customStore ?? createOrderDraftStore(statePath);
  const activeStore = wrapWithMutex(rawStore);
  const activeAdapter = customAdapter ?? createQanoonAdapter({ mockMode: true });
  const activeResolver = customResolver ?? createCatalogResolver({ adapter: activeAdapter });

  const mcpPath = "/mcp";
  const httpServer = createServer(async (request, response) => {
    try {
      if (!request.url) return response.writeHead(400).end("Missing URL");
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

      // 1. CORS Preflight Handler
      if (request.method === "OPTIONS") {
        if (url.pathname === mcpPath) {
          response.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "content-type, mcp-session-id",
            "Access-Control-Expose-Headers": "Mcp-Session-Id",
          });
          return response.end();
        }
        if (url.pathname.startsWith("/api/")) {
          response.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
            "Access-Control-Expose-Headers": "Location",
          });
          return response.end();
        }
        return response.writeHead(404).end("Not Found");
      }

      // 2. Static and Root Endpoints
      if (request.method === "GET" && url.pathname === "/") {
        return response.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("PanelPH MCP App");
      }
      if (request.method === "GET" && url.pathname === "/order-desk.html") {
        return response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(widgetHtml);
      }

      // 3. MCP Streamable HTTP Transport
      if (url.pathname === mcpPath) {
        const mcpMethods = new Set(["POST", "GET", "DELETE"]);
        if (!mcpMethods.has(request.method ?? "")) {
          return response.writeHead(404).end("Not Found");
        }

        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
        const server = createPanelServer(activeStore, activeAdapter, activeResolver);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        response.on("close", () => {
          transport.close();
          server.close();
        });
        try {
          await server.connect(transport);
          await transport.handleRequest(request, response);
        } catch (error) {
          console.error("PanelPH MCP request failed", error);
          if (!response.headersSent) response.writeHead(500).end("Internal server error");
        }
        return;
      }

      // 4. REST API Endpoints (/api/*)
      if (url.pathname.startsWith("/api/")) {
        // GET /api/draft
        if (request.method === "GET" && url.pathname === "/api/draft") {
          try {
            const draft = await activeStore.getDraft();
            return sendJson(response, 200, { draft });
          } catch (err) {
            return sendError(response, 500, "SERVER_ERROR", err.message);
          }
        }

        // POST /api/draft/needs
        if (request.method === "POST" && url.pathname === "/api/draft/needs") {
          let body;
          try {
            body = await readJsonBody(request);
          } catch (err) {
            return sendError(response, err.statusCode || 400, err.code || "INVALID_JSON", err.message);
          }

          if (typeof body.name !== "string" || !body.name.trim()) {
            return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز الزامی است.");
          }
          const name = body.name.trim();
          const quantity = Number(body.quantity);

          if (!Number.isFinite(quantity) || quantity <= 0) {
            return sendError(response, 400, "VALIDATION_ERROR", "تعداد باید عدد مثبت باشد.");
          }

          try {
            const draft = await activeStore.addNeed({
              name,
              quantity,
              unit: typeof body.unit === "string" ? body.unit : (body.unit != null ? String(body.unit) : ""),
              note: typeof body.note === "string" ? body.note : (body.note != null ? String(body.note) : ""),
            });
            const need = draft.items[draft.items.length - 1];
            return sendJson(response, 201, { draft, need }, {
              Location: `/api/draft/needs/${need.id}`,
            });
          } catch (err) {
            return sendError(response, 400, "VALIDATION_ERROR", err.message);
          }
        }

      // PATCH /api/draft/needs/:needId
      const updateMatch = url.pathname.match(/^\/api\/draft\/needs\/([^/]+)$/);
      if (request.method === "PATCH" && updateMatch) {
        const needId = updateMatch[1];
        let body;
        try {
          body = await readJsonBody(request);
        } catch (err) {
          return sendError(response, err.statusCode || 400, err.code || "INVALID_JSON", err.message);
        }

        if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
          return sendError(response, 400, "VALIDATION_ERROR", "نام نیاز نمی‌تواند خالی باشد.");
        }
        if (body.quantity !== undefined) {
          const qty = Number(body.quantity);
          if (!Number.isFinite(qty) || qty <= 0) {
            return sendError(response, 400, "VALIDATION_ERROR", "تعداد باید عدد مثبت باشد.");
          }
        }

        try {
          const draft = await activeStore.updateNeed({
            id: needId,
            name: typeof body.name === "string" ? body.name.trim() : body.name,
            quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
            unit: body.unit !== undefined ? (typeof body.unit === "string" ? body.unit : String(body.unit)) : undefined,
            note: body.note !== undefined ? (typeof body.note === "string" ? body.note : String(body.note)) : undefined,
          });
          return sendJson(response, 200, { draft });
        } catch (err) {
          if (err.message.includes("پیدا نشد")) {
            return sendError(response, 404, "NOT_FOUND", err.message);
          }
          return sendError(response, 400, "VALIDATION_ERROR", err.message);
        }
      }

      // POST /api/draft/needs/:needId/resolve
      const resolveMatch = url.pathname.match(/^\/api\/draft\/needs\/([^/]+)\/resolve$/);
      if (request.method === "POST" && resolveMatch) {
        const needId = resolveMatch[1];
        let body;
        try {
          body = await readJsonBody(request);
        } catch (err) {
          return sendError(response, err.statusCode || 400, err.code || "INVALID_JSON", err.message);
        }

        const ref = body.reference;
        if (!ref || typeof ref !== "object" || typeof ref.title !== "string" || !ref.title.trim()) {
          return sendError(response, 400, "VALIDATION_ERROR", "عنوان کالای مرجع لازم است.");
        }

        const cleanRef = {
          title: ref.title.trim(),
          genericCode: ref.genericCode != null ? String(ref.genericCode).trim() : "",
          brandCode: ref.brandCode != null ? String(ref.brandCode).trim() : "",
          dosageForm: ref.dosageForm != null ? String(ref.dosageForm).trim() : "",
          strength: ref.strength != null ? String(ref.strength).trim() : "",
          ...(ref.goodId ? { goodId: String(ref.goodId) } : {}),
        };

        try {
          const draft = await activeStore.resolveNeed({ id: needId, reference: cleanRef });
          return sendJson(response, 200, { draft });
        } catch (err) {
          if (err.message.includes("پیدا نشد")) {
            return sendError(response, 404, "NOT_FOUND", err.message);
          }
          return sendError(response, 400, "VALIDATION_ERROR", err.message);
        }
      }

      // POST /api/draft/revert
      if (request.method === "POST" && url.pathname === "/api/draft/revert") {
        let body;
        try {
          body = await readJsonBody(request);
        } catch (err) {
          return sendError(response, err.statusCode || 400, err.code || "INVALID_JSON", err.message);
        }

        const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
        if (!eventId) {
          return sendError(response, 400, "VALIDATION_ERROR", "شناسه رخداد الزامی است.");
        }

        try {
          const draft = await activeStore.revertEvent({ eventId });
          return sendJson(response, 200, { draft });
        } catch (err) {
          if (err.message.includes("پیدا نشد")) {
            return sendError(response, 404, "NOT_FOUND", err.message);
          }
          return sendError(response, 400, "REVERT_ERROR", err.message);
        }
      }

      // GET /api/catalog/search
      if (request.method === "GET" && url.pathname === "/api/catalog/search") {
        const query = url.searchParams.get("q") ?? "";
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 20)));
        try {
          const results = await activeResolver.searchCatalog(query, { limit });
          return sendJson(response, 200, { results });
        } catch (err) {
          return sendError(response, 500, "CATALOG_ERROR", err.message);
        }
      }

      // POST /api/stock/check
      if (request.method === "POST" && url.pathname === "/api/stock/check") {
        let body;
        try {
          body = await readJsonBody(request);
        } catch (err) {
          return sendError(response, err.statusCode || 400, err.code || "INVALID_JSON", err.message);
        }

        try {
          const stock = await activeAdapter.checkStock({
            goodId: body.goodId,
            genericCode: body.genericCode,
            brandCode: body.brandCode,
            warehouseId: body.warehouseId || "main",
            requestedCount: Number(body.requestedCount || body.quantity || 1),
          });
          return sendJson(response, 200, stock);
        } catch (err) {
          return sendError(response, err.statusCode || 500, err.code || "STOCK_CHECK_ERROR", err.message);
        }
      }

      // POST /api/orders/export-batch
      if (request.method === "POST" && url.pathname === "/api/orders/export-batch") {
        let body;
        try {
          body = await readJsonBody(request);
        } catch (err) {
          return sendError(response, err.statusCode || 400, err.code || "INVALID_JSON", err.message);
        }

        try {
          const result = await runExportBatch({
            draftId: body.draftId,
            warehouseId: body.warehouseId,
            uniqueId: body.uniqueId,
            notes: body.notes,
            roundingRule: body.roundingRule,
            store: activeStore,
            adapter: activeAdapter,
            catalogResolver: activeResolver,
          });
          return sendJson(response, 200, result);
        } catch (err) {
          return sendError(response, err.statusCode || 500, err.code || "EXPORT_ERROR", err.message);
        }
      }

      // Fallback for unmatched /api/*
      return sendError(response, 404, "NOT_FOUND", "Endpoint not found");
    }

    // 5. Fallback for all other routes
    return response.writeHead(404).end("Not Found");
    } catch (unhandledError) {
      if (!response.headersSent) {
        return sendError(response, 500, "INTERNAL_SERVER_ERROR", unhandledError.message || "Internal server error");
      }
    }
  });

  return httpServer.listen(port, () => {
    console.log(`PanelPH MCP App listening at http://localhost:${port}${mcpPath}`);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();

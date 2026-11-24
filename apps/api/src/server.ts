import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pricingController } from "./controllers/pricing-controller.ts";
import { goodsController } from "./controllers/goods-controller.ts";
import { botController } from "./controllers/bot-controller.ts";
import { isPrescriptionRateLimited, isRateLimited } from "./rate-limiter.ts";
import {
  maybeRegisterTelegramWebhookOnStartup,
  telegramWebhookController
} from "./controllers/telegram-webhook-controller.ts";
import {
  maybeRegisterBaleWebhookOnStartup,
  baleWebhookController
} from "./controllers/bale-webhook-controller.ts";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const staticDirectory = path.resolve(currentDirectory, "../../web/static");

const staticFiles = new Map([
  ["/", { filePath: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app", { filePath: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.css", { filePath: "app.css", contentType: "text/css; charset=utf-8" }],
  ["/app.js", { filePath: "app.js", contentType: "text/javascript; charset=utf-8" }],
  [
    "/telegram-mini-app.css",
    { filePath: "telegram-mini-app.css", contentType: "text/css; charset=utf-8" }
  ],
  [
    "/telegram-surface.js",
    { filePath: "telegram-surface.js", contentType: "text/javascript; charset=utf-8" }
  ]
]);

// Fixes #35: Number("abc") is NaN and server.listen(NaN) throws at boot.
// Validate the port and fall back to 4000 with a warning instead.
function resolvePort() {
  const raw = process.env.PORT ?? "4000";
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    console.warn(`Invalid PORT "${raw}" — falling back to 4000.`);
    return 4000;
  }

  return parsed;
}

const port = resolvePort();

const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (!request.url) {
    response.statusCode = 400;
    response.end("Missing URL");
    return;
  }

  const requestPath = new URL(request.url, "http://localhost").pathname;

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  // Fixes #34: per-IP token bucket on the expensive endpoints so one client
  // cannot hammer search/pricing/bot lookups. The basket path is the one
  // exception (UserSim A5): it is keyed per basket instead of per IP,
  // because the bot layer calls it from a single host for every patient.
  const rateLimitedPaths = new Set([
    "/goods/search",
    "/bot/lookup",
    "/bot/select",
    "/pricing/calculate"
  ]);

  if (request.method !== "OPTIONS" && requestPath === "/bot/prescription") {
    if (isPrescriptionRateLimited(request)) {
      response.statusCode = 429;
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Retry-After", "60");
      response.end(JSON.stringify({ error: "Rate limit exceeded. Please retry shortly." }));
      return;
    }
  }

  if (request.method !== "OPTIONS" && rateLimitedPaths.has(requestPath)) {
    if (isRateLimited(request)) {
      response.statusCode = 429;
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Retry-After", "60");
      response.end(JSON.stringify({ error: "Rate limit exceeded. Please retry shortly." }));
      return;
    }
  }

  if (request.method === "GET") {
    const file = staticFiles.get(requestPath);

    if (file) {
      try {
        const content = await readFile(path.join(staticDirectory, file.filePath), "utf8");
        response.setHeader("Content-Type", file.contentType);
        response.end(content);
      } catch {
        response.statusCode = 500;
        response.end("Unable to load app");
      }

      return;
    }
  }

  if (request.method === "GET" && requestPath === "/health") {
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify({
        status: "ok",
        service: "bale-med-prices",
        timestamp: new Date().toISOString()
      })
    );
    return;
  }

  if (request.method === "POST" && requestPath === "/telegram/webhook") {
    await telegramWebhookController.handle(request, response);
    return;
  }

  if (request.method === "POST" && (requestPath === "/bale/webhook" || requestPath === "/webhook/bale")) {
    await baleWebhookController.handle(request, response);
    return;
  }

  // Fixes #39: routes match on the parsed pathname, not the raw URL, so
  // "/goods/searching" no longer routes to search and a query string or
  // trailing slash on a detail URL does not corrupt the id.
  if (request.method === "GET" && requestPath === "/goods/search") {
    await goodsController.search(request, response);
    return;
  }

  if (request.method === "GET" && requestPath === "/bot/lookup") {
    botController.lookup(request, response);
    return;
  }

  if (request.method === "GET" && requestPath === "/bot/select") {
    botController.select(request, response);
    return;
  }

  if (request.method === "GET" && requestPath === "/bot/prescription") {
    botController.prescription(request, response);
    return;
  }

  if (request.method === "GET" && requestPath.startsWith("/goods/")) {
    goodsController.getById(request, response);
    return;
  }

  if (request.method === "POST" && requestPath === "/pricing/calculate") {
    await pricingController.calculate(request, response);
    return;
  }

  if (request.method === "GET" && requestPath === "/pricing/cache/stats") {
    pricingController.cacheStats(request, response);
    return;
  }

  if (request.method === "POST" && requestPath === "/pricing/cache/clear") {
    pricingController.clearCache(request, response);
    return;
  }

  response.statusCode = 404;
  response.end("Not found");
});

export { server };

const isMain = Boolean(
  process.argv[1] &&
    (process.argv[1].endsWith("server.ts") ||
      process.argv[1].endsWith("server.js"))
);

if (isMain && process.env.NODE_ENV !== "test") {
  server.listen(port, () => {
    maybeRegisterTelegramWebhookOnStartup().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
    maybeRegisterBaleWebhookOnStartup().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
  });
}

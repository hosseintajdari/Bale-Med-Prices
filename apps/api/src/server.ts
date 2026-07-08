import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pricingController } from "./controllers/pricing-controller.ts";
import { goodsController } from "./controllers/goods-controller.ts";
import { botController } from "./controllers/bot-controller.ts";
import {
  maybeRegisterTelegramWebhookOnStartup,
  telegramWebhookController
} from "./controllers/telegram-webhook-controller.ts";

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

const port = Number(process.env.PORT ?? 4000);

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

  if (request.method === "POST" && requestPath === "/telegram/webhook") {
    await telegramWebhookController.handle(request, response);
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/goods/search")) {
    goodsController.search(request, response);
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/bot/lookup")) {
    botController.lookup(request, response);
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/bot/select")) {
    botController.select(request, response);
    return;
  }

  if (request.method === "GET" && request.url.startsWith("/goods/")) {
    goodsController.getById(request, response);
    return;
  }

  if (request.method === "POST" && request.url === "/pricing/calculate") {
    await pricingController.calculate(request, response);
    return;
  }

  response.statusCode = 404;
  response.end("Not found");
});

server.listen(port, () => {
  maybeRegisterTelegramWebhookOnStartup().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
  });
});

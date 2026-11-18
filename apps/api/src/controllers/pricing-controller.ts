import crypto from "node:crypto";
import { pricingService } from "../services/pricing-service.ts";
import { botResponsePresenter } from "../services/bot-response-presenter.ts";
import { priceCacheService } from "../services/price-cache-service.ts";

/**
 * Fixes #33: the cache-management endpoints are admin-only. Configure
 * ADMIN_TOKEN on the server and send it as the `x-admin-token` header.
 * Note: the header is deliberately NOT in Access-Control-Allow-Headers, so a
 * browser page on another origin cannot drive these endpoints.
 */
function getAdminToken() {
  return (process.env.ADMIN_TOKEN ?? "").trim();
}

function isAdminRequest(request) {
  const configured = getAdminToken();

  if (!configured) {
    return false;
  }

  const provided = request.headers?.["x-admin-token"];

  if (typeof provided !== "string" || provided.length === 0) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const configuredBuffer = Buffer.from(configured);

  return (
    providedBuffer.length === configuredBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, configuredBuffer)
  );
}

function sendAdminError(response) {
  const error = getAdminToken()
    ? { status: 403, message: "Invalid admin token" }
    : { status: 503, message: "Cache admin endpoints are disabled (ADMIN_TOKEN not configured)" };

  response.statusCode = error.status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ error: error.message }));
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function getRequestedFormat(url) {
  if (!url) {
    return undefined;
  }

  const parsed = new URL(url, "http://localhost");
  return parsed.searchParams.get("format") ?? undefined;
}

export const pricingController = {
  async calculate(request, response) {
    try {
      const payload = await readJsonBody(request);
      const format = payload.format ?? getRequestedFormat(request.url);
      const { format: _format, ...pricingInput } = payload;

      const cacheControl = request.headers?.["cache-control"] ?? "";
      const pragma = request.headers?.["pragma"] ?? "";

      // Fixes #50: any client could force recomputation by sending
      // Cache-Control: no-cache (a minor DoS assist). Cache bypass is now
      // honored for admin callers only.
      const wantsBypass =
        Boolean(payload.skipCache) ||
        cacheControl.includes("no-cache") ||
        pragma.includes("no-cache");
      const bypassCache = wantsBypass && isAdminRequest(request);

      const cacheKey = priceCacheService.createKey(pricingInput, format);

      if (!bypassCache) {
        const cached = priceCacheService.get(cacheKey);
        if (cached !== null && cached !== undefined) {
          response.setHeader("X-Cache", "HIT");
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(cached));
          return;
        }
      }

      const pricingResult = pricingService.calculate(pricingInput);
      const result =
        format === "telegram" ? botResponsePresenter.compactPricing(pricingResult) : pricingResult;

      if (!bypassCache) {
        priceCacheService.set(cacheKey, result);
      }

      response.setHeader("X-Cache", "MISS");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = error.statusCode ?? (error instanceof SyntaxError ? 400 : 500);
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error: error.message ?? "Unknown error"
        })
      );
    }
  },

  cacheStats(request, response) {
    if (!isAdminRequest(request)) {
      sendAdminError(response);
      return;
    }

    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(priceCacheService.getStats()));
  },

  clearCache(request, response) {
    if (!isAdminRequest(request)) {
      sendAdminError(response);
      return;
    }

    const cleared = priceCacheService.invalidate();
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ cleared }));
  }
};


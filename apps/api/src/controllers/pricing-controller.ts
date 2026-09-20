import { pricingService } from "../services/pricing-service.ts";
import { botResponsePresenter } from "../services/bot-response-presenter.ts";
import { priceCacheService } from "../services/price-cache-service.ts";

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
      const bypassCache =
        Boolean(payload.skipCache) ||
        cacheControl.includes("no-cache") ||
        pragma.includes("no-cache");

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
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(priceCacheService.getStats()));
  },

  clearCache(request, response) {
    const cleared = priceCacheService.invalidate();
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ cleared }));
  }
};


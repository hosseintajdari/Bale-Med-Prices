import { goodsService } from "../services/goods-service.ts";
import { RateLimitedError } from "../services/aggregator/types.ts";
import {
  formatPriceBlock,
  toPersianDigits
} from "../../../../packages/domain/src/format-price.ts";

function parseSearchRequest(url) {
  const parsed = new URL(url ?? "", "http://localhost");

  return {
    query:
      parsed.searchParams.get("q") ??
      parsed.searchParams.get("query") ??
      parsed.searchParams.get("term") ??
      "",
    format: parsed.searchParams.get("format") ?? "default"
  };
}

function buildTelegramSearchText(items, query) {
  if (items.length === 0) {
    return `برای «${query || "این جستجو"}» دارویی پیدا نشد.`;
  }

  const lines = [`🔍 ${query || "همه‌ی داروها"}`, `${toPersianDigits(items.length)} دارو پیدا شد.`, ""];

  items.slice(0, 5).forEach((item, index) => {
    if (index > 0) {
      lines.push("", "— — —", "");
    }
    lines.push(
      formatPriceBlock({
        productName: item.persianTitle || item.title,
        priceRial: item.consumerUnitPrice,
        sourceLabel: "",
        crawledAt: item.crawledAt
      })
    );
  });

  if (items.length > 5) {
    lines.push("", "نتیجه‌های بیشتری هم هست؛ جستجو را دقیق‌تر کنید.");
  }

  return lines.join("\n");
}

function toTelegramSearchResponse(result, query) {
  return {
    query,
    total: result.total,
    text: buildTelegramSearchText(result.items, query),
    copyReady: true,
    items: result.items.slice(0, 5).map((item) => ({
      id: item.id,
      title: item.title,
      persianTitle: item.persianTitle,
      consumerUnitPrice: item.consumerUnitPrice,
      unitLabel: item.unitLabel
    }))
  };
}

function sendJson(response, statusCode, payload, extraHeaders) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    response.setHeader(key, value);
  }
  response.end(JSON.stringify(payload));
}

export const goodsController = {
  /**
   * Local catalog first; empty local results fall back to the live web
   * price aggregator. Rate-limited sources → 429 so callers back off.
   */
  async search(request, response) {
    const input = parseSearchRequest(request.url);

    try {
      const searchResult = await goodsService.searchWithWebFallback({ query: input.query });
      const result =
        input.format === "telegram"
          ? toTelegramSearchResponse(searchResult, input.query)
          : searchResult;

      sendJson(response, 200, result, {
        "X-Search-Source": searchResult.webFallback ? "web-aggregator" : "catalog"
      });
    } catch (error) {
      if (error instanceof RateLimitedError) {
        sendJson(response, 429, {
          error: "A price source is rate-limiting us. Please retry shortly."
        });
        return;
      }
      sendJson(response, error.statusCode ?? 500, {
        error: error.message ?? "Search failed"
      });
    }
  },

  getById(request, response) {
    try {
      const id = request.url?.split("/").pop() ?? "";
      const result = goodsService.getById(id);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = error.statusCode ?? 500;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error: error.message ?? "Unknown error"
        })
      );
    }
  }
};

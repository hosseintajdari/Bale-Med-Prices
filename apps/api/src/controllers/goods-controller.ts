import { goodsService } from "../services/goods-service.ts";

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
    return `No medicine was found for: ${query || "your search"}`;
  }

  const lines = [`Search: ${query || "all medicines"}`, `Matches: ${items.length}`];

  for (const item of items.slice(0, 5)) {
    lines.push(
      `- ${item.title} | ${item.persianTitle} | ${item.unitLabel} | ${item.consumerUnitPrice}`
    );
  }

  if (items.length > 5) {
    lines.push("More results are available. Narrow the search query.");
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

export const goodsController = {
  search(request, response) {
    const input = parseSearchRequest(request.url);
    const searchResult = goodsService.search({ query: input.query });
    const result =
      input.format === "telegram" ? toTelegramSearchResponse(searchResult, input.query) : searchResult;

    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(result));
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

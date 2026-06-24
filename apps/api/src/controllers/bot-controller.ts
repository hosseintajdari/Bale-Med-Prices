import { botLookupService } from "../services/bot-lookup-service.ts";

export const botController = {
  lookup(request, response) {
    try {
      const url = new URL(request.url ?? "", "http://localhost");

      const result = botLookupService.lookup({
        query: url.searchParams.get("q") ?? url.searchParams.get("query") ?? "",
        documentDate: url.searchParams.get("documentDate") ?? undefined,
        quantity: url.searchParams.get("quantity") ?? undefined,
        warehouseId: url.searchParams.get("warehouseId") ?? undefined,
        includeTechnicalFee: url.searchParams.get("includeTechnicalFee") === "on"
      });

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
  },

  select(request, response) {
    try {
      const url = new URL(request.url ?? "", "http://localhost");
      const callbackData = url.searchParams.get("callbackData") ?? "";
      const callbackParts = callbackData.startsWith("ms:") ? callbackData.split(":") : [];
      const sessionId = url.searchParams.get("sessionId") ?? callbackParts[1] ?? "";
      const choiceId = url.searchParams.get("choiceId") ?? callbackParts.slice(2).join(":") ?? "";

      const result = botLookupService.select({
        sessionId,
        choiceId,
        documentDate: url.searchParams.get("documentDate") ?? undefined,
        quantity: url.searchParams.get("quantity") ?? undefined,
        warehouseId: url.searchParams.get("warehouseId") ?? undefined,
        includeTechnicalFee: url.searchParams.get("includeTechnicalFee") === "on"
      });

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

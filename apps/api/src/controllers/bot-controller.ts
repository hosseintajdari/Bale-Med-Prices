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
  }
};

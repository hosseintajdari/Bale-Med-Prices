import { parseMedicineSelectionCallbackData } from "./bot-callback-parser.ts";
import { botLookupService } from "../services/bot-lookup-service.ts";

function invalidCallbackDataError() {
  const error = new Error("Invalid callback data");
  error.statusCode = 400;
  return error;
}

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
      const callbackData = url.searchParams.get("callbackData");
      const callback = callbackData == null ? null : parseMedicineSelectionCallbackData(callbackData);

      if (callback && !callback.valid) {
        throw invalidCallbackDataError();
      }

      const sessionId = url.searchParams.get("sessionId") ?? callback?.sessionId ?? "";
      const choiceId = url.searchParams.get("choiceId") ?? callback?.choiceId ?? "";

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

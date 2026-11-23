import { parseMedicineSelectionCallbackData } from "./bot-callback-parser.ts";
import { botLookupService } from "../services/bot-lookup-service.ts";
import { prescriptionBasketService } from "../services/prescription-basket-service.ts";

function invalidCallbackDataError() {
  const error = new Error("Invalid callback data");
  error.statusCode = 400;
  return error;
}

function parseBotRequest(url) {
  return {
    query: url.searchParams.get("q") ?? url.searchParams.get("query") ?? "",
    documentDate: url.searchParams.get("documentDate") ?? undefined,
    quantity: url.searchParams.get("quantity") ?? undefined,
    warehouseId: url.searchParams.get("warehouseId") ?? undefined,
    includeTechnicalFee: url.searchParams.get("includeTechnicalFee") === "on",
    format: url.searchParams.get("format") ?? "default"
  };
}

export const botController = {
  lookup(request, response) {
    try {
      const url = new URL(request.url ?? "", "http://localhost");
      const result = botLookupService.lookup(parseBotRequest(url));

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

      // Fixes #38: explicit sessionId/choiceId query params used to silently
      // override the values parsed from Telegram callbackData, letting a
      // caller mix sessions. When valid callback data is present, its values
      // win; query params are only a fallback.
      const sessionId = callback?.sessionId ?? url.searchParams.get("sessionId") ?? "";
      const choiceId = callback?.choiceId ?? url.searchParams.get("choiceId") ?? "";

      const requestInput = parseBotRequest(url);
      const result = botLookupService.select({
        sessionId,
        choiceId,
        documentDate: requestInput.documentDate,
        quantity: requestInput.quantity,
        warehouseId: requestInput.warehouseId,
        includeTechnicalFee: requestInput.includeTechnicalFee,
        format: requestInput.format
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

  // «قیمت نسخه» module: one endpoint, action-dispatched, mirroring the
  // lookup/select style. Actions: start | add (q=…) | select (sessionId +
  // choiceId or callbackData) | remove (index) | view | finish.
  prescription(request, response) {
    try {
      const url = new URL(request.url ?? "", "http://localhost");
      const action = url.searchParams.get("action") ?? "start";
      const basketId = url.searchParams.get("basketId") ?? undefined;
      const documentDate = url.searchParams.get("documentDate") ?? undefined;

      let result;

      if (action === "start") {
        result = prescriptionBasketService.start({
          kind: url.searchParams.get("kind") ?? undefined
        });
      } else if (action === "add") {
        result = prescriptionBasketService.addQuery({
          basketId,
          query: url.searchParams.get("q") ?? url.searchParams.get("query") ?? "",
          documentDate
        });
      } else if (action === "select") {
        const callbackData = url.searchParams.get("callbackData");
        const callback =
          callbackData == null ? null : parseMedicineSelectionCallbackData(callbackData);

        if (callback && !callback.valid) {
          throw invalidCallbackDataError();
        }

        result = prescriptionBasketService.addSelect({
          basketId,
          sessionId: callback?.sessionId ?? url.searchParams.get("sessionId") ?? "",
          choiceId: callback?.choiceId ?? url.searchParams.get("choiceId") ?? "",
          documentDate
        });
      } else if (action === "remove") {
        result = prescriptionBasketService.remove({
          basketId,
          index: url.searchParams.get("index")
        });
      } else if (action === "remove_last") {
        result = prescriptionBasketService.removeLast({ basketId });
      } else if (action === "view") {
        result = prescriptionBasketService.view({ basketId });
      } else if (action === "finish") {
        result = prescriptionBasketService.finish({ basketId });
      } else {
        const error = new Error(`Unknown prescription action '${action}'`);
        error.statusCode = 400;
        throw error;
      }

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

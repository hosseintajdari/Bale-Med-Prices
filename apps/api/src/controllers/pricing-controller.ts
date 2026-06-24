import { pricingService } from "../services/pricing-service.ts";
import { botResponsePresenter } from "../services/bot-response-presenter.ts";

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
      const pricingResult = pricingService.calculate(pricingInput);
      const result =
        format === "telegram" ? botResponsePresenter.compactPricing(pricingResult) : pricingResult;

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

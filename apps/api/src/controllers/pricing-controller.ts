import { pricingService } from "../services/pricing-service.ts";

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
      const result = pricingService.calculate({
        ...payload,
        format: payload.format ?? getRequestedFormat(request.url)
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

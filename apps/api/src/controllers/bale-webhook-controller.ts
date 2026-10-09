import { loadBaleBotConfig } from "../../../bale-bot/src/config.ts";
import { processBaleUpdate } from "../../../bale-bot/src/process-update.ts";
import { registerBaleWebhook } from "../../../bale-bot/src/bale-bot-lib.ts";

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch (err) {
    if (err instanceof SyntaxError) {
      const syntaxError = new Error("Malformed JSON payload");
      (syntaxError as unknown as { statusCode: number }).statusCode = 400;
      throw syntaxError;
    }
    throw err;
  }
}

function getRequestHeader(request, name) {
  const value = request.headers[name];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export const baleWebhookController = {
  async handle(request, response) {
    let config;

    try {
      config = loadBaleBotConfig();
    } catch (error) {
      response.statusCode = 503;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Bale bot is not configured"
        })
      );
      return;
    }

    if (config.webhookSecret) {
      const providedSecret =
        getRequestHeader(request, "x-bale-bot-api-secret-token") ||
        getRequestHeader(request, "x-telegram-bot-api-secret-token");

      if (providedSecret !== config.webhookSecret) {
        response.statusCode = 401;
        response.end("Unauthorized");
        return;
      }
    }

    try {
      const update = await readJsonBody(request);

      if (update) {
        await processBaleUpdate(config, update);
      }

      response.statusCode = 200;
      response.end("ok");
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode || (error instanceof SyntaxError ? 400 : 500);
      response.statusCode = statusCode;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Webhook handling failed"
        })
      );
    }
  }
};

export async function maybeRegisterBaleWebhookOnStartup() {
  try {
    const config = loadBaleBotConfig();

    if (!config.useWebhook) {
      return;
    }

    await registerBaleWebhook(config.token, config.webhookUrl, config.webhookSecret);
    console.log(`Bale webhook ready at ${config.webhookUrl}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("BALE_BOT_TOKEN")) {
      return;
    }

    console.error("Bale webhook registration skipped:", error instanceof Error ? error.message : error);
  }
}

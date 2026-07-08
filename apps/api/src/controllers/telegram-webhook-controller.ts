import { loadTelegramBotConfig } from "../../telegram-bot/src/config.ts";
import { processTelegramUpdate } from "../../telegram-bot/src/process-update.ts";
import { registerTelegramWebhook } from "../../telegram-bot/src/telegram-bot-lib.ts";

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody) {
    return null;
  }

  return JSON.parse(rawBody);
}

function getRequestHeader(request, name) {
  const value = request.headers[name];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export const telegramWebhookController = {
  async handle(request, response) {
    let config;

    try {
      config = loadTelegramBotConfig();
    } catch (error) {
      response.statusCode = 503;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Telegram bot is not configured"
        })
      );
      return;
    }

    if (config.webhookSecret) {
      const providedSecret = getRequestHeader(request, "x-telegram-bot-api-secret-token");

      if (providedSecret !== config.webhookSecret) {
        response.statusCode = 401;
        response.end("Unauthorized");
        return;
      }
    }

    try {
      const update = await readJsonBody(request);

      if (update) {
        await processTelegramUpdate(config, update);
      }

      response.statusCode = 200;
      response.end("ok");
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Webhook handling failed"
        })
      );
    }
  }
};

export async function maybeRegisterTelegramWebhookOnStartup() {
  try {
    const config = loadTelegramBotConfig();

    if (!config.useWebhook) {
      return;
    }

    await registerTelegramWebhook(config.token, config.webhookUrl, config.webhookSecret);
    console.log(`Telegram webhook ready at ${config.webhookUrl}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("TELEGRAM_BOT_TOKEN")) {
      return;
    }

    console.error("Telegram webhook registration skipped:", error instanceof Error ? error.message : error);
  }
}

/**
 * مد اگریگیتور — Telegram price bot entry point.
 *
 * Twin of apps/bale-bot/src/bot.ts. Thin client over GET /goods/search.
 * Polling is the default (works with just TELEGRAM_BOT_TOKEN, no public
 * HTTPS needed). Set TELEGRAM_WEBHOOK_URL for webhook mode — then run
 * the API server to receive updates.
 */
import { pathToFileURL } from "node:url";
import { loadTelegramBotConfig } from "./config.ts";
import { processTelegramUpdate } from "./process-update.ts";
import {
  callTelegramApi,
  deleteTelegramWebhook,
  registerTelegramWebhook
} from "./telegram-bot-lib.ts";

async function pollUpdates(config: { token: string; apiBaseUrl: string }) {
  let offset = 0;
  console.log("Telegram bot polling started.");

  while (true) {
    const updates = await callTelegramApi(config.token, "getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: ["message", "callback_query"]
    });

    for (const update of updates ?? []) {
      offset = (update.update_id ?? offset) + 1;
      try {
        await processTelegramUpdate(config, update);
      } catch (error) {
        console.error("Failed to handle update:", error instanceof Error ? error.message : error);
      }
    }
  }
}

export async function startTelegramBot(config = loadTelegramBotConfig()) {
  if (config.useWebhook) {
    await registerTelegramWebhook(config.token, config.webhookUrl, config.webhookSecret);
    console.log(`Telegram webhook registered at ${config.webhookUrl}`);
    console.log("Webhook mode: run the API server to receive updates.");
    return;
  }

  await deleteTelegramWebhook(config.token);
  await pollUpdates(config);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startTelegramBot().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

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

/**
 * Fixes #46: the polling offset used to advance before processTelegramUpdate
 * ran, so a persistently failing update was dropped silently (only
 * console.error). Now the offset advances only after successful processing;
 * a failing update is retried, and after MAX_UPDATE_FAILURES attempts it is
 * dead-lettered with a full log line instead of vanishing.
 */
const MAX_UPDATE_FAILURES = 3;

async function pollUpdates(config: { token: string; apiBaseUrl: string }) {
  let offset = 0;
  const failureCounts = new Map<number, number>();
  console.log("Telegram bot polling started.");

  while (true) {
    const updates = await callTelegramApi(config.token, "getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: ["message", "callback_query"]
    });

    for (const update of updates ?? []) {
      const updateId = update.update_id ?? offset;

      try {
        await processTelegramUpdate(config, update);
        failureCounts.delete(updateId);
        offset = updateId + 1;
      } catch (error) {
        const failures = (failureCounts.get(updateId) ?? 0) + 1;
        failureCounts.set(updateId, failures);
        console.error(
          `Failed to handle update ${updateId} (attempt ${failures}/${MAX_UPDATE_FAILURES}):`,
          error instanceof Error ? error.message : error
        );

        if (failures >= MAX_UPDATE_FAILURES) {
          console.error(
            `Dead-lettering update ${updateId} after ${failures} failed attempts:`,
            JSON.stringify(update)?.slice(0, 1000)
          );
          failureCounts.delete(updateId);
          offset = updateId + 1;
        }
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

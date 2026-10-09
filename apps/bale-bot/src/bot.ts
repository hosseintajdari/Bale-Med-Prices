/**
 * مد اگریگیتور — Bale price bot entry point.
 *
 * Thin client over GET /goods/search. Polling is the default (works with
 * just BALE_BOT_TOKEN, no public HTTPS needed). Set BALE_WEBHOOK_URL for
 * webhook mode — then run the API server to receive updates.
 */
import { pathToFileURL } from "node:url";
import { loadBaleBotConfig } from "./config.ts";
import { processBaleUpdate } from "./process-update.ts";
import {
  callBaleApi,
  deleteBaleWebhook,
  registerBaleWebhook
} from "./bale-bot-lib.ts";

async function pollUpdates(config: { token: string; apiBaseUrl: string }) {
  let offset = 0;
  console.log("Bale bot polling started.");

  while (true) {
    const updates = await callBaleApi(config.token, "getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: ["message", "callback_query"]
    });

    for (const update of updates ?? []) {
      offset = (update.update_id ?? offset) + 1;
      try {
        await processBaleUpdate(config, update);
      } catch (error) {
        console.error("Failed to handle update:", error instanceof Error ? error.message : error);
      }
    }
  }
}

export async function startBaleBot(config = loadBaleBotConfig()) {
  if (config.useWebhook) {
    await registerBaleWebhook(config.token, config.webhookUrl, config.webhookSecret);
    console.log(`Bale webhook registered at ${config.webhookUrl}`);
    console.log("Webhook mode: run the API server to receive updates.");
    return;
  }

  await deleteBaleWebhook(config.token);
  await pollUpdates(config);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startBaleBot().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

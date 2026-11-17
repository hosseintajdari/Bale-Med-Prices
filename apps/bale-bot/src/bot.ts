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

/**
 * Same fix as the Telegram twin (#46): the offset advances only after
 * successful processing; a failing update is retried and dead-lettered after
 * MAX_UPDATE_FAILURES attempts instead of being dropped silently.
 */
const MAX_UPDATE_FAILURES = 3;

async function pollUpdates(config: { token: string; apiBaseUrl: string }) {
  let offset = 0;
  const failureCounts = new Map<number, number>();
  console.log("Bale bot polling started.");

  while (true) {
    const updates = await callBaleApi(config.token, "getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: ["message", "callback_query"]
    });

    for (const update of updates ?? []) {
      const updateId = update.update_id ?? offset;

      try {
        await processBaleUpdate(config, update);
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

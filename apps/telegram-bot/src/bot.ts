import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  callTelegramApi,
  configureDefaultMenuButton,
  resolveBotReply,
  sendMessage
} from "./telegram-bot-lib.ts";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultEnvFile = path.resolve(currentDirectory, "../../../.env.telegram");

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");

    for (const line of content.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional local env file.
  }
}

function readConfig() {
  loadEnvFile(defaultEnvFile);

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const webAppUrl = process.env.WEB_APP_URL?.trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  if (!webAppUrl) {
    throw new Error("WEB_APP_URL is required (public HTTPS URL of the web app)");
  }

  if (!/^https:\/\//i.test(webAppUrl)) {
    throw new Error("WEB_APP_URL must use HTTPS for Telegram Mini Apps");
  }

  return { token, webAppUrl };
}

async function handleUpdate(token, webAppUrl, update) {
  const message = update.message;

  if (!message?.chat?.id || typeof message.text !== "string") {
    return;
  }

  const reply = resolveBotReply(message.text, webAppUrl);
  await sendMessage(token, message.chat.id, reply);
}

async function pollUpdates(token, webAppUrl) {
  let offset = 0;

  console.log("Telegram bot polling started.");

  while (true) {
    const updates = await callTelegramApi(token, "getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: ["message"]
    });

    for (const update of updates) {
      offset = update.update_id + 1;

      try {
        await handleUpdate(token, webAppUrl, update);
      } catch (error) {
        console.error("Failed to handle update:", error instanceof Error ? error.message : error);
      }
    }
  }
}

export async function startTelegramBot(config = readConfig()) {
  await configureDefaultMenuButton(config.token, config.webAppUrl);
  await pollUpdates(config.token, config.webAppUrl);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startTelegramBot().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

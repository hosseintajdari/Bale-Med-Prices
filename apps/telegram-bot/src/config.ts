import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTelegramBotConfig } from "./telegram-bot-lib.ts";

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

export function loadTelegramBotConfig() {
  loadEnvFile(defaultEnvFile);
  return readTelegramBotConfig();
}

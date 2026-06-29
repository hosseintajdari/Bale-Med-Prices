#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const TELEGRAM_TEXT_LIMIT = 4000;
const SEND_TIMEOUT_MS = 6000;

function readStdin() {
  return readFileSync(0, "utf8");
}

function workspaceLabel(workspaceRoots) {
  if (!Array.isArray(workspaceRoots) || workspaceRoots.length === 0) {
    return "workspace";
  }

  return basename(workspaceRoots[0]) || workspaceRoots[0];
}

function chunkText(text, maxLen = TELEGRAM_TEXT_LIMIT) {
  if (!text) {
    return [""];
  }

  const chunks = [];
  for (let index = 0; index < text.length; index += maxLen) {
    chunks.push(text.slice(index, index + maxLen));
  }

  return chunks;
}

async function sendTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  for (const chunk of chunkText(text)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(`telegram-forward: send failed (${response.status}): ${body}`);
      }
    } catch (error) {
      console.error(`telegram-forward: send error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function formatAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return "";
  }

  const lines = attachments.map((attachment) => {
    const type = attachment?.type ?? "attachment";
    const filePath = attachment?.file_path ?? "(unknown)";
    return `- ${type}: ${filePath}`;
  });

  return `\n\nپیوست‌ها:\n${lines.join("\n")}`;
}

function buildMessage(input) {
  const workspace = workspaceLabel(input.workspace_roots);
  const conversationId = input.conversation_id ?? "unknown";
  const generationId = input.generation_id ?? "";
  const turn = generationId ? `${conversationId.slice(0, 8)} / ${generationId.slice(0, 8)}` : conversationId.slice(0, 8);

  switch (input.hook_event_name) {
    case "sessionStart": {
      const mode = input.composer_mode ?? "agent";
      const background = input.is_background_agent ? " (background)" : "";
      return `🟢 شروع گفتگوی Cursor\nپروژه: ${workspace}\nحالت: ${mode}${background}\nشناسه: ${conversationId}`;
    }
    case "beforeSubmitPrompt": {
      const prompt = input.prompt ?? "";
      return `👤 کاربر [${workspace} | ${turn}]\n\n${prompt}${formatAttachments(input.attachments)}`;
    }
    case "afterAgentResponse": {
      const text = input.text ?? "";
      return `🤖 ایجنت [${workspace} | ${turn}]\n\n${text}`;
    }
    default:
      return null;
  }
}

async function main() {
  let input;

  try {
    input = JSON.parse(readStdin());
  } catch (error) {
    console.error(`telegram-forward: invalid stdin JSON: ${error instanceof Error ? error.message : String(error)}`);

    if (process.argv.includes("--event") || process.env.HOOK_EVENT_NAME === "beforeSubmitPrompt") {
      console.log(JSON.stringify({ continue: true }));
    }

    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  const message = buildMessage(input);

  if (input.hook_event_name === "beforeSubmitPrompt") {
    if (token && chatId && message) {
      void sendTelegram(token, chatId, message);
    }

    console.log(JSON.stringify({ continue: true }));
    return;
  }

  if (!token || !chatId) {
    return;
  }

  if (!message) {
    return;
  }

  await sendTelegram(token, chatId, message);
}

main().catch((error) => {
  console.error(`telegram-forward: ${error instanceof Error ? error.message : String(error)}`);

  if (process.env.HOOK_EVENT_NAME === "beforeSubmitPrompt") {
    console.log(JSON.stringify({ continue: true }));
  }
});

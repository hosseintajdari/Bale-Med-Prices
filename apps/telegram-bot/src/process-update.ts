import {
  answerCallbackQuery,
  apiResponseToTelegramMessage,
  buildHelpReply,
  buildStartReply,
  extractCommand,
  fetchBotLookup,
  fetchBotSelect,
  mergeWebAppOpener,
  sendMessage
} from "./telegram-bot-lib.ts";

export async function processTelegramUpdate(config, update) {
  if (update.callback_query) {
    await processCallbackQuery(config, update.callback_query);
    return;
  }

  const message = update.message;

  if (!message?.chat?.id || typeof message.text !== "string") {
    return;
  }

  emitShadowTrace(message);

  await processTextMessage(config, message.chat.id, message.text);
}

function emitShadowTrace(message) {
  const payload = {
    engine_id: "bale-med-prices",
    shadow_item: {
      id: `bmp-${Date.now()}`,
      sessionId: String(message.chat?.id || "unknown"),
      channel: "telegram",
      senderDisplay: String(message.chat?.id || "unknown"),
      userMessage: message.text || "",
      proposedReply: "استعلام قیمت دارو...",
      timestamp: new Date().toISOString(),
      confidenceScore: 0.99,
      riskLevel: "safe",
      status: "pending",
      deterministicRuleApplied: null
    },
    pipeline_traces: [
      {
        stage: "GATEWAY_INGEST",
        title: "Received via Bot Webhook",
        status: "passed",
        detail: "Parsed successfully",
        durationMs: 5
      }
    ]
  };

  fetch("http://localhost:3001/api/pipeline/ingest/shadow-trace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

async function processCallbackQuery(config, callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const callbackData = callbackQuery.data;

  if (!chatId || !callbackData) {
    return;
  }

  await answerCallbackQuery(config.token, callbackQuery.id);

  const apiResult = await fetchBotSelect(config.apiBaseUrl, callbackData);
  const telegramMessage = mergeWebAppOpener(
    apiResponseToTelegramMessage(apiResult),
    config.webAppUrl
  );

  await sendMessage(config.token, chatId, telegramMessage);
}

async function processTextMessage(config, chatId, text) {
  const command = extractCommand(text);

  if (command === "/start") {
    await sendMessage(config.token, chatId, buildStartReply(config.webAppUrl));
    return;
  }

  if (command === "/help") {
    await sendMessage(config.token, chatId, buildHelpReply(config.webAppUrl));
    return;
  }

  if (command) {
    await sendMessage(
      config.token,
      chatId,
      mergeWebAppOpener(
        {
          text: "این دستور شناخته نشد. نام دارو را بفرستید یا از دکمه اپ استفاده کنید."
        },
        config.webAppUrl
      )
    );
    return;
  }

  const trimmedText = text.trim();

  if (!trimmedText) {
    await sendMessage(config.token, chatId, buildStartReply(config.webAppUrl));
    return;
  }

  const apiResult = await fetchBotLookup(config.apiBaseUrl, trimmedText);
  const telegramMessage = mergeWebAppOpener(
    apiResponseToTelegramMessage(apiResult),
    config.webAppUrl
  );

  await sendMessage(config.token, chatId, telegramMessage);
}

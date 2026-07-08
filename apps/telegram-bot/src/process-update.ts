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

  await processTextMessage(config, message.chat.id, message.text);
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

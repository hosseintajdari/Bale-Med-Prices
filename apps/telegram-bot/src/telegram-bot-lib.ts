const TELEGRAM_API_BASE = "https://api.telegram.org";
const DEFAULT_DOCUMENT_DATE = "2026-06-24";

export function buildStartReply(webAppUrl) {
  return {
    text: [
      "به بات قیمت دارو خوش آمدید.",
      "",
      "• نام دارو را همین‌جا بفرستید (متنی)",
      "• یا اپ کامل را با دکمه زیر باز کنید"
    ].join("\n"),
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "باز کردن اپ قیمت دارو",
            web_app: { url: webAppUrl }
          }
        ]
      ]
    }
  };
}

export function buildHelpReply(webAppUrl) {
  return {
    text: [
      "راهنما:",
      "• نام دارو را به فارسی یا انگلیسی بفرستید — پاسخ متنی + دکمه انتخاب",
      "• برای تجربه کامل (جستجوی زنده و بروزرسانی تعداد) اپ را باز کنید",
      "• /start — پیام خوش‌آمد",
      "",
      `لینک اپ: ${webAppUrl}`
    ].join("\n"),
    reply_markup: buildStartReply(webAppUrl).reply_markup
  };
}

export function extractCommand(text) {
  if (!text?.startsWith("/")) {
    return null;
  }

  const [commandToken] = text.trim().split(/\s+/);
  const command = commandToken.split("@")[0].toLowerCase();
  return command;
}

export function apiResponseToTelegramMessage(result) {
  const text =
    result.text ??
    result.message ??
    (result.type === "not_found" ? `دارویی با این نام پیدا نشد: ${result.query ?? ""}` : "پاسخی در دسترس نیست.");

  const replyMarkup = result.telegram?.replyMarkup ?? result.telegram?.reply_markup ?? null;
  const message = { text };

  if (replyMarkup) {
    message.reply_markup = replyMarkup;
  }

  return message;
}

export function mergeWebAppOpener(message, webAppUrl) {
  const openerRow = [
    {
      text: "باز کردن اپ قیمت دارو",
      web_app: { url: webAppUrl }
    }
  ];

  const keyboard = message.reply_markup?.inline_keyboard ?? [];

  if (keyboard.some((row) => row.some((button) => button.web_app?.url === webAppUrl))) {
    return message;
  }

  return {
    ...message,
    reply_markup: {
      inline_keyboard: [...keyboard, openerRow]
    }
  };
}

export async function callTelegramApi(token, method, body) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json();

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.description ?? `Telegram API ${method} failed (${response.status})`);
  }

  return payload.result;
}

export async function configureDefaultMenuButton(token, webAppUrl) {
  return callTelegramApi(token, "setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "قیمت دارو",
      web_app: { url: webAppUrl }
    }
  });
}

export async function registerTelegramWebhook(token, webhookUrl, webhookSecret) {
  const body = {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"]
  };

  if (webhookSecret) {
    body.secret_token = webhookSecret;
  }

  return callTelegramApi(token, "setWebhook", body);
}

export async function deleteTelegramWebhook(token) {
  return callTelegramApi(token, "deleteWebhook", {
    drop_pending_updates: false
  });
}

export async function sendMessage(token, chatId, message) {
  return callTelegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: message.text,
    reply_markup: message.reply_markup
  });
}

export async function answerCallbackQuery(token, callbackQueryId) {
  return callTelegramApi(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId
  });
}

function buildBotRequestParams(query) {
  return new URLSearchParams({
    q: query,
    documentDate: DEFAULT_DOCUMENT_DATE,
    quantity: "1",
    warehouseId: "main",
    includeTechnicalFee: "on"
  });
}

export async function fetchBotLookup(apiBaseUrl, query) {
  const baseUrl = apiBaseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/bot/lookup?${buildBotRequestParams(query).toString()}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Bot lookup failed");
  }

  return payload;
}

export async function fetchBotSelect(apiBaseUrl, callbackData) {
  const baseUrl = apiBaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    callbackData,
    documentDate: DEFAULT_DOCUMENT_DATE,
    quantity: "1",
    warehouseId: "main",
    includeTechnicalFee: "on"
  });
  const response = await fetch(`${baseUrl}/bot/select?${params.toString()}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Bot select failed");
  }

  return payload;
}

export function resolveBotReply(text, webAppUrl) {
  const command = extractCommand(text);

  if (command === "/start") {
    return buildStartReply(webAppUrl);
  }

  if (command === "/help") {
    return buildHelpReply(webAppUrl);
  }

  return mergeWebAppOpener(
    {
      text: "برای استفاده از خدمت قیمت دارو، نام دارو را بفرستید یا دکمه اپ را بزنید."
    },
    webAppUrl
  );
}

export function readTelegramBotConfig(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const webAppUrl = env.WEB_APP_URL?.trim();
  const apiBaseUrl = env.API_BASE_URL?.trim() || `http://127.0.0.1:${env.PORT ?? 4000}`;
  const webhookUrl = env.TELEGRAM_WEBHOOK_URL?.trim() || "";
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  if (!webAppUrl) {
    throw new Error("WEB_APP_URL is required (public HTTPS URL of the web app)");
  }

  if (!/^https:\/\//i.test(webAppUrl)) {
    throw new Error("WEB_APP_URL must use HTTPS for Telegram Mini Apps");
  }

  if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) {
    throw new Error("TELEGRAM_WEBHOOK_URL must use HTTPS");
  }

  return {
    token,
    webAppUrl,
    apiBaseUrl,
    webhookUrl,
    webhookSecret,
    useWebhook: Boolean(webhookUrl)
  };
}

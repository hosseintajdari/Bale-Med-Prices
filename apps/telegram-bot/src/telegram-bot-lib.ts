const TELEGRAM_API_BASE = "https://api.telegram.org";

export function buildStartReply(webAppUrl) {
  return {
    text: [
      "به بات قیمت دارو خوش آمدید.",
      "",
      "برای جستجوی دارو، انتخاب شکل و دوز، و دیدن قیمت هر واحد مصرف، اپلیکیشن را باز کنید."
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
      "• /start — پیام خوش‌آمد و دکمه اپ",
      "• نام دارو را داخل اپ به فارسی یا انگلیسی جستجو کنید",
      "• پس از انتخاب دارو می‌توانید تعداد را تغییر دهید",
      "",
      `لینک اپ: ${webAppUrl}`
    ].join("\n")
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

export async function sendMessage(token, chatId, message) {
  return callTelegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: message.text,
    reply_markup: message.reply_markup
  });
}

export function resolveBotReply(text, webAppUrl) {
  const command = extractCommand(text);

  if (command === "/start") {
    return buildStartReply(webAppUrl);
  }

  if (command === "/help") {
    return buildHelpReply(webAppUrl);
  }

  return {
    text: "برای استفاده از خدمت قیمت دارو، دکمه «باز کردن اپ قیمت دارو» را بزنید یا از منوی پایین صفحه استفاده کنید.",
    reply_markup: buildStartReply(webAppUrl).reply_markup
  };
}

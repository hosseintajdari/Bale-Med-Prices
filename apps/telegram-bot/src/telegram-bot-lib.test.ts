import assert from "node:assert/strict";
import test from "node:test";
import {
  apiResponseToTelegramMessage,
  buildHelpReply,
  buildStartReply,
  extractCommand,
  mergeWebAppOpener,
  readTelegramBotConfig,
  resolveBotReply
} from "../src/telegram-bot-lib.ts";

test("buildStartReply includes web_app button", () => {
  const reply = buildStartReply("https://example.com/");

  assert.equal(reply.reply_markup.inline_keyboard[0][0].web_app.url, "https://example.com/");
  assert.match(reply.text, /خوش آمدید/);
});

test("extractCommand ignores bot username suffix and handles casing", () => {
  assert.equal(extractCommand("/start@MyBot"), "/start");
  assert.equal(extractCommand("/HELP"), "/help");
  assert.equal(extractCommand("amoxicillin"), null);
  assert.equal(extractCommand(""), null);
  assert.equal(extractCommand(null), null);
});

test("apiResponseToTelegramMessage maps telegram inline keyboard and handles not_found", () => {
  const message = apiResponseToTelegramMessage({
    text: "یک گزینه را انتخاب کنید",
    telegram: {
      replyMarkup: {
        inline_keyboard: [[{ text: "قرص", callback_data: "ms:s1:c1" }]]
      }
    }
  });

  assert.deepEqual(message.reply_markup.inline_keyboard[0][0].callback_data, "ms:s1:c1");

  const notFoundMessage = apiResponseToTelegramMessage({
    type: "not_found",
    query: "unknown-medicine"
  });
  assert.match(notFoundMessage.text, /unknown-medicine/);

  const snakeCaseReplyMarkup = apiResponseToTelegramMessage({
    text: "گزینه‌ها",
    telegram: {
      reply_markup: {
        inline_keyboard: [[{ text: "تست", callback_data: "test" }]]
      }
    }
  });
  assert.deepEqual(snakeCaseReplyMarkup.reply_markup.inline_keyboard[0][0].callback_data, "test");
});

test("mergeWebAppOpener appends web_app row once", () => {
  const merged = mergeWebAppOpener({ text: "نتیجه" }, "https://example.com/app");

  assert.equal(merged.reply_markup.inline_keyboard.length, 1);
  assert.equal(merged.reply_markup.inline_keyboard[0][0].web_app.url, "https://example.com/app");

  const again = mergeWebAppOpener(merged, "https://example.com/app");
  assert.equal(again.reply_markup.inline_keyboard.length, 1);
});

test("resolveBotReply returns help text for /help", () => {
  const reply = resolveBotReply("/help", "https://example.com/app");

  assert.equal(reply.text, buildHelpReply("https://example.com/app").text);
});

test("resolveBotReply nudges unknown text toward the web app", () => {
  const reply = resolveBotReply("استامینوفن", "https://example.com/app");

  assert.match(reply.text, /نام دارو را بفرستید/);
  assert.equal(reply.reply_markup.inline_keyboard.length, 1);
});

test("readTelegramBotConfig enforces token and HTTPS URLs", () => {
  assert.throws(() => readTelegramBotConfig({}), /TELEGRAM_BOT_TOKEN is required/);

  assert.throws(
    () => readTelegramBotConfig({ TELEGRAM_BOT_TOKEN: "token123" }),
    /WEB_APP_URL is required/
  );

  assert.throws(
    () =>
      readTelegramBotConfig({
        TELEGRAM_BOT_TOKEN: "token123",
        WEB_APP_URL: "http://insecure.com"
      }),
    /WEB_APP_URL must use HTTPS/
  );

  assert.throws(
    () =>
      readTelegramBotConfig({
        TELEGRAM_BOT_TOKEN: "token123",
        WEB_APP_URL: "https://secure.com/app",
        TELEGRAM_WEBHOOK_URL: "http://insecure.com/webhook"
      }),
    /TELEGRAM_WEBHOOK_URL must use HTTPS/
  );

  const valid = readTelegramBotConfig({
    TELEGRAM_BOT_TOKEN: "token123",
    WEB_APP_URL: "https://secure.com/app",
    TELEGRAM_WEBHOOK_URL: "https://secure.com/webhook",
    TELEGRAM_WEBHOOK_SECRET: "secret99"
  });

  assert.equal(valid.token, "token123");
  assert.equal(valid.webAppUrl, "https://secure.com/app");
  assert.equal(valid.webhookUrl, "https://secure.com/webhook");
  assert.equal(valid.webhookSecret, "secret99");
  assert.equal(valid.useWebhook, true);
});

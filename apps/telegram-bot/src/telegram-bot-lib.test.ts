import assert from "node:assert/strict";
import test from "node:test";
import {
  apiResponseToTelegramMessage,
  buildHelpReply,
  buildStartReply,
  extractCommand,
  mergeWebAppOpener,
  resolveBotReply
} from "../src/telegram-bot-lib.ts";

test("buildStartReply includes web_app button", () => {
  const reply = buildStartReply("https://example.com/");

  assert.equal(reply.reply_markup.inline_keyboard[0][0].web_app.url, "https://example.com/");
  assert.match(reply.text, /خوش آمدید/);
});

test("extractCommand ignores bot username suffix", () => {
  assert.equal(extractCommand("/start@MyBot"), "/start");
  assert.equal(extractCommand("/help"), "/help");
  assert.equal(extractCommand("amoxicillin"), null);
});

test("apiResponseToTelegramMessage maps telegram inline keyboard", () => {
  const message = apiResponseToTelegramMessage({
    text: "یک گزینه را انتخاب کنید",
    telegram: {
      replyMarkup: {
        inline_keyboard: [[{ text: "قرص", callback_data: "ms:s1:c1" }]]
      }
    }
  });

  assert.deepEqual(message.reply_markup.inline_keyboard[0][0].callback_data, "ms:s1:c1");
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

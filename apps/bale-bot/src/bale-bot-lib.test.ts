import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCopyMessage,
  buildHelpReply,
  buildPriceReply,
  buildStartReply,
  extractCommand,
  parseCopyCallback,
  readBaleBotConfig
} from "./bale-bot-lib.ts";
import {
  formatPriceFa,
  toPersianDigits
} from "../../../packages/domain/src/format-price.ts";

test("extractCommand handles /start, /help and bot mentions", () => {
  assert.equal(extractCommand("/start"), "/start");
  assert.equal(extractCommand("/HELP"), "/help");
  assert.equal(extractCommand("/start@medpricebot"), "/start");
  assert.equal(extractCommand("آموکسی‌سیلین"), null);
  assert.equal(extractCommand(""), null);
});

test("readBaleBotConfig requires BALE_BOT_TOKEN", () => {
  assert.throws(() => readBaleBotConfig({}), /BALE_BOT_TOKEN is required/);
  const config = readBaleBotConfig({ BALE_BOT_TOKEN: "abc" });
  assert.equal(config.token, "abc");
  assert.equal(config.useWebhook, false);
});

test("readBaleBotConfig rejects non-HTTPS webhook URLs", () => {
  assert.throws(
    () => readBaleBotConfig({ BALE_BOT_TOKEN: "abc", BALE_WEBHOOK_URL: "http://x" }),
    /must use HTTPS/
  );
});

const sampleItems = [
  {
    persianTitle: "آموکسی‌سیلین ۵۰۰",
    consumerUnitPrice: 450000,
    webSource: true,
    webSourceName: "torob",
    crawledAt: "2026-10-09T08:00:00.000Z"
  },
  {
    persianTitle: "شربت زینک",
    consumerUnitPrice: 1990000,
    webSource: true,
    webSourceName: "delgarm",
    crawledAt: "2026-10-07T08:00:00.000Z"
  }
];

test("buildPriceReply renders دکترپسند blocks with a copy button each", () => {
  const message = buildPriceReply(sampleItems, "آموکسی");
  assert.ok(message.text.includes("۴۵۰٬۰۰۰ ریال (۴۵٬۰۰۰ تومان)"));
  assert.ok(message.text.includes("منبع: torob"));
  assert.ok(!/[0-9]/.test(message.text.replace(/copy:\d/g, "")), "no Latin digits leak into the reply");

  const keyboard = message.reply_markup?.inline_keyboard ?? [];
  assert.equal(keyboard.length, 2);
  assert.equal(keyboard[0][0].text, `📋 کپی ${toPersianDigits(1)}`);
  assert.equal(keyboard[0][0].callback_data, "copy:0");
  assert.equal(keyboard[1][0].callback_data, "copy:1");
});

test("buildPriceReply caps at five results", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({
    persianTitle: `دارو ${i}`,
    consumerUnitPrice: 10000,
    webSourceName: "x"
  }));
  const message = buildPriceReply(many, "دارو");
  assert.equal(message.reply_markup?.inline_keyboard.length, 5);
  assert.ok(message.text.includes(toPersianDigits(3))); // «۳ نتیجه‌ی دیگر»
});

test("buildCopyMessage puts only the price in a Markdown code span", () => {
  const message = buildCopyMessage(sampleItems[0]);
  assert.equal(message.parse_mode, "Markdown");
  const expected = `\`${formatPriceFa(450000)}\``;
  assert.ok(message.text.includes(expected));
  assert.ok(message.text.startsWith("آموکسی‌سیلین ۵۰۰"));
});

test("parseCopyCallback parses copy:<index> and rejects junk", () => {
  assert.equal(parseCopyCallback("copy:0"), 0);
  assert.equal(parseCopyCallback("copy:3"), 3);
  assert.equal(parseCopyCallback("copy:-1"), null);
  assert.equal(parseCopyCallback("copy:x"), null);
  assert.equal(parseCopyCallback("hello"), null);
  assert.equal(parseCopyCallback(null), null);
});

test("start/help replies are Persian and command-only", () => {
  assert.ok(buildStartReply().text.includes("نام دارو را همین‌جا بفرستید"));
  const help = buildHelpReply().text;
  assert.ok(help.includes("/start"));
  assert.ok(help.includes("/help"));
  assert.ok(help.includes("📋 کپی"));
});

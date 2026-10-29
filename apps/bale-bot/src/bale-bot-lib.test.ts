import test from "node:test";
import assert from "node:assert/strict";
import {
  isPageCallback,
  parsePageCallback,
  buildHelpReply,
  buildPriceReply,
  buildStartReply,
  extractCommand,
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

test("buildPriceReply renders دکترپسند blocks with an update-date line", () => {
  const message = buildPriceReply(sampleItems, "آموکسی");
  assert.ok(message.text.includes("۴۵۰٬۰۰۰ ریال (۴۵٬۰۰۰ تومان)"));
  assert.ok(message.text.includes("به‌روزرسانی:"));
  assert.ok(!message.text.includes("منبع:"), "source name no longer printed — update date replaced it");
  assert.ok(!/[0-9]/.test(message.text), "no Latin digits leak into the reply");
  // Two results fit one page: no pagination keyboard.
  assert.equal(message.reply_markup, undefined);
});

test("buildPriceReply drops priceless items instead of rendering ۰ ریال", () => {
  const message = buildPriceReply(
    [{ persianTitle: "بی‌قیمت", consumerUnitPrice: 0 }, { persianTitle: "بی‌قیمت ۲" }],
    "بی‌قیمت"
  );
  assert.ok(!message.text.includes("۰ ریال"));
  assert.ok(message.text.includes("قیمت معتبر پیدا نشد"));
});

test("buildPriceReply paginates with صفحه‌ی بعد / صفحه‌ی قبل buttons", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    persianTitle: `دارو ${i}`,
    consumerUnitPrice: 10000,
    webSourceName: "x"
  }));
  const page0 = buildPriceReply(many, "دارو");
  assert.ok(page0.text.includes("صفحه‌ی ۱ از ۳"));
  const kb0 = page0.reply_markup?.inline_keyboard ?? [];
  assert.equal(kb0.length, 1);
  assert.equal(kb0[0].length, 1);
  assert.equal(kb0[0][0].callback_data, "pg:1");
  assert.ok(kb0[0][0].text.includes("صفحه‌ی بعد"));

  const page1 = buildPriceReply(many, "دارو", undefined, 1);
  const kb1 = page1.reply_markup?.inline_keyboard ?? [];
  assert.equal(kb1[0].length, 2);
  assert.equal(kb1[0][0].callback_data, "pg:0");
  assert.equal(kb1[0][1].callback_data, "pg:2");

  const page2 = buildPriceReply(many, "دارو", undefined, 2);
  assert.ok(page2.text.includes("دارو 10") || page2.text.includes("دارو 11"));
});

test("parsePageCallback parses pg:<n> and rejects junk", () => {
  assert.equal(parsePageCallback("pg:0"), 0);
  assert.equal(parsePageCallback("pg:3"), 3);
  assert.equal(parsePageCallback("pg:-1"), null);
  assert.equal(parsePageCallback("copy:1"), null);
  assert.equal(parsePageCallback(null), null);
  assert.equal(isPageCallback("pg:2"), true);
  assert.equal(isPageCallback("copy:2"), false);
});


test("start/help replies are Persian and command-only", () => {
  assert.ok(buildStartReply().text.includes("نام دارو را همین‌جا بفرستید"));
  const help = buildHelpReply().text;
  assert.ok(help.includes("/start"));
  assert.ok(help.includes("/help"));
  assert.ok(help.includes("صفحه‌ی بعد"));
});

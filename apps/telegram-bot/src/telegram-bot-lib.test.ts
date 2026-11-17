import test from "node:test";
import assert from "node:assert/strict";
import {
  isPageCallback,
  parsePageCallback,
  buildHelpReply,
  buildPriceReply,
  buildStartReply,
  extractCommand,
  readTelegramBotConfig
} from "./telegram-bot-lib.ts";
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

test("readTelegramBotConfig requires TELEGRAM_BOT_TOKEN", () => {
  assert.throws(() => readTelegramBotConfig({}), /TELEGRAM_BOT_TOKEN is required/);
  const config = readTelegramBotConfig({ TELEGRAM_BOT_TOKEN: "abc" });
  assert.equal(config.token, "abc");
  assert.equal(config.useWebhook, false);
});

test("readTelegramBotConfig rejects non-HTTPS webhook URLs", () => {
  assert.throws(
    () => readTelegramBotConfig({ TELEGRAM_BOT_TOKEN: "abc", TELEGRAM_WEBHOOK_URL: "http://x" }),
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
  assert.ok(buildStartReply().text.includes("نام دارو را بفرستید"));
  const help = buildHelpReply().text;
  assert.ok(help.includes("/start"));
  assert.ok(help.includes("/help"));
  assert.ok(help.includes("صفحه‌ی بعد"));
});

test("start/help speak to the patient, not the pharmacist (F1 parity)", () => {
  const start = buildStartReply().text;
  assert.ok(!start.includes("منبع"), "the price block shows the update date, not a source — do not promise one");
  assert.ok(start.includes("غلط املایی"), "typo tolerance is part of the welcome");
  const help = buildHelpReply().text;
  assert.ok(!help.includes("برای بیمار"), "no pharmacist-forwarding talk in the patient surface");
  assert.ok(!help.includes("منبع"), "no source promise in help either");
  assert.ok(help.includes("نام لاتین روی جعبه"));
  assert.ok(help.includes("کهنه"), "staleness label is explained to the patient");
});

test("photo and non-text replies are honest guidance, never silence (F1 parity)", async () => {
  const { buildPhotoReply, buildNonTextReply } = await import("./telegram-bot-lib.ts");
  const photo = buildPhotoReply().text;
  assert.ok(photo.includes("عکس رسید"));
  assert.ok(photo.includes("نمی‌توانم نام دارو را از روی عکس بخوانم"));
  assert.ok(buildNonTextReply().text.includes("به‌صورت متن"));
});

test("callback_data guard enforces the Telegram 64-byte hard limit", async () => {
  const { callbackDataBytes, fitsCallbackLimit, guardInlineKeyboard, CALLBACK_DATA_MAX_BYTES } =
    await import("./telegram-bot-lib.ts");
  assert.equal(CALLBACK_DATA_MAX_BYTES, 64);
  assert.ok(fitsCallbackLimit("pg:1"));
  assert.ok(fitsCallbackLimit("ms:sel-12:form-tablet"));
  // Byte length, not character count: Persian chars are 2 bytes in UTF-8.
  const persianHeavy = `ms:${"س".repeat(40)}`;
  assert.ok(persianHeavy.length < 64);
  assert.ok(callbackDataBytes(persianHeavy) > 64);
  assert.ok(!fitsCallbackLimit(persianHeavy));
  assert.ok(!fitsCallbackLimit("x".repeat(65)));
  assert.ok(!fitsCallbackLimit(""));
  assert.ok(!fitsCallbackLimit(null));

  const keyboard = guardInlineKeyboard([
    [{ text: "صفحه‌ی بعد", callback_data: "pg:1" }],
    [{ text: "بد", callback_data: persianHeavy }],
    [{ text: "خوب", callback_data: "ms:sel-1:tablet" }, { text: "بد ۲", callback_data: "y".repeat(80) }]
  ]);
  assert.deepEqual(keyboard, [
    [{ text: "صفحه‌ی بعد", callback_data: "pg:1" }],
    [{ text: "خوب", callback_data: "ms:sel-1:tablet" }]
  ]);
  assert.equal(guardInlineKeyboard([[{ text: "بد", callback_data: persianHeavy }]]), undefined);
  assert.equal(guardInlineKeyboard([]), undefined);
  assert.equal(guardInlineKeyboard(undefined), undefined);
});

test("every keyboard buildPriceReply emits fits the 64-byte limit", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    persianTitle: `دارو ${i}`,
    consumerUnitPrice: 10000,
    webSourceName: "x"
  }));
  for (const page of [0, 1, 2]) {
    const kb = buildPriceReply(many, "دارو", undefined, page).reply_markup?.inline_keyboard ?? [];
    for (const row of kb) {
      for (const button of row) {
        assert.ok(new TextEncoder().encode(button.callback_data).length <= 64);
      }
    }
  }
});

test("guarded selection message drops oversized buttons instead of sending a broken keyboard", async () => {
  const { buildGuardedSelectionMessage } = await import("./telegram-bot-lib.ts");
  const longChoice = "x".repeat(80);
  const message = buildGuardedSelectionMessage({
    type: "needs_form_selection",
    query: "آموکسی‌سیلین",
    selection: {
      kind: "single_choice",
      prompt: "فرم دارو را انتخاب کنید",
      sessionId: "sel-1",
      choices: [
        { id: "tablet", label: "قرص" },
        { id: longChoice, label: "خراب" }
      ]
    }
  } as any);
  const kb = message.reply_markup?.inline_keyboard ?? [];
  const datas = kb.flat().map((b: any) => b.callback_data);
  assert.deepEqual(datas, ["ms:sel-1:tablet"]);
});

test("bot commands menu lists /start and /help in Persian", async () => {
  const { buildBotCommands } = await import("./telegram-bot-lib.ts");
  const commands = buildBotCommands();
  assert.deepEqual(commands.map((c: any) => c.command), ["start", "help"]);
  for (const c of commands) {
    assert.ok(c.description.length > 0);
  }
});

test("inline results carry the same price block and drop priceless items", async () => {
  const { buildInlineResults } = await import("./telegram-bot-lib.ts");
  const results = buildInlineResults(sampleItems, "آموکسی");
  assert.equal(results.length, 2);
  assert.ok(results[0].input_message_content.message_text.includes("۴۵۰٬۰۰۰ ریال (۴۵٬۰۰۰ تومان)"));
  assert.ok(results[0].input_message_content.message_text.includes("به‌روزرسانی:"));
  assert.ok(/^r\d+$/.test(results[0].id), "inline result ids stay ASCII-safe");

  const withPriceless = buildInlineResults(
    [{ persianTitle: "بی‌قیمت", consumerUnitPrice: 0 }, ...sampleItems],
    "آموکسی"
  );
  assert.equal(withPriceless.length, 2);

  const many = Array.from({ length: 15 }, (_, i) => ({
    persianTitle: `دارو ${i}`,
    consumerUnitPrice: 10000,
    webSourceName: "x"
  }));
  assert.ok(buildInlineResults(many, "دارو").length <= 10);
});

test("inline empty/not-found results still answer the patient", async () => {
  const { buildInlineResults, buildInlineHintResult } = await import("./telegram-bot-lib.ts");
  const none = buildInlineResults([], "پیتزا");
  assert.equal(none.length, 1);
  assert.ok(none[0].input_message_content.message_text.includes("پیدا نشد"));
  const hint = buildInlineHintResult();
  assert.ok(hint.input_message_content.message_text.includes("نام دارو"));
});

test("answerCallbackQuery can raise a native alert; sendChatAction types", async () => {
  const lib = await import("./telegram-bot-lib.ts");
  const calls: Array<{ url: string; body: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, opts: any) => {
    calls.push({ url: String(url), body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) } as any;
  }) as any;
  try {
    await lib.answerCallbackQuery("tok", "cq1", "این دکمه قدیمی شده", { show_alert: true });
    await lib.sendChatAction("tok", 42, "typing");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(calls[0].url.endsWith("/answerCallbackQuery"));
  assert.equal(calls[0].body.show_alert, true);
  assert.equal(calls[0].body.text, "این دکمه قدیمی شده");
  assert.ok(calls[1].url.endsWith("/sendChatAction"));
  assert.equal(calls[1].body.action, "typing");
  assert.equal(calls[1].body.chat_id, 42);
});

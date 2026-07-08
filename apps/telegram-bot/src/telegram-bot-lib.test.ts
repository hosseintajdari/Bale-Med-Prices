import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHelpReply,
  buildStartReply,
  extractCommand,
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

test("resolveBotReply returns help text for /help", () => {
  const reply = resolveBotReply("/help", "https://example.com/app");

  assert.equal(reply.text, buildHelpReply("https://example.com/app").text);
});

test("resolveBotReply nudges unknown text toward the web app", () => {
  const reply = resolveBotReply("استامینوفن", "https://example.com/app");

  assert.match(reply.text, /اپ/);
  assert.deepEqual(reply.reply_markup, buildStartReply("https://example.com/app").reply_markup);
});

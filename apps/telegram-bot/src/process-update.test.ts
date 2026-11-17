import test from "node:test";
import assert from "node:assert/strict";
import { processTelegramUpdate, clearSessionsForTest } from "./process-update.ts";

/**
 * Routing tests with a stubbed global fetch: Telegram API calls are
 * captured; the price API returns a fixed one-item search.
 */
function stubFetch(options?: { search?: "items" | "empty" | "rateLimited"; selectFails?: boolean }) {
  const sent: Array<{ method: string; body: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, opts: any) => {
    const u = String(url);
    if (u.includes("/goods/search")) {
      if (options?.search === "rateLimited") {
        return { ok: false, status: 429, json: async () => ({}) } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items:
            options?.search === "empty"
              ? []
              : [
                  {
                    persianTitle: "آموکسی‌سیلین ۵۰۰",
                    consumerUnitPrice: 450000,
                    webSource: true,
                    webSourceName: "torob",
                    crawledAt: "2026-11-17T08:00:00.000Z"
                  }
                ]
        })
      } as any;
    }
    if (u.includes("/bot/select")) {
      if (options?.selectFails) {
        return { ok: false, status: 500, json: async () => ({ error: "boom" }) } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ type: "not_found", query: "x" })
      } as any;
    }
    if (u.includes("/bot/lookup")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ type: "not_found", query: "پیتزا" })
      } as any;
    }
    const method = u.split("/").pop() ?? "";
    sent.push({ method, body: opts?.body ? JSON.parse(opts.body) : {} });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) } as any;
  }) as any;
  return {
    sent,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

const config = { token: "tok", apiBaseUrl: "http://api.test" };

test("photo message gets guidance, never silence (F1 parity)", async () => {
  const stub = stubFetch();
  clearSessionsForTest();
  try {
    await processTelegramUpdate(config, {
      message: { chat: { id: 7 }, photo: [{ file_id: "p1" }] }
    });
  } finally {
    stub.restore();
  }
  const sends = stub.sent.filter((c) => c.method === "sendMessage");
  assert.equal(sends.length, 1);
  assert.ok(sends[0].body.text.includes("عکس رسید"));
});

test("voice message gets non-text guidance; service message stays silent", async () => {
  const stub = stubFetch();
  clearSessionsForTest();
  try {
    await processTelegramUpdate(config, {
      message: { chat: { id: 7 }, voice: { file_id: "v1" } }
    });
    await processTelegramUpdate(config, {
      message: { chat: { id: 7 }, new_chat_members: [{ id: 1 }] }
    });
  } finally {
    stub.restore();
  }
  const sends = stub.sent.filter((c) => c.method === "sendMessage");
  assert.equal(sends.length, 1);
  assert.ok(sends[0].body.text.includes("به‌صورت متن"));
});

test("text search shows a typing action before the price reply", async () => {
  const stub = stubFetch();
  clearSessionsForTest();
  try {
    await processTelegramUpdate(config, {
      message: { chat: { id: 9 }, text: "آموکسی‌سیلین" }
    });
  } finally {
    stub.restore();
  }
  const actions = stub.sent.filter((c) => c.method === "sendChatAction");
  assert.ok(actions.length >= 1);
  assert.equal(actions[0].body.action, "typing");
  const sends = stub.sent.filter((c) => c.method === "sendMessage");
  assert.equal(sends.length, 1);
  assert.ok(sends[0].body.text.includes("۴۵۰٬۰۰۰ ریال"));
  // Order is part of the claim: typing is recorded before the reply.
  const typingIndex = stub.sent.findIndex((c) => c.method === "sendChatAction");
  const sendIndex = stub.sent.findIndex((c) => c.method === "sendMessage");
  assert.ok(typingIndex !== -1 && sendIndex !== -1 && typingIndex < sendIndex);
});

test("inline query answers with price articles", async () => {
  const stub = stubFetch();
  clearSessionsForTest();
  try {
    await processTelegramUpdate(config, {
      inline_query: { id: "iq1", from: { id: 5 }, query: "آموکسی‌سیلین" }
    });
  } finally {
    stub.restore();
  }
  const answers = stub.sent.filter((c) => c.method === "answerInlineQuery");
  assert.equal(answers.length, 1);
  assert.equal(answers[0].body.inline_query_id, "iq1");
  assert.ok(answers[0].body.results.length >= 1);
  assert.ok(
    answers[0].body.results[0].input_message_content.message_text.includes("۴۵۰٬۰۰۰ ریال")
  );
});

test("empty inline query answers with the hint article", async () => {
  const stub = stubFetch();
  clearSessionsForTest();
  try {
    await processTelegramUpdate(config, {
      inline_query: { id: "iq2", from: { id: 5 }, query: "  " }
    });
  } finally {
    stub.restore();
  }
  const answers = stub.sent.filter((c) => c.method === "answerInlineQuery");
  assert.equal(answers.length, 1);
  assert.ok(answers[0].body.results[0].input_message_content.message_text.includes("نام دارو"));
});

test("inline rate-limit answers an error article, never a fake not-found (review F1)", async () => {
  const stub = stubFetch({ search: "rateLimited" });
  clearSessionsForTest();
  try {
    await processTelegramUpdate(config, {
      inline_query: { id: "iq3", from: { id: 5 }, query: "آموکسی‌سیلین" }
    });
  } finally {
    stub.restore();
  }
  const answers = stub.sent.filter((c) => c.method === "answerInlineQuery");
  assert.equal(answers.length, 1);
  const text = answers[0].body.results[0].input_message_content.message_text;
  assert.ok(text.includes("محدود"));
  assert.ok(!text.includes("پیدا نشد"));
});

test("inline zero climbs the lookup ladder to the honest not-found (review F1)", async () => {
  const stub = stubFetch({ search: "empty" });
  clearSessionsForTest();
  try {
    await processTelegramUpdate(config, {
      inline_query: { id: "iq4", from: { id: 5 }, query: "پیتزا" }
    });
  } finally {
    stub.restore();
  }
  const answers = stub.sent.filter((c) => c.method === "answerInlineQuery");
  assert.equal(answers.length, 1);
  const text = answers[0].body.results[0].input_message_content.message_text;
  assert.ok(text.includes("پیدا نشد"));
  assert.ok(text.includes("نام لاتین روی جعبه"));
});

test("selection callback error raises a native alert (review T4)", async () => {
  const stub = stubFetch({ selectFails: true });
  clearSessionsForTest();
  try {
    await processTelegramUpdate(config, {
      callback_query: {
        id: "cq10",
        data: "ms:sel-1:tablet",
        message: { chat: { id: 3 }, message_id: 12 }
      }
    });
  } finally {
    stub.restore();
  }
  const answers = stub.sent.filter((c) => c.method === "answerCallbackQuery");
  assert.equal(answers.length, 1);
  assert.equal(answers[0].body.show_alert, true);
});

test("expired page callback answers with an alert and no extra message (review F3)", async () => {
  const stub = stubFetch();
  clearSessionsForTest();
  try {
    await processTelegramUpdate(config, {
      callback_query: {
        id: "cq11",
        data: "pg:1",
        message: { chat: { id: 77 }, message_id: 13 }
      }
    });
  } finally {
    stub.restore();
  }
  const answers = stub.sent.filter((c) => c.method === "answerCallbackQuery");
  assert.equal(answers.length, 1);
  assert.equal(answers[0].body.show_alert, true);
  assert.equal(stub.sent.filter((c) => c.method === "sendMessage").length, 0);
});

test("unknown callback gets a native alert, not silence", async () => {
  const stub = stubFetch();
  clearSessionsForTest();
  try {
    await processTelegramUpdate(config, {
      callback_query: {
        id: "cq9",
        data: "zz:unknown",
        message: { chat: { id: 3 }, message_id: 11 }
      }
    });
  } finally {
    stub.restore();
  }
  const answers = stub.sent.filter((c) => c.method === "answerCallbackQuery");
  assert.equal(answers.length, 1);
  assert.equal(answers[0].body.show_alert, true);
});

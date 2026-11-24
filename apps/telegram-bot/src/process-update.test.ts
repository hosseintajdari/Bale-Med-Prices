import test from "node:test";
import assert from "node:assert/strict";
import { botController } from "../../api/src/controllers/bot-controller.ts";
import { prescriptionSessionStore } from "../../api/src/services/prescription-session-store.ts";
import { selectionHistoryStore } from "../../api/src/services/selection-history-store.ts";
import { selectionSessionStore } from "../../api/src/services/selection-session-store.ts";
import { clearSessionsForTest, processTelegramUpdate, recallBasket } from "./process-update.ts";

// Conversation tests for the «قیمت نسخه» wiring: the transport (Telegram
// API + aggregator API HTTP) is mocked, but /bot/* calls run through
// the REAL bot controller, so the whole bot → API → basket-service
// chain is exercised with the repo's mock catalog.

const config = { token: "test-token", apiBaseUrl: "http://api.test" };
const CHAT_ID = 42;

test.beforeEach(() => {
  selectionHistoryStore.resetForTest();
  selectionSessionStore.resetForTest();
  prescriptionSessionStore.resetForTest();
  clearSessionsForTest();
});

function invokeBotApi(url: string) {
  const parsed = new URL(url);
  return new Promise((resolve) => {
    const response = {
      statusCode: 200,
      setHeader() {},
      end(body?: string) {
        resolve({
          ok: this.statusCode < 300,
          status: this.statusCode,
          json: async () => JSON.parse(body ?? "{}")
        });
      }
    };
    const request = { url: `${parsed.pathname}${parsed.search}` };
    if (parsed.pathname === "/bot/prescription") {
      botController.prescription(request, response);
    } else if (parsed.pathname === "/bot/select") {
      botController.select(request, response);
    } else if (parsed.pathname === "/bot/lookup") {
      botController.lookup(request, response);
    } else {
      resolve({ ok: false, status: 404, json: async () => ({}) });
    }
  });
}

function installTransport() {
  const sent: Array<any> = [];
  const answered: Array<any> = [];
  const apiCalls: string[] = [];
  const original = (globalThis as Record<string, unknown>).fetch;

  (globalThis as Record<string, unknown>).fetch = async (url: unknown, init?: any) => {
    const value = String(url);
    if (value.includes("api.telegram.org")) {
      const method = value.split("/").pop();
      const body = JSON.parse(init?.body ?? "{}");
      if (method === "sendMessage") sent.push(body);
      if (method === "answerCallbackQuery") answered.push(body);
      return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) };
    }
    const parsed = new URL(value);
    apiCalls.push(`${parsed.pathname}${parsed.search}`);
    if (parsed.pathname === "/goods/search") {
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    }
    return invokeBotApi(value);
  };

  return {
    sent,
    answered,
    apiCalls,
    restore() {
      (globalThis as Record<string, unknown>).fetch = original;
    }
  };
}

function textUpdate(text: string) {
  return { message: { chat: { id: CHAT_ID }, text } };
}

function callbackUpdate(data: string) {
  return {
    callback_query: { id: `cq-${data}`, data, message: { chat: { id: CHAT_ID } } }
  };
}

function lastSent(sent: Array<any>) {
  return sent[sent.length - 1];
}

function findButton(message: any, predicate: (button: any) => boolean) {
  for (const row of message?.reply_markup?.inline_keyboard ?? []) {
    for (const button of row) {
      if (predicate(button)) return button;
    }
  }
  return undefined;
}

function prescriptionCallCount(apiCalls: string[]) {
  return apiCalls.filter((call) => call.startsWith("/bot/prescription")).length;
}

test("rx conversation: menu → basket → selection buttons → named remove → final card → plain search again", async () => {
  const t = installTransport();
  try {
    await processTelegramUpdate(config, textUpdate("/start"));
    const start = lastSent(t.sent);
    const menuButton = findButton(start, (b) => b.callback_data === "rx:start");
    assert.ok(menuButton, "start reply carries the «قیمت نسخه» button");
    assert.ok(menuButton.text.includes("قیمت نسخه"));

    await processTelegramUpdate(config, callbackUpdate("rx:start"));
    const started = lastSent(t.sent);
    assert.ok(started.text.includes("خالی است"));
    assert.ok(findButton(started, (b) => b.callback_data === "rx:free"), "free purchase rides the first message");
    assert.ok(findButton(started, (b) => b.callback_data === "rx:exit"));
    assert.ok(recallBasket(String(CHAT_ID)));

    await processTelegramUpdate(config, textUpdate("استامینوفن"));
    const formStep = lastSent(t.sent);
    const formButton = findButton(formStep, (b) => b.text === "قرص");
    assert.ok(formButton, "basket selection buttons are offered");
    assert.ok(formButton.callback_data.startsWith("rx:sel:"));

    await processTelegramUpdate(config, callbackUpdate(formButton.callback_data));
    const strengthStep = lastSent(t.sent);
    const strengthButton = findButton(
      strengthStep,
      (b) => b.callback_data.startsWith("rx:sel:") && b.callback_data.includes("strength:")
    );
    assert.ok(strengthButton, "strength step follows in the rx: namespace");

    await processTelegramUpdate(config, callbackUpdate(strengthButton.callback_data));
    const added = lastSent(t.sent);
    assert.ok(added.text.includes("به نسخه اضافه شد"));
    assert.ok(findButton(added, (b) => b.callback_data === "rx:fin"));
    assert.ok(findButton(added, (b) => b.callback_data === "rx:rm"));

    await processTelegramUpdate(config, callbackUpdate("rx:rm"));
    const removed = lastSent(t.sent);
    assert.ok(removed.text.includes("حذف شد"));
    assert.ok(removed.text.includes("استامینوفن"), "removal names the medicine (B4)");

    await processTelegramUpdate(config, textUpdate("لوزارتان"));
    assert.ok(lastSent(t.sent).text.includes("به نسخه اضافه شد"));

    const callsBeforeFinish = prescriptionCallCount(t.apiCalls);
    await processTelegramUpdate(config, callbackUpdate("rx:fin"));
    const finalCard = lastSent(t.sent);
    assert.ok(finalCard.text.includes("جمع کل نسخه"));
    assert.ok(findButton(finalCard, (b) => b.callback_data === "rx:new"));
    assert.equal(findButton(finalCard, (b) => b.callback_data === "rx:exit"), undefined);
    assert.equal(recallBasket(String(CHAT_ID)), undefined, "finish leaves basket mode");

    await processTelegramUpdate(config, textUpdate("لوزارتان"));
    assert.equal(
      prescriptionCallCount(t.apiCalls),
      callsBeforeFinish + 1,
      "after the final card, plain text is a normal search — only the finish call hit the basket API"
    );
    assert.ok(!lastSent(t.sent).text.includes("به نسخه اضافه شد"));
  } finally {
    t.restore();
  }
});

test("rx conversation: finish with a selection still open re-shows the selection step (A2)", async () => {
  const t = installTransport();
  try {
    await processTelegramUpdate(config, callbackUpdate("rx:start"));
    await processTelegramUpdate(config, textUpdate("استامینوفن"));
    const step = lastSent(t.sent);
    assert.ok(findButton(step, (b) => b.text === "قرص"));

    await processTelegramUpdate(config, callbackUpdate("rx:fin"));
    const reminded = lastSent(t.sent);
    assert.ok(reminded.text.includes("شکل دارو را انتخاب کنید"), "the pending step comes back instead of a final card");
    assert.ok(findButton(reminded, (b) => b.text === "قرص"));
    assert.ok(recallBasket(String(CHAT_ID)), "basket is still open");

    const formButton = findButton(reminded, (b) => b.text === "قرص");
    await processTelegramUpdate(config, callbackUpdate(formButton.callback_data));
    const strengthStep = lastSent(t.sent);
    const strengthButton = findButton(
      strengthStep,
      (b) => b.callback_data.startsWith("rx:sel:") && b.callback_data.includes("strength:")
    );
    await processTelegramUpdate(config, callbackUpdate(strengthButton.callback_data));
    assert.ok(lastSent(t.sent).text.includes("به نسخه اضافه شد"));
  } finally {
    t.restore();
  }
});

test("rx conversation: finish on an empty basket answers with plain guidance, basket stays open (A1 at the bot layer)", async () => {
  const t = installTransport();
  try {
    await processTelegramUpdate(config, callbackUpdate("rx:start"));
    await processTelegramUpdate(config, callbackUpdate("rx:fin"));
    const guidance = lastSent(t.sent);
    assert.ok(guidance.text.includes("سبدتان خالی است"));
    assert.ok(recallBasket(String(CHAT_ID)), "the basket survives an early finish tap");

    await processTelegramUpdate(config, textUpdate("لوزارتان"));
    assert.ok(lastSent(t.sent).text.includes("به نسخه اضافه شد"));
  } finally {
    t.restore();
  }
});

test("rx conversation: free purchase from the first message's own button", async () => {
  const t = installTransport();
  try {
    await processTelegramUpdate(config, callbackUpdate("rx:start"));
    await processTelegramUpdate(config, callbackUpdate("rx:free"));
    const started = lastSent(t.sent);
    assert.ok(started.text.includes("خرید شما"));
    assert.ok(!started.text.includes("عکس نسخه"));

    await processTelegramUpdate(config, textUpdate("لوزارتان"));
    assert.ok(lastSent(t.sent).text.includes("به خرید اضافه شد"));

    await processTelegramUpdate(config, callbackUpdate("rx:fin"));
    const finalCard = lastSent(t.sent);
    assert.ok(finalCard.text.includes("جمع کل خرید"));
    assert.ok(finalCard.text.includes("خرید آزاد"));
  } finally {
    t.restore();
  }
});

test("rx conversation: exit returns the chat to plain price search", async () => {
  const t = installTransport();
  try {
    await processTelegramUpdate(config, callbackUpdate("rx:start"));
    const callsBeforeExit = prescriptionCallCount(t.apiCalls);

    await processTelegramUpdate(config, callbackUpdate("rx:exit"));
    assert.ok(lastSent(t.sent).text.includes("نام دارو را بفرستید"));
    assert.equal(recallBasket(String(CHAT_ID)), undefined);

    await processTelegramUpdate(config, textUpdate("لوزارتان"));
    assert.equal(prescriptionCallCount(t.apiCalls), callsBeforeExit, "no basket call after exit");
    assert.ok(!lastSent(t.sent).text.includes("به نسخه اضافه شد"));
  } finally {
    t.restore();
  }
});

test("insurance gate: the live bot flow never asks for insurance and never prints shares", async () => {
  // Owner's insurance-credibility law (2026-11-24): since Mehr 1405 the
  // share is NOT a flat percent (1,000,000-Rial initial franchise per
  // cabinet resolution 87030 + per-generic-code commitment percents +
  // subsidy + coverage exclusions), and the commitment data is not
  // wired to the bot yet. So the bot starts every basket WITHOUT an
  // insurance percent: no insurance step, no share lines on any card.
  // The module's share engine stays in place behind its own tests —
  // this test pins that the bot dispatch never exposes it.
  const t = installTransport();
  try {
    await processTelegramUpdate(config, callbackUpdate("rx:start"));
    await processTelegramUpdate(config, textUpdate("لوزارتان"));
    await processTelegramUpdate(config, callbackUpdate("rx:fin"));

    const finalCard = lastSent(t.sent);
    assert.ok(finalCard.text.includes("جمع کل نسخه"));
    assert.ok(!finalCard.text.includes("سهم بیمه"), "no insurer share line");
    assert.ok(!finalCard.text.includes("سهم شما"), "no patient share line");
    assert.ok(!finalCard.text.includes("یارانه"), "no subsidy line");
    for (const message of t.sent) {
      assert.equal(
        findButton(message, (b) => b.callback_data.includes("insurance")),
        undefined,
        "no insurance button anywhere in the flow"
      );
    }
    assert.ok(
      t.apiCalls.every((call) => !call.includes("insurancePercent")),
      "the bot never sends an insurance percent to the basket API"
    );
  } finally {
    t.restore();
  }
});

test("namespace isolation: rx: never reaches select/copy, ms:/copy: never reach the basket", async () => {
  const t = installTransport();
  try {
    // ms: goes to /bot/select only.
    await processTelegramUpdate(config, callbackUpdate("ms:sel-999:unknown"));
    assert.ok(t.apiCalls.some((call) => call.startsWith("/bot/select")));
    assert.equal(prescriptionCallCount(t.apiCalls), 0);

    // rx:sel with no open basket is answered inside the basket flow —
    // no /bot/select call, no basket API call.
    const selectCallsBefore = t.apiCalls.filter((call) => call.startsWith("/bot/select")).length;
    await processTelegramUpdate(config, callbackUpdate("rx:sel:sel-1:form:tablet"));
    assert.equal(t.apiCalls.filter((call) => call.startsWith("/bot/select")).length, selectCallsBefore);
    assert.equal(prescriptionCallCount(t.apiCalls), 0);
    assert.ok(lastSent(t.sent).text.includes("قدیمی شده"));

    // Junk inside the rx: namespace is acked as a stale button and
    // reaches no handler at all.
    const callsBefore = t.apiCalls.length;
    await processTelegramUpdate(config, callbackUpdate("rx:wat"));
    assert.equal(t.apiCalls.length, callsBefore);
    assert.ok(t.answered.some((body) => (body.text ?? "").includes("قدیمی")));

    // copy: stays the copy flow (no results remembered → its own reply).
    await processTelegramUpdate(config, callbackUpdate("copy:0"));
    assert.equal(prescriptionCallCount(t.apiCalls), 0);
    assert.ok(t.answered.some((body) => (body.text ?? "").includes("نتیجه‌ای پیدا نشد")));
  } finally {
    t.restore();
  }
});

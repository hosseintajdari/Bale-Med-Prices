import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPrescriptionMenuButton,
  buildPrescriptionMessage,
  buildPrescriptionSelectionCallback,
  fetchPrescriptionAdd,
  fetchPrescriptionFinish,
  fetchPrescriptionSelect,
  fetchPrescriptionStart,
  isPrescriptionCallback,
  parsePrescriptionCallback,
  PrescriptionRateLimitedError,
  type PrescriptionResponse
} from "./prescription-client.ts";

test("isPrescriptionCallback detects rx: callbacks only — ms:/copy: stay out", () => {
  assert.equal(isPrescriptionCallback("rx:start"), true);
  assert.equal(isPrescriptionCallback("rx:sel:sel-1:form:tablet"), true);
  assert.equal(isPrescriptionCallback("ms:sel-1:form:tablet"), false);
  assert.equal(isPrescriptionCallback("copy:0"), false);
  assert.equal(isPrescriptionCallback(""), false);
  assert.equal(isPrescriptionCallback(null), false);
  assert.equal(isPrescriptionCallback(undefined), false);
});

test("parsePrescriptionCallback maps the fixed actions", () => {
  assert.deepEqual(parsePrescriptionCallback("rx:start"), { action: "start" });
  assert.deepEqual(parsePrescriptionCallback("rx:free"), { action: "free" });
  assert.deepEqual(parsePrescriptionCallback("rx:fin"), { action: "finish" });
  assert.deepEqual(parsePrescriptionCallback("rx:rm"), { action: "remove_last" });
  assert.deepEqual(parsePrescriptionCallback("rx:new"), { action: "new_basket" });
  assert.deepEqual(parsePrescriptionCallback("rx:exit"), { action: "exit" });
});

test("parsePrescriptionCallback keeps colons inside choice ids intact", () => {
  assert.deepEqual(parsePrescriptionCallback("rx:sel:sel-3:strength:500 mg"), {
    action: "select",
    sessionId: "sel-3",
    choiceId: "strength:500 mg"
  });
  assert.deepEqual(parsePrescriptionCallback("rx:sel:sel-3:form:tablet:oral"), {
    action: "select",
    sessionId: "sel-3",
    choiceId: "form:tablet:oral"
  });
});

test("parsePrescriptionCallback rejects junk and other namespaces", () => {
  assert.equal(parsePrescriptionCallback("rx:"), null);
  assert.equal(parsePrescriptionCallback("rx:wat"), null);
  assert.equal(parsePrescriptionCallback("rx:sel:"), null);
  assert.equal(parsePrescriptionCallback("rx:sel:sel-1:"), null);
  assert.equal(parsePrescriptionCallback("rx:sel::form:tablet"), null);
  assert.equal(parsePrescriptionCallback("ms:sel-1:form:tablet"), null);
  assert.equal(parsePrescriptionCallback("copy:0"), null);
  assert.equal(parsePrescriptionCallback(null), null);
});

test("selection callbacks stay within Telegram's 64-byte cap", () => {
  const longest = buildPrescriptionSelectionCallback("sel-12", "strength:۵۰۰ میلی‌گرم");
  assert.ok(Buffer.byteLength(longest, "utf8") <= 64, longest);
  const identity = buildPrescriptionSelectionCallback("sel-12", "good:g-1020");
  assert.ok(Buffer.byteLength(identity, "utf8") <= 64, identity);
});

test("menu button is the «قیمت نسخه» entry in the rx: namespace", () => {
  assert.deepEqual(buildPrescriptionMenuButton(), {
    text: "🧾 قیمت نسخه",
    callback_data: "rx:start"
  });
});

const selectionStepResponse: PrescriptionResponse = {
  type: "needs_selection",
  basketId: "rx-1",
  query: "استامینوفن",
  sessionId: "sel-7",
  prompt: "شکل دارو را انتخاب کنید",
  choices: [
    { id: "form:tablet", label: "قرص" },
    { id: "unknown", label: "مطمئن نیستم" }
  ]
};

test("buildPrescriptionMessage renders basket selection buttons in rx:, plus the exit row", () => {
  const message = buildPrescriptionMessage(selectionStepResponse);
  assert.ok(message.text.includes("شکل دارو را انتخاب کنید"));
  assert.deepEqual(message.reply_markup?.inline_keyboard, [
    [{ text: "قرص", callback_data: "rx:sel:sel-7:form:tablet" }],
    [{ text: "مطمئن نیستم", callback_data: "rx:sel:sel-7:unknown" }],
    [{ text: "🔍 جست‌وجوی عادی", callback_data: "rx:exit" }]
  ]);
});

test("buildPrescriptionMessage maps module actions to rx: buttons", () => {
  const message = buildPrescriptionMessage({
    type: "added",
    basketId: "rx-1",
    text: "✅ به نسخه اضافه شد.",
    actions: [
      { key: "finish", label: "✅ تمام — جمع را ببین" },
      { key: "remove_last", label: "🗑 آخرین دارو را حذف کن" }
    ]
  });
  assert.equal(message.text, "✅ به نسخه اضافه شد.");
  assert.deepEqual(message.reply_markup?.inline_keyboard, [
    [{ text: "✅ تمام — جمع را ببین", callback_data: "rx:fin" }],
    [{ text: "🗑 آخرین دارو را حذف کن", callback_data: "rx:rm" }],
    [{ text: "🔍 جست‌وجوی عادی", callback_data: "rx:exit" }]
  ]);
});

test("buildPrescriptionMessage: basket start offers free purchase in the same message", () => {
  const started = buildPrescriptionMessage({
    type: "basket_started",
    basketId: "rx-1",
    kind: "prescription",
    text: "🧾 نسخه‌ی شما خالی است.",
    actions: []
  });
  assert.deepEqual(started.reply_markup?.inline_keyboard, [
    [{ text: "🛒 خرید آزاد", callback_data: "rx:free" }],
    [{ text: "🔍 جست‌وجوی عادی", callback_data: "rx:exit" }]
  ]);

  const freeStarted = buildPrescriptionMessage({
    type: "basket_started",
    basketId: "rx-2",
    kind: "free",
    text: "🧾 خرید شما خالی است.",
    actions: []
  });
  assert.deepEqual(freeStarted.reply_markup?.inline_keyboard, [
    [{ text: "🔍 جست‌وجوی عادی", callback_data: "rx:exit" }]
  ]);
});

test("buildPrescriptionMessage: the final card stands alone (new basket only, no exit)", () => {
  const message = buildPrescriptionMessage({
    type: "prescription_total",
    basketId: "rx-1",
    text: "🧾 قیمت نسخه‌ی شما",
    actions: [{ key: "new_basket", label: "🧾 نسخه‌ی تازه" }]
  });
  assert.deepEqual(message.reply_markup?.inline_keyboard, [
    [{ text: "🧾 نسخه‌ی تازه", callback_data: "rx:new" }]
  ]);
});

function stubFetch(handler: (url: string) => unknown) {
  const original = (globalThis as Record<string, unknown>).fetch;
  (globalThis as Record<string, unknown>).fetch = handler;
  return () => {
    (globalThis as Record<string, unknown>).fetch = original;
  };
}

test("fetchPrescriptionStart hits /bot/prescription with the kind only for free baskets", async () => {
  const seen: string[] = [];
  const restore = stubFetch(async (url: string) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => ({ type: "basket_started", basketId: "rx-1" }) };
  });
  try {
    await fetchPrescriptionStart("https://api.test/", undefined);
    await fetchPrescriptionStart("https://api.test/", "free");
    const first = new URL(seen[0]);
    assert.equal(first.pathname, "/bot/prescription");
    assert.equal(first.searchParams.get("action"), "start");
    assert.equal(first.searchParams.get("kind"), null);
    assert.equal(new URL(seen[1]).searchParams.get("kind"), "free");
  } finally {
    restore();
  }
});

test("fetchPrescription add/select/finish send basket coordinates as query params", async () => {
  const seen: string[] = [];
  const restore = stubFetch(async (url: string) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => ({ type: "added" }) };
  });
  try {
    await fetchPrescriptionAdd("https://api.test", "rx-4", "استامینوفن");
    await fetchPrescriptionSelect("https://api.test", "rx-4", "sel-9", "form:tablet:oral");
    await fetchPrescriptionFinish("https://api.test", "rx-4");

    const add = new URL(seen[0]).searchParams;
    assert.equal(add.get("action"), "add");
    assert.equal(add.get("basketId"), "rx-4");
    assert.equal(add.get("q"), "استامینوفن");

    const select = new URL(seen[1]).searchParams;
    assert.equal(select.get("action"), "select");
    assert.equal(select.get("sessionId"), "sel-9");
    assert.equal(select.get("choiceId"), "form:tablet:oral");

    const finish = new URL(seen[2]).searchParams;
    assert.equal(finish.get("action"), "finish");
    assert.equal(finish.get("basketId"), "rx-4");
  } finally {
    restore();
  }
});

test("fetchPrescription maps 429 to PrescriptionRateLimitedError and surfaces API errors", async () => {
  const restore429 = stubFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }));
  try {
    await assert.rejects(fetchPrescriptionStart("https://api.test"), PrescriptionRateLimitedError);
  } finally {
    restore429();
  }

  const restore400 = stubFetch(async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: "سبد خالی است." })
  }));
  try {
    await assert.rejects(fetchPrescriptionFinish("https://api.test", "rx-1"), /سبد خالی است/);
  } finally {
    restore400();
  }
});

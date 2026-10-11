import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFallbackText,
  buildSelectionMessage,
  canonicalTitleForResolved,
  fetchLookup,
  fetchSelect,
  isSelectionCallback,
  isSelectionStep,
  LookupRateLimitedError,
  type LookupResponse
} from "./selection-client.ts";

test("isSelectionCallback detects ms: callbacks only", () => {
  assert.equal(isSelectionCallback("ms:sel-1:form:tablet"), true);
  assert.equal(isSelectionCallback("ms:sel-1:unknown"), true);
  assert.equal(isSelectionCallback("copy:0"), false);
  assert.equal(isSelectionCallback(""), false);
  assert.equal(isSelectionCallback(null), false);
  assert.equal(isSelectionCallback(undefined), false);
});

test("isSelectionStep matches the three disambiguation types", () => {
  assert.equal(isSelectionStep("needs_form_selection"), true);
  assert.equal(isSelectionStep("needs_strength_selection"), true);
  assert.equal(isSelectionStep("needs_identity_selection"), true);
  assert.equal(isSelectionStep("resolved"), false);
  assert.equal(isSelectionStep("not_found"), false);
  assert.equal(isSelectionStep(undefined), false);
});

test("canonicalTitleForResolved prefers persianTitle, then title, then query", () => {
  assert.equal(
    canonicalTitleForResolved({
      type: "resolved",
      query: "astaminofen",
      pricing: { persianTitle: "استامینوفن", title: "acetaminophen" }
    }),
    "استامینوفن"
  );
  assert.equal(
    canonicalTitleForResolved({
      type: "resolved",
      query: "astaminofen",
      pricing: { title: "acetaminophen" }
    }),
    "acetaminophen"
  );
  assert.equal(canonicalTitleForResolved({ type: "resolved", query: "astaminofen" }), "astaminofen");
  assert.equal(canonicalTitleForResolved({ type: "resolved" }), "");
});

const selectionResponse: LookupResponse = {
  type: "needs_form_selection",
  query: "استامینوفن",
  sessionId: "sel-7",
  selection: {
    kind: "single_choice",
    prompt: "شکل دارو را انتخاب کنید",
    sessionId: "sel-7",
    choices: [
      { id: "form:tablet", label: "قرص", description: "انتخاب شکل دارو", sessionId: "sel-7" },
      { id: "unknown", label: "مطمئن نیستم", description: "با مشخصات ساده‌تر ادامه بده", sessionId: "sel-7" }
    ]
  },
  telegram: {
    replyMarkup: {
      inline_keyboard: [
        [{ text: "قرص", callback_data: "ms:sel-7:form:tablet" }],
        [{ text: "مطمئن نیستم", callback_data: "ms:sel-7:unknown" }]
      ]
    }
  }
};

test("buildSelectionMessage prefers the API-built keyboard", () => {
  const message = buildSelectionMessage(selectionResponse);
  assert.ok(message.text.includes("استامینوفن"));
  assert.ok(message.text.includes("شکل دارو را انتخاب کنید"));
  assert.deepEqual(
    message.reply_markup?.inline_keyboard,
    selectionResponse.telegram?.replyMarkup?.inline_keyboard
  );
});

test("buildSelectionMessage falls back to selection.choices", () => {
  const { telegram: _telegram, ...withoutKeyboard } = selectionResponse;
  const message = buildSelectionMessage(withoutKeyboard);
  assert.deepEqual(message.reply_markup?.inline_keyboard, [
    [{ text: "قرص", callback_data: "ms:sel-7:form:tablet" }],
    [{ text: "مطمئن نیستم", callback_data: "ms:sel-7:unknown" }]
  ]);
});

test("buildSelectionMessage keeps colons inside choice ids intact", () => {
  const response: LookupResponse = {
    type: "needs_identity_selection",
    query: "قطره",
    sessionId: "sel-9",
    selection: {
      kind: "single_choice",
      prompt: "داروی مورد نظر را انتخاب کنید",
      sessionId: "sel-9",
      choices: [{ id: "good:abc-123", label: "بتامتازون | قطره چشمی", sessionId: "sel-9" }]
    }
  };
  const message = buildSelectionMessage(response);
  assert.deepEqual(message.reply_markup?.inline_keyboard, [
    [{ text: "بتامتازون | قطره چشمی", callback_data: "ms:sel-9:good:abc-123" }]
  ]);
});

test("buildFallbackText renders Persian terminal messages", () => {
  const notFound = buildFallbackText({ type: "not_found", query: "xyz" }, "xyz");
  assert.ok(notFound.includes("«xyz»"));
  assert.ok(notFound.includes("املا"));

  const refine = buildFallbackText({ type: "refine_search", query: "q" }, "q");
  assert.ok(refine.includes("دقیق"));

  assert.equal(
    buildFallbackText({ type: "expired_selection", text: "این جستجو قدیمی شده." }, "q"),
    "این جستجو قدیمی شده."
  );
  assert.equal(
    buildFallbackText({ type: "invalid_selection" }, "q"),
    "این انتخاب قدیمی شده؛ نام دارو را دوباره بفرستید."
  );
  assert.equal(buildFallbackText({ type: "weird" }, "q"), "خطا در استعلام. دوباره تلاش کنید.");
});

function stubFetch(handler: (url: string) => unknown) {
  const original = (globalThis as Record<string, unknown>).fetch;
  (globalThis as Record<string, unknown>).fetch = handler;
  return () => {
    (globalThis as Record<string, unknown>).fetch = original;
  };
}

test("fetchLookup hits /bot/lookup with the URL-encoded query", async () => {
  const seen: string[] = [];
  const restore = stubFetch(async (url: string) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => ({ type: "not_found", query: "x" }) };
  });
  try {
    const response = await fetchLookup("https://api.test/", "استامینوفن");
    assert.equal(response.type, "not_found");
    assert.equal(seen.length, 1);
    assert.ok(seen[0].startsWith("https://api.test/bot/lookup?"));
    assert.ok(seen[0].includes(`q=${encodeURIComponent("استامینوفن")}`));
  } finally {
    restore();
  }
});

test("fetchSelect sends callbackData through and keeps colons intact", async () => {
  const seen: string[] = [];
  const restore = stubFetch(async (url: string) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => ({ type: "resolved", query: "x" }) };
  });
  try {
    await fetchSelect("https://api.test", "ms:sel-3:form:tablet:oral");
    const sent = new URL(seen[0]).searchParams.get("callbackData");
    assert.equal(sent, "ms:sel-3:form:tablet:oral");
  } finally {
    restore();
  }
});

test("fetchLookup maps 429 to LookupRateLimitedError, other failures to Error", async () => {
  const restore429 = stubFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }));
  try {
    await assert.rejects(fetchLookup("https://api.test", "x"), LookupRateLimitedError);
  } finally {
    restore429();
  }

  const restore500 = stubFetch(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: "boom" })
  }));
  try {
    await assert.rejects(fetchLookup("https://api.test", "x"), /boom/);
  } finally {
    restore500();
  }
});

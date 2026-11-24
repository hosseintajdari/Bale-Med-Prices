/**
 * Prescription-client — shared «قیمت نسخه» basket flow for the price bots.
 *
 * Wraps the basket API:
 *   GET /bot/prescription?action=start|add|select|remove_last|finish&…
 *
 * The basket conversation has its OWN callback namespace, `rx:`, fully
 * separate from the `ms:` selection ladder and the `copy:` price-copy
 * buttons: an `rx:` callback never reaches the selection handler and a
 * `ms:`/`copy:` callback never reaches the basket handler.
 *
 * Callback shapes (all well under Telegram's 64-byte cap — the longest
 * realistic one, a Persian strength pick, is ~47 bytes):
 *   rx:start            open a prescription basket
 *   rx:free             open a free-purchase basket instead
 *   rx:sel:<sessionId>:<choiceId>   pick from the basket's own
 *                       suggestion buttons (choiceId may contain colons)
 *   rx:fin              finish — show the final card
 *   rx:rm               remove the last item
 *   rx:new              start a fresh basket (from the final card)
 *   rx:exit             leave basket mode — back to plain price search
 */

export interface PrescriptionChoice {
  id: string;
  label: string;
  description?: string;
}

export interface PrescriptionAction {
  key: string;
  label: string;
}

export interface PrescriptionResponse {
  type: string;
  basketId?: string;
  kind?: string;
  query?: string;
  sessionId?: string;
  prompt?: string;
  choices?: PrescriptionChoice[];
  text?: string;
  actions?: PrescriptionAction[];
}

export interface PrescriptionBotMessage {
  text: string;
  parse_mode?: string;
  reply_markup?: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
}

export type PrescriptionCallback =
  | { action: "start" }
  | { action: "free" }
  | { action: "finish" }
  | { action: "remove_last" }
  | { action: "new_basket" }
  | { action: "exit" }
  | { action: "select"; sessionId: string; choiceId: string };

export const RX_EXIT_BUTTON = { text: "🔍 جست‌وجوی عادی", callback_data: "rx:exit" };
export const RX_FREE_BUTTON = { text: "🛒 خرید آزاد", callback_data: "rx:free" };

/** The main-menu entry: sits on the bots' start reply. */
export function buildPrescriptionMenuButton(): { text: string; callback_data: string } {
  return { text: "🧾 قیمت نسخه", callback_data: "rx:start" };
}

/** Basket callbacks use their own `rx:` contract — never `ms:`/`copy:`. */
export function isPrescriptionCallback(data?: string | null): boolean {
  return typeof data === "string" && data.startsWith("rx:");
}

export function buildPrescriptionSelectionCallback(sessionId: string, choiceId: string): string {
  return `rx:sel:${sessionId}:${choiceId}`;
}

export function parsePrescriptionCallback(data?: string | null): PrescriptionCallback | null {
  if (!isPrescriptionCallback(data)) {
    return null;
  }

  const value = data as string;

  switch (value) {
    case "rx:start":
      return { action: "start" };
    case "rx:free":
      return { action: "free" };
    case "rx:fin":
      return { action: "finish" };
    case "rx:rm":
      return { action: "remove_last" };
    case "rx:new":
      return { action: "new_basket" };
    case "rx:exit":
      return { action: "exit" };
  }

  if (value.startsWith("rx:sel:")) {
    const rest = value.slice("rx:sel:".length);
    const separator = rest.indexOf(":");
    if (separator <= 0 || separator === rest.length - 1) {
      return null;
    }
    return {
      action: "select",
      sessionId: rest.slice(0, separator),
      choiceId: rest.slice(separator + 1)
    };
  }

  return null;
}

export class PrescriptionRateLimitedError extends Error {
  constructor(message = "prescription source is rate-limiting us") {
    super(message);
    this.name = "PrescriptionRateLimitedError";
  }
}

async function readPrescriptionResponse(response: Response): Promise<PrescriptionResponse> {
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Prescription API: non-JSON response (${response.status})`);
  }
  if (response.status === 429) {
    throw new PrescriptionRateLimitedError();
  }
  if (!response.ok) {
    throw new Error(payload?.error ?? `Prescription API failed (${response.status})`);
  }
  return payload as PrescriptionResponse;
}

async function fetchPrescription(
  apiBaseUrl: string,
  params: Record<string, string>
): Promise<PrescriptionResponse> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/bot/prescription?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(15000)
  });
  return readPrescriptionResponse(response);
}

export function fetchPrescriptionStart(
  apiBaseUrl: string,
  kind?: string
): Promise<PrescriptionResponse> {
  return fetchPrescription(apiBaseUrl, {
    action: "start",
    ...(kind === "free" ? { kind: "free" } : {})
  });
}

export function fetchPrescriptionAdd(
  apiBaseUrl: string,
  basketId: string,
  query: string
): Promise<PrescriptionResponse> {
  return fetchPrescription(apiBaseUrl, { action: "add", basketId, q: query });
}

export function fetchPrescriptionSelect(
  apiBaseUrl: string,
  basketId: string,
  sessionId: string,
  choiceId: string
): Promise<PrescriptionResponse> {
  return fetchPrescription(apiBaseUrl, { action: "select", basketId, sessionId, choiceId });
}

export function fetchPrescriptionRemoveLast(
  apiBaseUrl: string,
  basketId: string
): Promise<PrescriptionResponse> {
  return fetchPrescription(apiBaseUrl, { action: "remove_last", basketId });
}

export function fetchPrescriptionFinish(
  apiBaseUrl: string,
  basketId: string
): Promise<PrescriptionResponse> {
  return fetchPrescription(apiBaseUrl, { action: "finish", basketId });
}

// Module action keys → this namespace's callbacks. Unknown keys are
// skipped: the bot renders only what it knows how to dispatch.
const ACTION_CALLBACKS: Record<string, string> = {
  finish: "rx:fin",
  remove_last: "rx:rm",
  new_basket: "rx:new"
};

/**
 * One basket API response → one bot message. Selection steps get their
 * suggestion buttons (in the `rx:` namespace); basket cards get the
 * module's own action buttons; while a basket is open an exit row back
 * to plain price search rides along. The final card stands alone —
 * the basket is closed, so there is nothing to exit from.
 */
export function buildPrescriptionMessage(response: PrescriptionResponse): PrescriptionBotMessage {
  if (response.type === "needs_selection") {
    const prompt = (response.prompt ?? "").trim() || "گزینه مورد نظر را انتخاب کنید";
    const sessionId = response.sessionId ?? "";
    const keyboard = (response.choices ?? []).map((choice) => [
      { text: choice.label, callback_data: buildPrescriptionSelectionCallback(sessionId, choice.id) }
    ]);
    keyboard.push([RX_EXIT_BUTTON]);

    const lines: string[] = [];
    if (response.query?.trim()) {
      lines.push(`🔍 ${response.query.trim()}`, "");
    }
    lines.push(prompt);
    return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } };
  }

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const action of response.actions ?? []) {
    const callbackData = ACTION_CALLBACKS[action.key];
    if (callbackData) {
      keyboard.push([{ text: action.label, callback_data: callbackData }]);
    }
  }

  if (response.type === "basket_started" && response.kind !== "free") {
    keyboard.push([RX_FREE_BUTTON]);
  }

  if (response.type !== "prescription_total") {
    keyboard.push([RX_EXIT_BUTTON]);
  }

  const message: PrescriptionBotMessage = { text: response.text ?? "" };
  if (keyboard.length) {
    message.reply_markup = { inline_keyboard: keyboard };
  }
  return message;
}

/**
 * Selection-client — shared no-LLM disambiguation ladder for the price bots.
 *
 * Wraps the مد اگریگیتور bot lookup API:
 *   GET /bot/lookup?q=<query>           → typed LookupResponse
 *   GET /bot/select?callbackData=<...>   → typed LookupResponse (next step)
 *
 * The ladder (docs/search-quality.md):
 *   resolved → canonical identity known → re-query the aggregator by
 *              canonical title (price still comes from the aggregator flow)
 *   needs_form_selection / needs_strength_selection / needs_identity_selection
 *     → compact Persian menu (≤5 choices + «جستجوی دقیق‌تر» / «مطمئن نیستم»)
 *   not_found / refine_search / expired_selection / invalid_selection
 *     → terminal Persian messages
 *
 * No generative model anywhere: identity comes from the catalog's
 * deterministic normalization + constrained fuzzy matching, and learning
 * happens through the API-side selection history (recorded on resolved),
 * not through prompts.
 */

export interface SelectionChoice {
  id: string;
  label: string;
  description?: string;
  sessionId?: string;
}

export interface SelectionStep {
  kind: string;
  prompt?: string;
  sessionId?: string;
  choices: SelectionChoice[];
}

export type LookupResponseType =
  | "resolved"
  | "not_found"
  | "refine_search"
  | "needs_form_selection"
  | "needs_strength_selection"
  | "needs_identity_selection"
  | "expired_selection"
  | "invalid_selection";

export interface LookupPricing {
  goodId?: string;
  title?: string;
  persianTitle?: string;
  englishTitle?: string;
}

export interface LookupResponse {
  type: LookupResponseType | string;
  query?: string;
  sessionId?: string;
  /** Final catalog price text (present on `resolved`). */
  text?: string;
  pricing?: LookupPricing;
  selection?: SelectionStep;
  telegram?: {
    replyMarkup?: {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
  };
}

export interface SelectionBotMessage {
  text: string;
  parse_mode?: string;
  reply_markup?: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
}

/** Selection-button callbacks use the `ms:<sessionId>:<choiceId>` contract. */
export function isSelectionCallback(data?: string | null): boolean {
  return typeof data === "string" && data.startsWith("ms:");
}

export class LookupRateLimitedError extends Error {
  constructor(message = "lookup source is rate-limiting us") {
    super(message);
    this.name = "LookupRateLimitedError";
  }
}

export function isSelectionStep(type: string | undefined): boolean {
  return (
    type === "needs_form_selection" ||
    type === "needs_strength_selection" ||
    type === "needs_identity_selection"
  );
}

async function readLookupResponse(response: Response, endpoint: string): Promise<LookupResponse> {
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Lookup API ${endpoint}: non-JSON response (${response.status})`);
  }
  if (response.status === 429) {
    throw new LookupRateLimitedError();
  }
  if (!response.ok) {
    throw new Error(payload?.error ?? `Lookup API ${endpoint} failed (${response.status})`);
  }
  return payload as LookupResponse;
}

/** First step of the ladder: resolve or disambiguate a free-text query. */
export async function fetchLookup(apiBaseUrl: string, query: string): Promise<LookupResponse> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const response = await fetch(
    `${base}/bot/lookup?${new URLSearchParams({ q: query, format: "default" })}`
  );
  return readLookupResponse(response, "lookup");
}

/** Continue the ladder after the user taps a selection button. */
export async function fetchSelect(apiBaseUrl: string, callbackData: string): Promise<LookupResponse> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const response = await fetch(
    `${base}/bot/select?${new URLSearchParams({ callbackData, format: "default" })}`
  );
  return readLookupResponse(response, "select");
}

/** Canonical display title of a resolved identity — used to re-query the aggregator. */
export function canonicalTitleForResolved(response: LookupResponse): string {
  const pricing = response.pricing ?? {};
  return (
    (pricing.persianTitle ?? "").trim() ||
    (pricing.title ?? "").trim() ||
    (response.query ?? "").trim()
  );
}

/**
 * Persian disambiguation menu. Prefers the API-built Telegram keyboard
 * (exact callback_data contract); falls back to building buttons from
 * selection.choices when the keyboard is absent.
 */
export function buildSelectionMessage(response: LookupResponse): SelectionBotMessage {
  const query = (response.query ?? "").trim();
  const step = response.selection;
  const prompt = (step?.prompt ?? "").trim() || "گزینه مورد نظر را انتخاب کنید";
  const sessionId = step?.sessionId ?? response.sessionId ?? "";

  const keyboard =
    response.telegram?.replyMarkup?.inline_keyboard ??
    (step?.choices ?? []).map((choice) => [
      { text: choice.label, callback_data: `ms:${sessionId}:${choice.id}` }
    ]);

  return {
    text: [`🔍 ${query}`, "", prompt].join("\n"),
    reply_markup: { inline_keyboard: keyboard }
  };
}

/** Terminal Persian messages for the non-selection lookup outcomes. */
export function buildFallbackText(response: LookupResponse, query: string): string {
  const q = (response.query ?? query ?? "").trim();
  switch (response.type) {
    case "not_found":
      return [`برای «${q}» چیزی پیدا نشد.`, "نام را کامل‌تر بفرستید یا املا را بررسی کنید."].join(
        "\n"
      );
    case "refine_search":
      return "نتایج زیاد است؛ نام کامل‌تر یا دوز دارو را بفرستید تا دقیق پیدا شود.";
    case "expired_selection":
    case "invalid_selection":
      return (response.text ?? "").trim() || "این انتخاب قدیمی شده؛ نام دارو را دوباره بفرستید.";
    default:
      return "خطا در استعلام. دوباره تلاش کنید.";
  }
}

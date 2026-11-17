/**
 * Telegram bot library — thin client over the مد اگریگیتور pricing API.
 *
 * Native Telegram surface (F3), NOT a mechanical port of the Bale bot:
 * the patient-facing texts and price rules are the shared product law
 * (DECISIONS-REGISTRY), but the interface uses what Telegram itself
 * offers — inline keyboards under the 64-byte callback_data hard limit,
 * the bot commands menu, typing actions, callback alerts, and inline
 * mode (@bot <drug> from any chat).
 * https://api.telegram.org/bot<token>/<method>
 *
 * Privacy rule (حریم خصوصی صاحب): the bot NEVER reveals the owner's
 * identity — no name, no reference, no "built by". If asked "who owns
 * this bot?", the answer is: «یه ابزار صنفیه، مستقل از پخش‌ها.» — then silence.
 */
import {
  formatPriceBlock,
  formatPriceFa,
  formatUpdateLine,
  isStalePrice,
  sourceLabelFa,
  toPersianDigits
} from "../../../packages/domain/src/format-price.ts";
import {
  buildSelectionMessage,
  type LookupResponse,
  type SelectionBotMessage
} from "../../../packages/domain/src/selection-client.ts";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export class RateLimitedError extends Error {
  constructor(message = "price source is rate-limiting us") {
    super(message);
    this.name = "RateLimitedError";
  }
}

export interface PriceItem {
  persianTitle?: string;
  title?: string;
  consumerUnitPrice?: number;
  webSource?: boolean;
  webSourceName?: string;
  webSourceUrl?: string;
  webInStock?: boolean;
  crawledAt?: string;
}

export interface TelegramMessage {
  text: string;
  parse_mode?: string;
  reply_markup?: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
}

export function extractCommand(text?: string | null): string | null {
  if (!text?.startsWith("/")) {
    return null;
  }
  const [commandToken] = text.trim().split(/\s+/);
  return commandToken.split("@")[0].toLowerCase();
}

export function buildStartReply(): TelegramMessage {
  return {
    text: [
      "به بات قیمت دارو خوش آمدید.",
      "",
      "نام دارو را بفرستید تا قیمت رسمی‌اش را با تاریخ به‌روزرسانی ببینید.",
      "فارسی یا لاتین، حتی با غلط املایی هم قبول است.",
      "مثلاً بنویسید: آموکسی‌سیلین ۵۰۰"
    ].join("\n")
  };
}

export function buildHelpReply(): TelegramMessage {
  return {
    text: [
      "راهنما:",
      "• نام دارو را فارسی یا لاتین بفرستید — غلط املایی اشکالی ندارد",
      "• اگر دارو پیدا نشد، نام لاتین روی جعبه را هم امتحان کنید",
      "• اگر نتیجه زیاد بود، با دکمه‌های «صفحه‌ی بعد / صفحه‌ی قبل» ورق بزنید",
      "• تاریخ کنار هر قیمت، روز به‌روزرسانی همان قیمت است؛ اگر «کهنه» نوشته بود یعنی مدتی است به‌روز نشده",
      "• /start — شروع دوباره",
      "• /help — همین راهنما"
    ].join("\n")
  };
}

/** A photo is never met with silence: say plainly what the bot can and cannot do with it. */
export function buildPhotoReply(): TelegramMessage {
  return {
    text: [
      "عکس رسید.",
      "فعلاً نمی‌توانم نام دارو را از روی عکس بخوانم؛ نام روی جعبه را بنویسید و بفرستید — فارسی یا لاتین."
    ].join("\n")
  };
}

/** Voice/sticker/file and any other non-text message. */
export function buildNonTextReply(): TelegramMessage {
  return { text: "برای استعلام قیمت، نام دارو را به‌صورت متن بفرستید." };
}

function itemTitle(item: PriceItem): string {
  return (item.persianTitle ?? item.title ?? "").trim() || "نامشخص";
}

function itemSourceLabel(item: PriceItem): string {
  if (item.webSource) {
    return sourceLabelFa(item.webSourceName) || "وب";
  }
  return "کاتالوگ";
}

function stockLine(item: PriceItem): string | null {
  if (!item.webSource || item.webInStock === undefined) {
    return null;
  }
  return `موجودی آنلاین: ${item.webInStock ? "موجود" : "ناموجود"}`;
}

export const PAGE_SIZE = 5;

/**
 * Telegram's hard limit for callback_data: 64 BYTES (UTF-8), not chars.
 * A keyboard carrying even one oversized button is rejected wholesale by
 * the Bot API — the patient would get no answer at all. Every keyboard
 * this bot sends passes the guard: oversized buttons are dropped, and a
 * keyboard left empty is omitted entirely.
 */
export const CALLBACK_DATA_MAX_BYTES = 64;

const utf8Encoder = new TextEncoder();

export function callbackDataBytes(data?: string | null): number {
  if (!data) {
    return 0;
  }
  return utf8Encoder.encode(data).length;
}

export function fitsCallbackLimit(data?: string | null): boolean {
  const bytes = callbackDataBytes(data);
  return bytes > 0 && bytes <= CALLBACK_DATA_MAX_BYTES;
}

type InlineButton = { text: string; callback_data: string };

export function guardInlineKeyboard(
  keyboard: Array<Array<InlineButton>> | undefined
): Array<Array<InlineButton>> | undefined {
  if (!keyboard) {
    return undefined;
  }
  const rows = keyboard
    .map((row) => row.filter((button) => fitsCallbackLimit(button.callback_data)))
    .filter((row) => row.length > 0);
  return rows.length > 0 ? rows : undefined;
}

/** Selection menu from the shared ladder, with the Telegram guard applied. */
export function buildGuardedSelectionMessage(response: LookupResponse): SelectionBotMessage {
  const message = buildSelectionMessage(response);
  const keyboard = guardInlineKeyboard(message.reply_markup?.inline_keyboard);
  if (keyboard) {
    return { ...message, reply_markup: { inline_keyboard: keyboard } };
  }
  // Every button was oversized and dropped: the choices lived only in the
  // buttons, so a bare prompt would strand the patient — tell them the
  // way back in instead.
  const hadButtons = (message.reply_markup?.inline_keyboard ?? []).length > 0;
  return {
    text: hadButtons ? `${message.text}\nنام دارو را دوباره بفرستید.` : message.text
  };
}

/** Priceless dropped; stale sunk below fresh, stably. Shared by chat + inline rendering. */
function sortedValidItems(items: PriceItem[]): PriceItem[] {
  return items
    .filter((item) => Number(item.consumerUnitPrice) > 0)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Number(isStalePrice(a.item.crawledAt)) - Number(isStalePrice(b.item.crawledAt)) || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * One search → one paged message (owner order 2026-10-29: prev/next page
 * buttons replace the per-item copy buttons — the message itself is the
 * forwardable artifact, source and date inside it).
 *
 * - Priceless items are dropped, never rendered as «۰ ریال».
 * - Stale prices (≥ STALE_AFTER_DAYS) sink below fresh ones, stably.
 * - Variants of one product (same source URL) render as one group:
 *   name once, one short line per variant, source/age once.
 * - Keyboard: a single row with «صفحه‌ی قبل» / «صفحه‌ی بعد» (pg:<n>).
 */
export function buildPriceReply(items: PriceItem[], query: string, note?: string, page = 0): TelegramMessage {
  const sorted = sortedValidItems(items);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), totalPages - 1);
  const shown = sorted.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const lines: string[] = [`🔍 ${query}`];
  if (totalPages > 1) {
    lines.push(`صفحه‌ی ${toPersianDigits(current + 1)} از ${toPersianDigits(totalPages)}`);
  }
  lines.push("");

  if (shown.length === 0) {
    lines.push("برای این جستجو قیمت معتبر پیدا نشد.");
  }

  // Group consecutive variants that share a source URL.
  const groups: PriceItem[][] = [];
  for (const item of shown) {
    const last = groups[groups.length - 1];
    if (last && item.webSourceUrl && last[0].webSourceUrl === item.webSourceUrl) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }

  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      lines.push("", "— — —", "");
    }
    const first = group[0];
    if (group.length === 1) {
      lines.push(
        formatPriceBlock({
          productName: itemTitle(first),
          priceRial: first.consumerUnitPrice ?? 0,
          sourceLabel: itemSourceLabel(first),
          crawledAt: first.crawledAt
        })
      );
    } else {
      const titles = group.map(itemTitle);
      const sep = " — ";
      const prefix = titles[0].split(sep)[0];
      const allShare = titles.every((t) => t === prefix || t.startsWith(prefix + sep));
      lines.push(allShare ? prefix : itemTitle(first));
      for (const item of group) {
        const title = itemTitle(item);
        const variant = allShare && title.includes(sep) ? title.slice(title.indexOf(sep) + sep.length) : title;
        const out = item.webInStock === false ? " — ناموجود" : "";
        lines.push(`• ${variant}: ${formatPriceFa(item.consumerUnitPrice ?? 0)}${out}`);
      }
      lines.push(formatUpdateLine(first.crawledAt));
    }
    // Group stock line only when the state is uniform; mixed groups mark
    // the out-of-stock variants inline instead (see the loop above).
    const uniformStock =
      group.length === 1 || group.every((item) => item.webInStock === group[0].webInStock);
    const stock = uniformStock ? stockLine(first) : null;
    if (stock) {
      lines.push(stock);
    }
  });

  if (note) {
    lines.push("", note);
  }

  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];
  if (totalPages > 1) {
    const row: Array<{ text: string; callback_data: string }> = [];
    if (current > 0) {
      row.push({ text: "صفحه‌ی قبل ▶", callback_data: `pg:${current - 1}` });
    }
    if (current < totalPages - 1) {
      row.push({ text: "◀ صفحه‌ی بعد", callback_data: `pg:${current + 1}` });
    }
    keyboard.push(row);
  }

  const guarded = guardInlineKeyboard(keyboard);
  return {
    text: lines.join("\n"),
    reply_markup: guarded ? { inline_keyboard: guarded } : undefined
  };
}

export function parsePageCallback(data?: string | null): number | null {
  if (!data?.startsWith("pg:")) {
    return null;
  }
  const index = Number(data.slice("pg:".length));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

export function isPageCallback(data?: string | null): boolean {
  return parsePageCallback(data) !== null;
}

export async function callTelegramApi(token: string, method: string, body: unknown): Promise<any> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Telegram API ${method}: non-JSON response (${response.status})`);
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description ?? `Telegram API ${method} failed (${response.status})`);
  }

  return payload.result;
}

export async function sendMessage(token: string, chatId: string | number, message: TelegramMessage) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: message.text
  };
  if (message.parse_mode) {
    body.parse_mode = message.parse_mode;
  }
  if (message.reply_markup) {
    body.reply_markup = message.reply_markup;
  }
  return callTelegramApi(token, "sendMessage", body);
}


/** Edit an already-sent message in place (used by page turns). */
export async function editMessageText(
  token: string,
  chatId: string | number,
  messageId: string | number,
  message: TelegramMessage
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text: message.text
  };
  if (message.parse_mode) {
    body.parse_mode = message.parse_mode;
  }
  if (message.reply_markup) {
    body.reply_markup = message.reply_markup;
  }
  return callTelegramApi(token, "editMessageText", body);
}

export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string,
  options?: { show_alert?: boolean }
) {
  const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) {
    body.text = text;
  }
  if (options?.show_alert) {
    body.show_alert = true;
  }
  return callTelegramApi(token, "answerCallbackQuery", body);
}

/** Native typing indicator — the patient sees the bot working, not silence. Best-effort. */
export async function sendChatAction(token: string, chatId: string | number, action = "typing") {
  return callTelegramApi(token, "sendChatAction", { chat_id: chatId, action });
}

/** The Telegram Menu button list (setMyCommands). Persian, patient wording. */
export function buildBotCommands(): Array<{ command: string; description: string }> {
  return [
    { command: "start", description: "شروع — نام دارو را بفرستید" },
    { command: "help", description: "راهنمای استفاده" }
  ];
}

export async function registerTelegramCommands(token: string) {
  return callTelegramApi(token, "setMyCommands", { commands: buildBotCommands() });
}

export interface InlineQueryResultArticle {
  type: "article";
  id: string;
  title: string;
  description?: string;
  input_message_content: { message_text: string };
}

const INLINE_RESULT_LIMIT = 10;

/**
 * Inline mode (@BaleMedPricebot <drug> typed in ANY chat): each result is
 * the same patient price block the chat flow sends — Rial first, update
 * date inside — so a price shared inline is self-contained when forwarded.
 */
export function buildInlineResults(items: PriceItem[], query: string): InlineQueryResultArticle[] {
  const sorted = sortedValidItems(items);
  if (sorted.length === 0) {
    return [
      {
        type: "article",
        id: "nf",
        title: "پیدا نشد",
        description: "نام لاتین روی جعبه را امتحان کنید",
        input_message_content: {
          message_text: [
            `برای «${query}» چیزی پیدا نشد.`,
            "املا را بررسی کنید، یا نام لاتین روی جعبه را بفرستید."
          ].join("\n")
        }
      }
    ];
  }
  return sorted.slice(0, INLINE_RESULT_LIMIT).map((item, index) => ({
    type: "article" as const,
    id: `r${index}`,
    title: itemTitle(item),
    description: formatPriceFa(item.consumerUnitPrice ?? 0),
    input_message_content: {
      message_text: formatPriceBlock({
        productName: itemTitle(item),
        priceRial: item.consumerUnitPrice ?? 0,
        sourceLabel: itemSourceLabel(item),
        crawledAt: item.crawledAt
      })
    }
  }));
}

/** Answer for an empty inline query: teach the gesture instead of silence. */
export function buildInlineHintResult(): InlineQueryResultArticle {
  return {
    type: "article",
    id: "hint",
    title: "جستجوی قیمت دارو",
    description: "نام دارو را بنویسید",
    input_message_content: {
      message_text: "نام دارو را بنویسید تا قیمت رسمی‌اش را با تاریخ به‌روزرسانی ببینید."
    }
  };
}

/** A single text article — used for honest inline errors and ladder outcomes. */
export function buildInlineTextResult(
  id: string,
  title: string,
  text: string,
  description?: string
): InlineQueryResultArticle {
  return {
    type: "article",
    id,
    title,
    description,
    input_message_content: { message_text: text }
  };
}

export async function answerInlineQuery(
  token: string,
  inlineQueryId: string,
  results: InlineQueryResultArticle[]
) {
  return callTelegramApi(token, "answerInlineQuery", {
    inline_query_id: inlineQueryId,
    results,
    cache_time: 60,
    is_personal: true
  });
}

export async function registerTelegramWebhook(token: string, webhookUrl: string, webhookSecret?: string) {
  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query", "inline_query"]
  };
  if (webhookSecret) {
    body.secret_token = webhookSecret;
  }
  return callTelegramApi(token, "setWebhook", body);
}

export async function deleteTelegramWebhook(token: string) {
  return callTelegramApi(token, "deleteWebhook", { drop_pending_updates: false });
}

/** Thin call to the aggregator API: GET /goods/search?q= */
export async function fetchPriceSearch(apiBaseUrl: string, query: string): Promise<PriceItem[]> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/goods/search?${new URLSearchParams({ q: query })}`);

  if (response.status === 429) {
    throw new RateLimitedError();
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Price API: non-JSON response (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? `Price API search failed (${response.status})`);
  }

  return Array.isArray(payload?.items) ? payload.items : [];
}

export function readTelegramBotConfig(env: NodeJS.ProcessEnv = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const apiBaseUrl = env.API_BASE_URL?.trim() || `http://127.0.0.1:${env.PORT ?? 4000}`;
  const webhookUrl = env.TELEGRAM_WEBHOOK_URL?.trim() || "";
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) {
    throw new Error("TELEGRAM_WEBHOOK_URL must use HTTPS");
  }

  return { token, apiBaseUrl, webhookUrl, webhookSecret, useWebhook: Boolean(webhookUrl) };
}

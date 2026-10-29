/**
 * Bale bot library — thin client over the مد اگریگیتور pricing API.
 *
 * Mirrors apps/telegram-bot (same patterns, Bale endpoints). Bale's Bot API
 * is Telegram-compatible: https://tapi.bale.ai/bot<token>/<method>.
 * Assumptions (same family as the repo's ASSUMPTIONS_BALE_API.md):
 * inline keyboards + callback_data + Markdown code spans behave like Telegram.
 */
import {
  formatPriceBlock,
  formatPriceFa,
  formatUpdateLine,
  isStalePrice,
  sourceLabelFa,
  toPersianDigits
} from "../../../packages/domain/src/format-price.ts";

const BALE_API_BASE = "https://tapi.bale.ai";


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

export interface BaleMessage {
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

export function buildStartReply(): BaleMessage {
  return {
    text: [
      "به بات قیمت دارو خوش آمدید.",
      "",
      "نام دارو را همین‌جا بفرستید — قیمت، منبع و تاریخش را می‌گیرید.",
      "مثلاً بنویسید: آموکسی‌سیلین ۵۰۰"
    ].join("\n")
  };
}

export function buildHelpReply(): BaleMessage {
  return {
    text: [
      "راهنما:",
      "• نام دارو را به فارسی یا انگلیسی بفرستید",
      "• اگر نتیجه زیاد بود، با دکمه‌های «صفحه‌ی بعد / صفحه‌ی قبل» ورق بزنید",
      "• برای فرستادن قیمت برای بیمار، همان پیام را فوروارد کنید — منبع و تاریخ داخلش هست",
      "• /start — شروع دوباره",
      "• /help — همین راهنما"
    ].join("\n")
  };
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
export function buildPriceReply(items: PriceItem[], query: string, note?: string, page = 0): BaleMessage {
  const valid = items.filter((item) => Number(item.consumerUnitPrice) > 0);
  const sorted = valid
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Number(isStalePrice(a.item.crawledAt)) - Number(isStalePrice(b.item.crawledAt)) || a.index - b.index)
    .map(({ item }) => item);

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

  return {
    text: lines.join("\n"),
    reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined
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

export async function callBaleApi(token: string, method: string, body: unknown): Promise<any> {
  const response = await fetch(`${BALE_API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {})
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Bale API ${method}: non-JSON response (${response.status})`);
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description ?? `Bale API ${method} failed (${response.status})`);
  }

  return payload.result;
}

export async function sendMessage(token: string, chatId: string | number, message: BaleMessage) {
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
  return callBaleApi(token, "sendMessage", body);
}

/** Edit an already-sent message in place (used by page turns). */
export async function editMessageText(
  token: string,
  chatId: string | number,
  messageId: string | number,
  message: BaleMessage
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
  return callBaleApi(token, "editMessageText", body);
}

export async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string) {
  const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) {
    body.text = text;
  }
  return callBaleApi(token, "answerCallbackQuery", body);
}

export async function registerBaleWebhook(token: string, webhookUrl: string, webhookSecret?: string) {
  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"]
  };
  if (webhookSecret) {
    body.secret_token = webhookSecret;
  }
  return callBaleApi(token, "setWebhook", body);
}

export async function deleteBaleWebhook(token: string) {
  return callBaleApi(token, "deleteWebhook", { drop_pending_updates: false });
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

export function readBaleBotConfig(env: NodeJS.ProcessEnv = process.env) {
  const token = env.BALE_BOT_TOKEN?.trim();
  const apiBaseUrl = env.API_BASE_URL?.trim() || `http://127.0.0.1:${env.PORT ?? 4000}`;
  const webhookUrl = env.BALE_WEBHOOK_URL?.trim() || "";
  const webhookSecret = env.BALE_WEBHOOK_SECRET?.trim() || "";

  if (!token) {
    throw new Error("BALE_BOT_TOKEN is required");
  }
  if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) {
    throw new Error("BALE_WEBHOOK_URL must use HTTPS");
  }

  return { token, apiBaseUrl, webhookUrl, webhookSecret, useWebhook: Boolean(webhookUrl) };
}

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
  toPersianDigits
} from "../../../packages/domain/src/format-price.ts";

const BALE_API_BASE = "https://tapi.bale.ai";
const MAX_RESULTS = 5;

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
      "نام دارو را همین‌جا بفرستید — قیمت، منبع و تاریخش را می‌گیرید."
    ].join("\n")
  };
}

export function buildHelpReply(): BaleMessage {
  return {
    text: [
      "راهنما:",
      "• نام دارو را به فارسی یا انگلیسی بفرستید",
      "• زیر هر قیمت دکمه‌ی «📋 کپی» هست — قیمت را با یک تپ کپی کنید",
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
    return (item.webSourceName ?? "").trim() || "وب";
  }
  return "کاتالوگ";
}

/**
 * One search → one message: up to MAX_RESULTS doctor-friendly blocks,
 * each with its own «📋 کپی» inline button (callback_data "copy:<index>").
 */
export function buildPriceReply(items: PriceItem[], query: string): BaleMessage {
  const shown = items.slice(0, MAX_RESULTS);
  const lines: string[] = [`🔍 ${query}`, ""];
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  shown.forEach((item, index) => {
    if (index > 0) {
      lines.push("", "— — —", "");
    }
    lines.push(
      formatPriceBlock({
        productName: itemTitle(item),
        priceRial: item.consumerUnitPrice ?? 0,
        sourceLabel: itemSourceLabel(item),
        crawledAt: item.crawledAt
      })
    );
    keyboard.push([
      { text: `📋 کپی ${toPersianDigits(index + 1)}`, callback_data: `copy:${index}` }
    ]);
  });

  if (items.length > MAX_RESULTS) {
    lines.push("", `و ${toPersianDigits(items.length - MAX_RESULTS)} نتیجه‌ی دیگر — جستجو را دقیق‌تر کنید.`);
  }

  return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } };
}

/**
 * The copy payload: product name as plain text, the price alone in a
 * Markdown code span — one tap on the code copies exactly the price.
 */
export function buildCopyMessage(item: PriceItem): BaleMessage {
  const price = formatPriceFa(item.consumerUnitPrice ?? 0);
  return {
    text: `${itemTitle(item)}\n\`${price}\``,
    parse_mode: "Markdown"
  };
}

export function parseCopyCallback(data?: string | null): number | null {
  if (!data?.startsWith("copy:")) {
    return null;
  }
  const index = Number(data.slice("copy:".length));
  return Number.isInteger(index) && index >= 0 ? index : null;
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

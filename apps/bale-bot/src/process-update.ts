/**
 * Bale update routing — mirrors apps/telegram-bot/src/process-update.ts.
 *
 * - callback_query "copy:<index>" → price in a Markdown code span (one-tap copy)
 * - /start, /help → fixed replies; any other command → unknown-command reply
 * - any other text → free price search via the aggregator API
 *
 * Last search results are kept per chat in memory so the copy buttons can
 * resolve. Single-instance assumption; a restart clears pending copy targets.
 */
import {
  answerCallbackQuery,
  buildCopyMessage,
  buildHelpReply,
  buildPriceReply,
  buildStartReply,
  extractCommand,
  fetchPriceSearch,
  parseCopyCallback,
  RateLimitedError,
  sendMessage,
  type PriceItem
} from "./bale-bot-lib.ts";

interface BotConfig {
  token: string;
  apiBaseUrl: string;
}

const lastResults = new Map<string, PriceItem[]>();
const MAX_SESSIONS = 500;

export function rememberResults(chatId: string, items: PriceItem[]): void {
  if (lastResults.size >= MAX_SESSIONS) {
    const oldest = lastResults.keys().next().value;
    if (oldest !== undefined) {
      lastResults.delete(oldest);
    }
  }
  lastResults.set(chatId, items);
}

export function recallResults(chatId: string): PriceItem[] | undefined {
  return lastResults.get(chatId);
}

export function clearSessionsForTest(): void {
  lastResults.clear();
}

async function processCopyCallback(config: BotConfig, chatId: string, callbackQueryId: string, data: string) {
  const index = parseCopyCallback(data);
  const items = recallResults(chatId);
  const item = index !== null ? items?.[index] : undefined;

  if (!item) {
    await answerCallbackQuery(config.token, callbackQueryId, "نتیجه‌ای پیدا نشد؛ دوباره جستجو کنید.");
    return;
  }

  await answerCallbackQuery(config.token, callbackQueryId);
  await sendMessage(config.token, chatId, buildCopyMessage(item));
}

async function processTextMessage(config: BotConfig, chatId: string, text: string) {
  const command = extractCommand(text);

  if (command === "/start") {
    await sendMessage(config.token, chatId, buildStartReply());
    return;
  }

  if (command === "/help") {
    await sendMessage(config.token, chatId, buildHelpReply());
    return;
  }

  if (command) {
    await sendMessage(config.token, chatId, {
      text: "این دستور شناخته نشد. نام دارو را بفرستید."
    });
    return;
  }

  const query = text.trim();
  if (!query) {
    return;
  }

  let items: PriceItem[];
  try {
    items = await fetchPriceSearch(config.apiBaseUrl, query);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      await sendMessage(config.token, chatId, {
        text: "منبع قیمت محدودمان کرد؛ چند دقیقه دیگر تلاش کنید."
      });
      return;
    }
    await sendMessage(config.token, chatId, {
      text: "خطا در استعلام قیمت. دوباره تلاش کنید."
    });
    return;
  }

  if (items.length === 0) {
    await sendMessage(config.token, chatId, {
      text: `چیزی برای «${query}» پیدا نشد.`
    });
    return;
  }

  rememberResults(String(chatId), items);
  await sendMessage(config.token, chatId, buildPriceReply(items, query));
}

export async function processBaleUpdate(config: BotConfig, update: any) {
  if (update?.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    if (chatId === undefined || chatId === null || !cq.id || !cq.data) {
      return;
    }
    await processCopyCallback(config, String(chatId), cq.id, cq.data);
    return;
  }

  const message = update?.message;
  if (message?.chat?.id === undefined || message?.chat?.id === null || typeof message.text !== "string") {
    return;
  }

  await processTextMessage(config, String(message.chat.id), message.text);
}

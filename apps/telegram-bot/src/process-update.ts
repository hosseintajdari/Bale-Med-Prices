/**
 * Telegram update routing — twin of apps/bale-bot/src/process-update.ts.
 *
 * - callback_query "copy:<index>" → price in a Markdown code span (one-tap copy)
 * - callback_query "ms:<sessionId>:<choiceId>" → selection ladder step
 *   (GET /bot/select → next menu or resolved price)
 * - callback_query "rx:…" → «قیمت نسخه» basket flow (GET /bot/prescription)
 *   in its own namespace, dispatched before ms:/copy: and never mixed
 *   with them; while a basket is open for a chat, plain text goes to the
 *   basket instead of the price search
 * - /start, /help → fixed replies; any other command → unknown-command reply
 * - any other text → free price search via the aggregator API; zero results
 *   climb the no-LLM disambiguation ladder (GET /bot/lookup → selection
 *   menu → canonical retry)
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
} from "./telegram-bot-lib.ts";
import {
  buildFallbackText,
  buildIdentityGuardNote,
  buildSelectionMessage,
  canonicalTitleForResolved,
  fetchLookup,
  fetchSelect,
  isSelectionCallback,
  isSelectionStep,
  LookupRateLimitedError,
  type LookupResponse
} from "../../../packages/domain/src/selection-client.ts";
import {
  buildPrescriptionMenuButton,
  buildPrescriptionMessage,
  fetchPrescriptionAdd,
  fetchPrescriptionFinish,
  fetchPrescriptionRemoveLast,
  fetchPrescriptionSelect,
  fetchPrescriptionStart,
  isPrescriptionCallback,
  parsePrescriptionCallback,
  PrescriptionRateLimitedError,
  type PrescriptionResponse
} from "../../../packages/domain/src/prescription-client.ts";

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
  activeBaskets.clear();
}

// «قیمت نسخه»: the open basket per chat (chatId → basketId). While a
// basket is open, the chat's plain text belongs to the basket.
const activeBaskets = new Map<string, string>();

export function rememberBasket(chatId: string, basketId: string): void {
  if (activeBaskets.size >= MAX_SESSIONS) {
    const oldest = activeBaskets.keys().next().value;
    if (oldest !== undefined) {
      activeBaskets.delete(oldest);
    }
  }
  activeBaskets.set(chatId, basketId);
}

export function recallBasket(chatId: string): string | undefined {
  return activeBaskets.get(chatId);
}

export function forgetBasket(chatId: string): void {
  activeBaskets.delete(chatId);
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

/**
 * Aggregator price flow. Returns true when the user got a reply
 * (prices, rate-limit notice, or error); false when the aggregator
 * simply has nothing for the query.
 */
async function runAggregatorPriceFlow(
  config: BotConfig,
  chatId: string,
  displayQuery: string,
  note?: string
): Promise<boolean> {
  let items: PriceItem[];
  try {
    items = await fetchPriceSearch(config.apiBaseUrl, displayQuery);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      await sendMessage(config.token, chatId, {
        text: "منبع قیمت ما را محدود کرد؛ چند دقیقه دیگر تلاش کنید."
      });
      return true;
    }
    await sendMessage(config.token, chatId, {
      text: "خطا در استعلام قیمت. دوباره تلاش کنید."
    });
    return true;
  }

  if (items.length === 0) {
    return false;
  }

  rememberResults(String(chatId), items);
  await sendMessage(config.token, chatId, buildPriceReply(items, displayQuery, note));
  return true;
}

async function handleLookupResponse(
  config: BotConfig,
  chatId: string,
  query: string,
  lookup: LookupResponse
): Promise<void> {
  if (lookup.type === "resolved") {
    // Identity resolved without any LLM — re-query the aggregator by the
    // canonical title so the price still comes from live web sources.
    // The web list is fuzzy: guard the exact identity with a check note.
    const canonical = canonicalTitleForResolved(lookup);
    const title = canonical || query;
    const served = await runAggregatorPriceFlow(config, chatId, title, buildIdentityGuardNote(title));
    if (!served && lookup.text) {
      // Aggregator has no web price — fall back to the catalog price text.
      await sendMessage(config.token, chatId, { text: lookup.text });
    } else if (!served) {
      await sendMessage(config.token, chatId, {
        text: `چیزی برای «${query}» پیدا نشد.`
      });
    }
    return;
  }

  if (isSelectionStep(lookup.type)) {
    await sendMessage(config.token, chatId, buildSelectionMessage(lookup));
    return;
  }

  await sendMessage(config.token, chatId, {
    text: buildFallbackText(lookup, query)
  });
}

async function processLookupFallback(config: BotConfig, chatId: string, query: string): Promise<void> {
  let lookup: LookupResponse;
  try {
    lookup = await fetchLookup(config.apiBaseUrl, query);
  } catch (error) {
    await sendMessage(config.token, chatId, {
      text:
        error instanceof LookupRateLimitedError
          ? "درخواست‌ها محدود شدند؛ چند دقیقه دیگر تلاش کنید."
          : "خطا در استعلام. دوباره تلاش کنید."
    });
    return;
  }
  await handleLookupResponse(config, chatId, query, lookup);
}

async function processSelectionCallback(
  config: BotConfig,
  chatId: string,
  callbackQueryId: string,
  data: string
): Promise<void> {
  let lookup: LookupResponse;
  try {
    lookup = await fetchSelect(config.apiBaseUrl, data);
  } catch (error) {
    await answerCallbackQuery(
      config.token,
      callbackQueryId,
      error instanceof LookupRateLimitedError
        ? "درخواست‌ها محدود شدند؛ چند دقیقه دیگر تلاش کنید."
        : "خطا در استعلام. دوباره تلاش کنید."
    );
    return;
  }
  await answerCallbackQuery(config.token, callbackQueryId);
  await handleLookupResponse(config, chatId, lookup.query ?? "", lookup);
}

const RX_EMPTY_BASKET_TEXT = "سبدتان خالی است.\nاسم اولین دارو را بنویسید و بفرستید.";

async function sendBasketEntryMessage(config: BotConfig, chatId: string, text: string): Promise<void> {
  await sendMessage(config.token, chatId, {
    text,
    reply_markup: { inline_keyboard: [[buildPrescriptionMenuButton()]] }
  });
}

async function sendPrescriptionResponse(
  config: BotConfig,
  chatId: string,
  response: PrescriptionResponse
): Promise<void> {
  if (response.type === "prescription_total") {
    // The API closed the basket; the chat leaves basket mode too.
    forgetBasket(chatId);
  } else if (response.basketId) {
    rememberBasket(chatId, response.basketId);
  }
  await sendMessage(config.token, chatId, buildPrescriptionMessage(response));
}

/**
 * Shared error surface for basket calls. The basket service's meanings
 * stay server-side (A1): an empty-basket finish/remove is a 400 there —
 * here it becomes the plain guidance text, and the basket stays open.
 */
async function handlePrescriptionError(
  config: BotConfig,
  chatId: string,
  error: unknown
): Promise<void> {
  if (error instanceof PrescriptionRateLimitedError) {
    await sendMessage(config.token, chatId, {
      text: "درخواست‌ها محدود شدند؛ چند دقیقه دیگر تلاش کنید."
    });
    return;
  }

  const message = error instanceof Error ? error.message : "";

  if (message.includes("خالی")) {
    await sendMessage(config.token, chatId, { text: RX_EMPTY_BASKET_TEXT });
    return;
  }

  if (message.includes("قدیمی شده")) {
    forgetBasket(chatId);
    await sendBasketEntryMessage(config, chatId, "سبد نسخه قدیمی شد. از اول شروع کنید.");
    return;
  }

  await sendMessage(config.token, chatId, { text: "خطا در استعلام. دوباره تلاش کنید." });
}

async function startPrescriptionBasket(
  config: BotConfig,
  chatId: string,
  kind?: string
): Promise<void> {
  try {
    const response = await fetchPrescriptionStart(config.apiBaseUrl, kind);
    await sendPrescriptionResponse(config, chatId, response);
  } catch (error) {
    await handlePrescriptionError(config, chatId, error);
  }
}

async function processPrescriptionCallback(
  config: BotConfig,
  chatId: string,
  callbackQueryId: string,
  data: string
): Promise<void> {
  const parsed = parsePrescriptionCallback(data);

  if (!parsed) {
    await answerCallbackQuery(config.token, callbackQueryId, "این دکمه قدیمی شده است.");
    return;
  }

  await answerCallbackQuery(config.token, callbackQueryId);

  if (parsed.action === "start" || parsed.action === "new_basket") {
    await startPrescriptionBasket(config, chatId);
    return;
  }

  if (parsed.action === "free") {
    await startPrescriptionBasket(config, chatId, "free");
    return;
  }

  if (parsed.action === "exit") {
    forgetBasket(chatId);
    await sendMessage(config.token, chatId, {
      text: "نام دارو را بفرستید — قیمتش را می‌گیرید."
    });
    return;
  }

  const basketId = recallBasket(chatId);

  if (!basketId) {
    await sendBasketEntryMessage(
      config,
      chatId,
      parsed.action === "select"
        ? "این انتخاب قدیمی شده است. از اول شروع کنید."
        : "سبدی باز نیست. از اول شروع کنید."
    );
    return;
  }

  try {
    if (parsed.action === "select") {
      const response = await fetchPrescriptionSelect(
        config.apiBaseUrl,
        basketId,
        parsed.sessionId,
        parsed.choiceId
      );
      await sendPrescriptionResponse(config, chatId, response);
    } else if (parsed.action === "remove_last") {
      const response = await fetchPrescriptionRemoveLast(config.apiBaseUrl, basketId);
      await sendPrescriptionResponse(config, chatId, response);
    } else if (parsed.action === "finish") {
      const response = await fetchPrescriptionFinish(config.apiBaseUrl, basketId);
      await sendPrescriptionResponse(config, chatId, response);
    }
  } catch (error) {
    await handlePrescriptionError(config, chatId, error);
  }
}

async function processBasketText(
  config: BotConfig,
  chatId: string,
  basketId: string,
  query: string
): Promise<void> {
  try {
    const response = await fetchPrescriptionAdd(config.apiBaseUrl, basketId, query);
    await sendPrescriptionResponse(config, chatId, response);
  } catch (error) {
    await handlePrescriptionError(config, chatId, error);
  }
}

async function processTextMessage(config: BotConfig, chatId: string, text: string) {
  const command = extractCommand(text);

  if (command === "/start") {
    // A fresh start leaves basket mode too — "شروع دوباره" means it.
    forgetBasket(chatId);
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

  // While a basket is open, plain text is the next basket item.
  const basketId = recallBasket(chatId);
  if (basketId) {
    await processBasketText(config, chatId, basketId, query);
    return;
  }

  const served = await runAggregatorPriceFlow(config, chatId, query);
  if (!served) {
    // Aggregator found nothing — climb the no-LLM disambiguation ladder
    // (catalog fuzzy match → selection menu → canonical retry).
    await processLookupFallback(config, chatId, query);
  }
}

export async function processTelegramUpdate(config: BotConfig, update: any) {
  if (update?.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    if (chatId === undefined || chatId === null || !cq.id || !cq.data) {
      return;
    }
    // Namespace isolation: rx: is dispatched first and never falls
    // through to the selection or copy handlers; ms:/copy: never reach
    // the basket handler.
    if (isPrescriptionCallback(cq.data)) {
      await processPrescriptionCallback(config, String(chatId), cq.id, cq.data);
    } else if (isSelectionCallback(cq.data)) {
      await processSelectionCallback(config, String(chatId), cq.id, cq.data);
    } else {
      await processCopyCallback(config, String(chatId), cq.id, cq.data);
    }
    return;
  }

  const message = update?.message;
  if (message?.chat?.id === undefined || message?.chat?.id === null || typeof message.text !== "string") {
    return;
  }

  await processTextMessage(config, String(message.chat.id), message.text);
}

/**
 * Bale update routing — mirrors apps/telegram-bot/src/process-update.ts.
 *
 * - callback_query "pg:<page>" → turn the result page (edit in place)
 * - callback_query "ms:<sessionId>:<choiceId>" → selection ladder step
 *   (GET /bot/select → next menu or resolved price)
 * - /start, /help → fixed replies; any other command → unknown-command reply
 * - any other text → free price search via the aggregator API; zero results
 *   climb the no-LLM disambiguation ladder (GET /bot/lookup → selection
 *   menu → canonical retry)
 *
 * Last search results are kept per chat in memory so the page buttons can
 * re-render. Single-instance assumption; a restart clears pending pages.
 */
import {
  answerCallbackQuery,
  buildHelpReply,
  buildNonTextReply,
  buildPhotoReply,
  buildFuzzyNote,
  buildPriceReply,
  buildStartReply,
  extractCommand,
  fetchPriceSearchResult,
  editMessageText,
  isPageCallback,
  parsePageCallback,
  RateLimitedError,
  sendMessage,
  type PriceItem
} from "./bale-bot-lib.ts";
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

interface BotConfig {
  token: string;
  apiBaseUrl: string;
}

const lastResults = new Map<string, { items: PriceItem[]; query: string; note?: string }>();
const MAX_SESSIONS = 500;

export function rememberResults(chatId: string, items: PriceItem[], query = "", note?: string): void {
  if (lastResults.size >= MAX_SESSIONS) {
    const oldest = lastResults.keys().next().value;
    if (oldest !== undefined) {
      lastResults.delete(oldest);
    }
  }
  lastResults.set(chatId, { items, query, note });
}

export function recallResults(
  chatId: string
): { items: PriceItem[]; query: string; note?: string } | undefined {
  return lastResults.get(chatId);
}

export function clearSessionsForTest(): void {
  lastResults.clear();
}

async function processPageCallback(
  config: BotConfig,
  chatId: string,
  messageId: string | number | undefined,
  callbackQueryId: string,
  data: string
) {
  const page = parsePageCallback(data);
  const search = recallResults(chatId);
  await answerCallbackQuery(config.token, callbackQueryId);
  if (page === null || !search) {
    await sendMessage(config.token, chatId, {
      text: "این جستجو قدیمی شده؛ نام دارو را دوباره بفرستید."
    });
    return;
  }
  const message = buildPriceReply(search.items, search.query, search.note, page);
  if (messageId !== undefined) {
    try {
      await editMessageText(config.token, chatId, messageId, message);
      return;
    } catch {
      // message too old to edit — fall through and send a fresh one
    }
  }
  await sendMessage(config.token, chatId, message);
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
  let fuzzyNote: string | undefined;
  try {
    const result = await fetchPriceSearchResult(config.apiBaseUrl, displayQuery);
    items = result.items;
    // F2: a guarded-fuzzy answer is announced as a near result — the
    // caller's own note (identity guard) still wins when both exist.
    fuzzyNote = result.fuzzy ? buildFuzzyNote(result.fuzzy) : undefined;
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

  const effectiveNote = note ?? fuzzyNote;
  rememberResults(String(chatId), items, displayQuery, effectiveNote);
  await sendMessage(config.token, chatId, buildPriceReply(items, displayQuery, effectiveNote));
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

  const served = await runAggregatorPriceFlow(config, chatId, query);
  if (!served) {
    // Aggregator found nothing — climb the no-LLM disambiguation ladder
    // (catalog fuzzy match → selection menu → canonical retry).
    await processLookupFallback(config, chatId, query);
  }
}

export async function processBaleUpdate(config: BotConfig, update: any) {
  if (update?.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    if (chatId === undefined || chatId === null || !cq.id || !cq.data) {
      return;
    }
    if (isSelectionCallback(cq.data)) {
      await processSelectionCallback(config, String(chatId), cq.id, cq.data);
    } else if (isPageCallback(cq.data)) {
      await processPageCallback(config, String(chatId), cq.message?.message_id, cq.id, cq.data);
    } else {
      await answerCallbackQuery(config.token, cq.id, "این دکمه قدیمی شده؛ دوباره جستجو کنید.");
    }
    return;
  }

  const message = update?.message;
  if (message?.chat?.id === undefined || message?.chat?.id === null) {
    return;
  }

  if (typeof message.text !== "string") {
    // A patient who sends a photo of the box gets guidance, never silence.
    // Service messages (joins, pins, …) carry none of these content keys
    // and stay silent, as before.
    const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
    const hasOtherContent = ["voice", "video", "video_note", "sticker", "document", "animation", "audio", "contact", "location"]
      .some((key) => message[key] !== undefined);
    if (hasPhoto) {
      await sendMessage(config.token, String(message.chat.id), buildPhotoReply());
    } else if (hasOtherContent) {
      await sendMessage(config.token, String(message.chat.id), buildNonTextReply());
    }
    return;
  }

  await processTextMessage(config, String(message.chat.id), message.text);
}

import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import { randomBytes } from "node:crypto";

const clone = (value) => structuredClone(value);

function now() {
  return new Date().toISOString();
}

/**
 * Per-draftId FIFO serialization mutex queue with automatic pruning.
 */
export class DraftMutex {
  constructor() {
    this.tails = new Map();
  }

  runExclusive(draftId, fn) {
    const key = draftId || "current-order-draft";
    const previous = this.tails.get(key) || Promise.resolve();

    const resultPromise = previous.then(
      () => fn(),
      () => fn()
    );

    const tail = resultPromise.then(
      () => {},
      () => {}
    );

    this.tails.set(key, tail);

    tail.finally(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });

    return resultPromise;
  }
}

function createEmptyDraft(id = "current-order-draft") {
  const createdAt = now();
  return {
    id,
    status: "open",
    items: [],
    events: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function deriveStatus(items) {
  if (items.length === 0) return "open";
  return items.every((item) => item.status === "ready_for_review")
    ? "ready_for_review"
    : "needs_completion";
}

function publicDraft(draft) {
  const itemCount = draft.items.length;
  const ambiguityCount = draft.items.filter(
    (item) => item.status === "needs_completion"
  ).length;

  return {
    ...clone(draft),
    summary: { itemCount, ambiguityCount },
  };
}

/**
 * Computes the set of event IDs that are currently cancelled by an active revert.
 * Evaluates newest to oldest. If an event_reverted event is itself targeted by a newer
 * active revert, it is marked cancelled and does not cancel its target.
 */
export function getActiveRevertTargetIds(events) {
  const activeTargets = new Set();
  for (const event of events) {
    if (event.type === "event_reverted") {
      if (!activeTargets.has(event.id)) {
        activeTargets.add(event.targetEventId);
      }
    }
  }
  return activeTargets;
}

/**
 * Computes active action event IDs (excluding compensating events and cancelled events).
 */
export function getActiveEventIds(events) {
  const activeTargets = getActiveRevertTargetIds(events);
  const activeEventIds = new Set();

  for (const event of events) {
    if (event.type !== "event_reverted" && !activeTargets.has(event.id)) {
      activeEventIds.add(event.id);
    }
  }

  return activeEventIds;
}

/**
 * Deterministically projects items array by chronologically replaying active events.
 */
export function projectItems(events) {
  const activeIds = getActiveEventIds(events);
  const chronological = events.slice().reverse();
  const itemsMap = new Map();

  for (const event of chronological) {
    if (!activeIds.has(event.id)) continue;

    switch (event.type) {
      case "need_added": {
        itemsMap.set(event.itemId, {
          id: event.itemId,
          freeTextName: event.after?.freeTextName ?? event.payload?.name ?? "",
          quantity: event.after?.quantity ?? event.payload?.quantity ?? 1,
          unit: event.after?.unit ?? event.payload?.unit ?? "",
          note: event.after?.note ?? event.payload?.note ?? "",
          status: "needs_completion",
          resolvedReference: null,
          createdAt: event.after?.createdAt ?? event.occurredAt,
          updatedAt: event.after?.updatedAt ?? event.occurredAt,
        });
        break;
      }
      case "need_updated": {
        const item = itemsMap.get(event.itemId);
        if (item) {
          if (event.changes) {
            for (const [key, change] of Object.entries(event.changes)) {
              item[key] = change.to;
            }
          } else if (event.after && event.before) {
            for (const key of ["freeTextName", "quantity", "unit", "note"]) {
              if (event.after[key] !== event.before[key]) {
                item[key] = event.after[key];
              }
            }
          }
          item.updatedAt = event.occurredAt;
        }
        break;
      }
      case "need_resolved": {
        const item = itemsMap.get(event.itemId);
        if (item) {
          const ref = event.after?.resolvedReference ?? event.payload?.reference;
          item.resolvedReference = ref ? clone(ref) : null;
          item.status = "ready_for_review";
          item.updatedAt = event.occurredAt;
        }
        break;
      }
    }
  }

  return Array.from(itemsMap.values());
}

/**
 * Atomically writes data to targetPath via a unique temporary file and rename.
 */
async function atomicWriteFile(targetPath, data) {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tempPath = join(
    dir,
    `.${basename(targetPath)}.${process.pid}.${Date.now()}.${randomBytes(6).toString("hex")}.tmp`
  );
  try {
    await writeFile(tempPath, data, "utf8");
    await rename(tempPath, targetPath);
  } catch (err) {
    try {
      await unlink(tempPath);
    } catch {}
    throw err;
  }
}

export function createOrderDraftStore(statePath) {
  let loadedDraft = null;
  let loadPromise = null;
  const mutex = new DraftMutex();
  let idCounter = 0;

  function nextId(prefix) {
    idCounter += 1;
    return `${prefix}-${idCounter}-${Date.now()}`;
  }

  async function atomicPersist(draft) {
    draft.status = deriveStatus(draft.items);
    draft.updatedAt = now();
    await atomicWriteFile(statePath, `${JSON.stringify(draft, null, 2)}\n`);
  }

  async function load() {
    if (loadedDraft) return loadedDraft;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const raw = await readFile(statePath, "utf8");
        if (!raw.trim()) {
          loadedDraft = createEmptyDraft();
          await atomicPersist(loadedDraft);
          return loadedDraft;
        }
        loadedDraft = JSON.parse(raw);
        idCounter = Math.max(
          idCounter,
          (loadedDraft?.events?.length ?? 0) + (loadedDraft?.items?.length ?? 0)
        );
      } catch (error) {
        if (error?.code === "ENOENT") {
          loadedDraft = createEmptyDraft();
          await atomicPersist(loadedDraft);
        } else if (error instanceof SyntaxError) {
          const corruptPath = `${statePath}.corrupt.${Date.now()}`;
          try {
            await rename(statePath, corruptPath);
          } catch {}
          loadedDraft = createEmptyDraft();
          await atomicPersist(loadedDraft);
        } else {
          throw error;
        }
      } finally {
        loadPromise = null;
      }
      return loadedDraft;
    })();

    return loadPromise;
  }

  function recordEvent(candidate, type, itemId, before, after, extra = {}) {
    const event = {
      id: nextId("event"),
      type,
      itemId,
      ...extra,
      before: before === undefined ? undefined : (before === null ? null : clone(before)),
      after: after === undefined ? undefined : (after === null ? null : clone(after)),
      occurredAt: now(),
    };
    candidate.events.unshift(event);
    return event;
  }

  function resolveDraftKey(draftId) {
    return draftId || loadedDraft?.id || "current-order-draft";
  }

  return {
    async getDraft(args = {}) {
      const draftId = typeof args === "string" ? args : args?.draftId;
      return mutex.runExclusive(resolveDraftKey(draftId), async () => {
        const draft = await load();
        return publicDraft(draft);
      });
    },

    async addNeed(args = {}) {
      const { draftId, name, rawText, quantity, unit = "", note = "" } = args;
      return mutex.runExclusive(resolveDraftKey(draftId), async () => {
        const draft = await load();
        const rawName = name ?? rawText;
        const normalizedName = typeof rawName === "string" ? rawName.trim() : "";
        const normalizedQuantity = Number(quantity);
        if (!normalizedName) throw new Error("نام نیاز لازم است.");
        if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
          throw new Error("تعداد باید بزرگ‌تر از صفر باشد.");
        }

        const candidate = clone(draft);
        const item = {
          id: nextId("need"),
          freeTextName: normalizedName,
          quantity: normalizedQuantity,
          unit: unit ? String(unit).trim() : "",
          note: note ? String(note).trim() : "",
          status: "needs_completion",
          resolvedReference: null,
          createdAt: now(),
          updatedAt: now(),
        };

        recordEvent(candidate, "need_added", item.id, null, item, {
          payload: {
            name: item.freeTextName,
            quantity: item.quantity,
            unit: item.unit,
            note: item.note,
          },
        });
        candidate.items = projectItems(candidate.events);

        await atomicPersist(candidate);
        loadedDraft = candidate; // Candidate committed
        return publicDraft(loadedDraft);
      });
    },

    async updateNeed(args = {}) {
      const { draftId, id, needId, name, rawText, quantity, unit, note, updates } = args;
      return mutex.runExclusive(resolveDraftKey(draftId), async () => {
        const targetId = id ?? needId;
        const draft = await load();
        const candidate = clone(draft);
        const index = candidate.items.findIndex((item) => item.id === targetId);
        if (index < 0) throw new Error("ردیف موردنظر پیدا نشد.");

        const before = clone(candidate.items[index]);
        const next = clone(candidate.items[index]);

        const changes = {};
        const rawName = name ?? rawText ?? updates?.name ?? updates?.rawText;
        if (rawName !== undefined) {
          const value = typeof rawName === "string" ? rawName.trim() : "";
          if (!value) throw new Error("نام نیاز نمی‌تواند خالی باشد.");
          changes.freeTextName = { from: before.freeTextName, to: value };
          next.freeTextName = value;
        }

        const rawQuantity = quantity ?? updates?.quantity;
        if (rawQuantity !== undefined) {
          const value = Number(rawQuantity);
          if (!Number.isFinite(value) || value <= 0) {
            throw new Error("تعداد باید بزرگ‌تر از صفر باشد.");
          }
          changes.quantity = { from: before.quantity, to: value };
          next.quantity = value;
        }

        const rawUnit = unit ?? updates?.unit;
        if (rawUnit !== undefined) {
          const value = typeof rawUnit === "string" ? rawUnit.trim() : String(rawUnit).trim();
          changes.unit = { from: before.unit, to: value };
          next.unit = value;
        }

        const rawNote = note ?? updates?.note;
        if (rawNote !== undefined) {
          const value = typeof rawNote === "string" ? rawNote.trim() : String(rawNote).trim();
          changes.note = { from: before.note, to: value };
          next.note = value;
        }

        next.updatedAt = now();
        recordEvent(candidate, "need_updated", targetId, before, next, { changes });
        candidate.items = projectItems(candidate.events);

        await atomicPersist(candidate);
        loadedDraft = candidate; // Candidate committed
        return publicDraft(loadedDraft);
      });
    },

    async resolveNeed(args = {}) {
      const { draftId, id, needId, reference, catalogReference } = args;
      return mutex.runExclusive(resolveDraftKey(draftId), async () => {
        const targetId = id ?? needId;
        const ref = reference ?? catalogReference;
        const draft = await load();
        const candidate = clone(draft);
        const item = candidate.items.find((entry) => entry.id === targetId);
        if (!item) throw new Error("ردیف موردنظر پیدا نشد.");

        const title = typeof ref?.title === "string" ? ref.title.trim() : "";
        if (!title) {
          throw new Error("عنوان کالای مرجع لازم است.");
        }

        const before = clone(item);
        const next = clone(item);
        next.resolvedReference = {
          title,
          genericCode: ref.genericCode ? String(ref.genericCode).trim() : "",
          brandCode: ref.brandCode ? String(ref.brandCode).trim() : "",
          dosageForm: ref.dosageForm ? String(ref.dosageForm).trim() : "",
          strength: ref.strength ? String(ref.strength).trim() : "",
          ...(ref.goodId ? { goodId: String(ref.goodId) } : {}),
        };
        next.status = "ready_for_review";
        next.updatedAt = now();

        recordEvent(candidate, "need_resolved", targetId, before, next, {
          payload: { reference: clone(next.resolvedReference) },
        });
        candidate.items = projectItems(candidate.events);

        await atomicPersist(candidate);
        loadedDraft = candidate; // Candidate committed
        return publicDraft(loadedDraft);
      });
    },

    async revertEvent(args = {}) {
      const eventId = typeof args === "string" ? args.trim() : (args?.eventId ? String(args.eventId).trim() : "");
      const draftId = typeof args === "object" ? args?.draftId : undefined;
      return mutex.runExclusive(resolveDraftKey(draftId), async () => {
        if (!eventId) {
          throw new Error("شناسه رخداد الزامی است.");
        }

        const draft = await load();
        const candidate = clone(draft);
        const sourceEvent = candidate.events.find((event) => event.id === eventId);
        if (!sourceEvent) throw new Error("رخداد موردنظر پیدا نشد.");

        const activeReverts = getActiveRevertTargetIds(candidate.events);
        if (activeReverts.has(sourceEvent.id)) {
          throw new Error("این رخداد قبلاً بازگردانده شده است.");
        }

        const currentIndex = candidate.items.findIndex((item) => item.id === sourceEvent.itemId);
        const before = currentIndex >= 0 ? clone(candidate.items[currentIndex]) : null;

        const revertRecord = {
          id: nextId("event"),
          type: "event_reverted",
          targetEventId: sourceEvent.id,
          itemId: sourceEvent.itemId,
          before,
          after: null,
          occurredAt: now(),
        };

        candidate.events.unshift(revertRecord);
        candidate.items = projectItems(candidate.events);

        const postItem = candidate.items.find((item) => item.id === sourceEvent.itemId);
        revertRecord.after = postItem ? clone(postItem) : null;

        await atomicPersist(candidate);
        loadedDraft = candidate; // Candidate committed
        return publicDraft(loadedDraft);
      });
    },
  };
}

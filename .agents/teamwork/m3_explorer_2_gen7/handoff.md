# M3 Explorer 2 (Gen 7) Technical Investigation: Event Sourcing & Compensating Reverts (F12)

## 1. Observation

Direct examination of `src/draft-store.js`, `src/server.js`, and test suites (`test/draft-store.test.js`, `test/server-rest.test.js`, `test/e2e/tier1-feature-coverage.test.js`, `test/e2e/tier3-cross-feature.test.js`) revealed the following baseline state and concrete implementation gaps:

### 1.1 Existing Storage and In-Memory Draft Structure (`src/draft-store.js:10-20`)
```javascript
function createEmptyDraft() {
  const createdAt = now();
  return {
    id: "current-order-draft",
    status: "open",
    items: [],
    events: [],
    createdAt,
    updatedAt: createdAt,
  };
}
```
- `draft.events` stores an array of all event records.
- `draft.items` stores the current projected items.
- `draft.status` stores `"open" | "needs_completion" | "ready_for_review"`.

### 1.2 Event Sequencing and Ordering (`src/draft-store.js:67-77`)
```javascript
  async function recordEvent(type, itemId, before, after) {
    const draft = await load();
    draft.events.unshift({
      id: nextId("event", draft.events),
      type,
      itemId,
      before: before === undefined ? undefined : clone(before),
      after: after === undefined ? undefined : clone(after),
      occurredAt: now(),
    });
  }
```
- **Ordering**: Events are prepended via `draft.events.unshift(...)`, meaning `draft.events[0]` is always the most recent event.
- **External Contract**: Multiple existing tests strictly assert that `events[0]` is the latest event:
  - `test/draft-store.test.js:35`: `assert.equal(reverted.events[0].type, "event_reverted");`
  - `test/server-rest.test.js:197`: `assert.strictEqual(revertData.draft.events[0].type, "event_reverted");`
  - `test/e2e/tier1-feature-coverage.test.js:112-114`: `assert.equal(draftAfterRevert.events[0].type, "event_reverted");`
  - `test/e2e/tier3-cross-feature.test.js:168`: `assert.equal(draftRevertedQty.events[0].type, "event_reverted");`
- **Gap 1 (Missing `targetEventId`)**: `recordEvent` records `type`, `itemId`, `before`, `after`, `occurredAt`, but DOES NOT accept or persist `targetEventId`. When an event is reverted, there is no field identifying which event ID was reverted.

### 1.3 Existing Compensating Revert Implementation (`src/draft-store.js:159-178`)
```javascript
    async function revertEvent({ eventId }) {
      const draft = await load();
      const sourceEvent = draft.events.find((event) => event.id === eventId);
      if (!sourceEvent) throw new Error("رخداد موردنظر پیدا نشد.");
      const currentIndex = draft.items.findIndex((item) => item.id === sourceEvent.itemId);
      const before = currentIndex >= 0 ? clone(draft.items[currentIndex]) : null;
      const restored = sourceEvent.before === undefined ? null : clone(sourceEvent.before);

      if (restored === null) {
        if (currentIndex >= 0) draft.items.splice(currentIndex, 1);
      } else if (currentIndex >= 0) {
        draft.items[currentIndex] = restored;
      } else {
        draft.items.push(restored);
      }

      await recordEvent("event_reverted", sourceEvent.itemId, before, restored);
      await persist();
      return publicDraft(draft);
    },
```
- **Gap 2 (Destructive Snapshot Overwrite)**:
  `draft.items[currentIndex] = restored;` where `restored = clone(sourceEvent.before)`.
  If an item undergoes multiple edits (e.g. `Event 1: need_added` -> `Event 2: need_updated quantity=4` -> `Event 3: need_updated note="urgent"`), calling `revertEvent(Event 2)` sets the entire item back to `Event 2.before`. This immediately clobbers and destroys the `note="urgent"` edit from `Event 3`, even though `Event 3` was never reverted!
- **Gap 3 (No Protection Against Duplicate Reverts)**:
  If `revertEvent` is called twice with the same `eventId`, it blindly appends duplicate `event_reverted` events without checking whether `sourceEvent` is already inactive/cancelled.
- **Gap 4 (Un-Revert / Revert of Revert Ambiguity)**:
  If a user calls `revertEvent` on an `event_reverted` event (to undo the revert), `sourceEvent` is an `event_reverted` event. While the existing code restores `sourceEvent.before`, it does not record causality links (`targetEventId`), and does not properly handle nested chains of reverts.
- **Gap 5 (No Pure Projection Engine)**:
  Currently, state projection is done via ad-hoc in-place array splices and object assignments. There is no deterministic projection function `project(events) -> items` that can reconstitute draft state from the event log.

---

## 2. Logic Chain

From the observations above, we establish the requirements and algorithmic design for F12:

### 2.1 Event Schema Standardization
Every event in `draft.events` must adhere to a strict typed schema:

1. **`need_added`**:
   - `id`: string (`"event-<index>-<timestamp>"`)
   - `type`: `"need_added"`
   - `itemId`: string (`"need-<index>-<timestamp>"`)
   - `payload`: `{ name: string, quantity: number, unit: string, note: string }`
   - `before`: `null`
   - `after`: object (full initial item snapshot with `status: "needs_completion"`, `resolvedReference: null`)
   - `occurredAt`: ISO 8601 string

2. **`need_updated`**:
   - `id`: string
   - `type`: `"need_updated"`
   - `itemId`: string
   - `changes`: `{ [field]: { from: any, to: any } }` (e.g. `{ quantity: { from: 1, to: 4 } }`)
   - `before`: object (item snapshot prior to update)
   - `after`: object (item snapshot post update)
   - `occurredAt`: ISO 8601 string

3. **`need_resolved`**:
   - `id`: string
   - `type`: `"need_resolved"`
   - `itemId`: string
   - `payload`: `{ reference: { title, genericCode, brandCode, dosageForm, strength } }`
   - `before`: object (item snapshot with `status: "needs_completion"`, `resolvedReference: null`)
   - `after`: object (item snapshot with `status: "ready_for_review"`, `resolvedReference: {...}`)
   - `occurredAt`: ISO 8601 string

4. **`event_reverted`** (Compensating Event):
   - `id`: string
   - `type`: `"event_reverted"`
   - `targetEventId`: string (**MANDATORY** - identifies the specific event reversed)
   - `itemId`: string (identifies affected need item)
   - `before`: object | `null` (item snapshot before this revert was executed)
   - `after`: object | `null` (item snapshot after this revert was executed; `null` if item removed)
   - `occurredAt`: ISO 8601 string

### 2.2 Revert Chain Resolution (`getActiveEventIds`)
To support arbitrary revert chains, multi-level reverts of reverts (un-reverting), and out-of-order reverts, we evaluate active events by reading `draft.events` from newest to oldest:
- An `event_reverted` event $R$ is active if and only if NO active revert event has targeted $R$.
- If $R$ is active, its `targetEventId` is marked as cancelled (inactive).
- Therefore:
  - Reverting an action event $A$ cancels $A$.
  - Reverting revert event $R$ cancels $R$, which immediately reactivates $A$!
- Algorithm (Time Complexity: $O(N)$ single-pass):
```javascript
function getActiveEventIds(events) {
  // events array is ordered newest first (events[0] is newest)
  const activeEventIds = new Set(events.map((e) => e.id));
  const activeReverts = new Set();

  for (const event of events) {
    if (event.type === "event_reverted" && !activeReverts.has(event.id)) {
      activeReverts.add(event.targetEventId);
      activeEventIds.delete(event.id);
      activeEventIds.delete(event.targetEventId);
    }
  }

  return activeEventIds;
}
```

### 2.3 Pure Projection Function (`projectItems`)
State is projected deterministically by replaying only the active events in chronological order (oldest to newest):
```javascript
function projectItems(events) {
  const activeIds = getActiveEventIds(events);
  // Reverse to get chronological order (oldest to newest)
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
```

### 2.4 Mechanics of Specific Revert Scenarios

| Scenario | Target Event Type | State Transformation | Status & Summary Impact | History Impact |
|---|---|---|---|---|
| **1. Addition Revert** | `need_added` | Item omitted from projected `items`. | If `items.length === 0`: `status` -> `"open"`. Ambiguity count decrements. | `event_reverted` prepended with `targetEventId: target.id`. Original `need_added` retained. |
| **2. Update Revert** | `need_updated` | Only modified field(s) revert to previous state; intermediate/subsequent edits to other fields preserved. | Status unchanged. Item `updatedAt` updated. | `event_reverted` prepended with `targetEventId: target.id`. Original `need_updated` retained. |
| **3. Resolution Revert** | `need_resolved` | `resolvedReference` reset to `null`. Item status becomes `"needs_completion"`. | Draft status drops from `"ready_for_review"` to `"needs_completion"`. Ambiguity count increments by 1. | `event_reverted` prepended with `targetEventId: target.id`. Original `need_resolved` retained. |
| **4. Revert of Revert** | `event_reverted` | Target revert event is cancelled. The original event is restored to active status and re-projected. | State, status, and summary dynamically recalculate to reflect un-reverted event. | New `event_reverted` prepended with `targetEventId: targetRevert.id`. History strictly grows. |

---

## 3. Caveats

1. **Ordering Convention**:
   `draft.events` is persisted and returned newest-first (index 0 is newest event) because existing client code, MCP UI, and test suites (`test/server-rest.test.js`, `test/e2e/tier3-cross-feature.test.js`) rely on `draft.events[0]` being the latest event. Internal projection must always call `events.slice().reverse()` before applying sequential state transforms.
2. **Double Reverting**:
   If an action event is already cancelled by an active revert, calling `revertEvent` again on the same action event must throw `Error("این رخداد قبلاً بازگردانده شده است.")` (HTTP 400 `REVERT_ERROR`). This prevents duplicate conflicting records. However, calling `revertEvent` on the *revert event itself* is explicitly permitted (un-revert).
3. **Reverting Deleted Items**:
   If an item's addition (`need_added`) is currently reverted, any attempt to revert an update or resolution on that item must be rejected or no-op'd cleanly, because the item does not exist in the active draft.
4. **Parameter Aliases**:
   `addNeed`, `updateNeed`, `resolveNeed`, and `revertEvent` must accept both short and spec-named arguments (`name` / `rawText`, `id` / `needId`, `reference` / `catalogReference`, `eventId` / `{ eventId, draftId }`) to ensure zero regression across REST, MCP, and internal callers.
5. **No Mutation of Past Events**:
   Under NO circumstances should any event object in `draft.events` be mutated, updated, or spliced out. All state transitions must be purely additive.

---

## 4. Conclusion

Implementing F12 requires refactoring `src/draft-store.js` to:
1. Include `targetEventId` in `event_reverted` events.
2. Record field-level `changes` in `need_updated` events.
3. Integrate the pure `getActiveEventIds(events)` and `projectItems(events)` projection engine.
4. Make `revertEvent` append a compensating `event_reverted` record, re-project `draft.items = projectItems(draft.events)`, recalculate `draft.status = deriveStatus(draft.items)`, and persist.
5. Provide parameter aliases (`name`/`rawText`, `id`/`needId`, `reference`/`catalogReference`).

### Concrete Code Implementation for Worker

Below is the exact code drop-in recommended for `src/draft-store.js`:

```javascript
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const clone = (value) => structuredClone(value);

function now() {
  return new Date().toISOString();
}

function createEmptyDraft() {
  const createdAt = now();
  return {
    id: "current-order-draft",
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
 * Computes active event IDs by evaluating revert chains from newest to oldest.
 */
export function getActiveEventIds(events) {
  const activeEventIds = new Set(events.map((e) => e.id));
  const activeReverts = new Set();

  for (const event of events) {
    if (event.type === "event_reverted" && !activeReverts.has(event.id)) {
      activeReverts.add(event.targetEventId);
      activeEventIds.delete(event.id);
      activeEventIds.delete(event.targetEventId);
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

export function createOrderDraftStore(statePath) {
  let loadedDraft;

  async function load() {
    if (loadedDraft) return loadedDraft;
    try {
      loadedDraft = JSON.parse(await readFile(statePath, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      loadedDraft = createEmptyDraft();
      await persist();
    }
    return loadedDraft;
  }

  async function persist() {
    loadedDraft.status = deriveStatus(loadedDraft.items);
    loadedDraft.updatedAt = now();
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(loadedDraft, null, 2)}\n`, "utf8");
  }

  function nextId(prefix, collection) {
    return `${prefix}-${collection.length + 1}-${Date.now()}`;
  }

  async function recordEvent(type, itemId, before, after, extra = {}) {
    const draft = await load();
    const event = {
      id: nextId("event", draft.events),
      type,
      itemId,
      ...extra,
      before: before === undefined ? undefined : clone(before),
      after: after === undefined ? undefined : clone(after),
      occurredAt: now(),
    };
    draft.events.unshift(event);
    return event;
  }

  return {
    async getDraft() {
      return publicDraft(await load());
    },

    async addNeed({ name, rawText, quantity, unit = "", note = "" }) {
      const draft = await load();
      const normalizedName = (name ?? rawText)?.trim();
      const normalizedQuantity = Number(quantity);
      if (!normalizedName) throw new Error("نام نیاز لازم است.");
      if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
        throw new Error("تعداد باید بزرگ‌تر از صفر باشد.");
      }

      const itemId = nextId("need", draft.items);
      const item = {
        id: itemId,
        freeTextName: normalizedName,
        quantity: normalizedQuantity,
        unit: unit?.trim() ?? "",
        note: note?.trim() ?? "",
        status: "needs_completion",
        resolvedReference: null,
        createdAt: now(),
        updatedAt: now(),
      };

      await recordEvent("need_added", item.id, null, item, {
        payload: { name: normalizedName, quantity: normalizedQuantity, unit: item.unit, note: item.note },
      });
      draft.items = projectItems(draft.events);
      await persist();
      return publicDraft(draft);
    },

    async updateNeed({ id, needId, name, quantity, unit, note }) {
      const draft = await load();
      const targetId = id ?? needId;
      const index = draft.items.findIndex((item) => item.id === targetId);
      if (index < 0) throw new Error("ردیف موردنظر پیدا نشد.");
      const before = clone(draft.items[index]);
      const next = clone(draft.items[index]);

      const changes = {};
      if (name !== undefined) {
        const value = name?.trim();
        if (!value) throw new Error("نام نیاز نمی‌تواند خالی باشد.");
        changes.freeTextName = { from: before.freeTextName, to: value };
        next.freeTextName = value;
      }
      if (quantity !== undefined) {
        const value = Number(quantity);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("تعداد باید بزرگ‌تر از صفر باشد.");
        }
        changes.quantity = { from: before.quantity, to: value };
        next.quantity = value;
      }
      if (unit !== undefined) {
        const value = unit?.trim() ?? "";
        changes.unit = { from: before.unit, to: value };
        next.unit = value;
      }
      if (note !== undefined) {
        const value = note?.trim() ?? "";
        changes.note = { from: before.note, to: value };
        next.note = value;
      }
      next.updatedAt = now();

      await recordEvent("need_updated", targetId, before, next, { changes });
      draft.items = projectItems(draft.events);
      await persist();
      return publicDraft(draft);
    },

    async resolveNeed({ id, needId, reference, catalogReference }) {
      const draft = await load();
      const targetId = id ?? needId;
      const item = draft.items.find((entry) => entry.id === targetId);
      if (!item) throw new Error("ردیف موردنظر پیدا نشد.");
      const ref = reference ?? catalogReference;
      if (!ref?.title?.trim()) {
        throw new Error("عنوان کالای مرجع لازم است.");
      }
      const before = clone(item);
      const resolved = clone(item);
      resolved.resolvedReference = {
        title: ref.title.trim(),
        genericCode: ref.genericCode?.trim() ?? "",
        brandCode: ref.brandCode?.trim() ?? "",
        dosageForm: ref.dosageForm?.trim() ?? "",
        strength: ref.strength?.trim() ?? "",
      };
      resolved.status = "ready_for_review";
      resolved.updatedAt = now();

      await recordEvent("need_resolved", targetId, before, resolved, {
        payload: { reference: resolved.resolvedReference },
      });
      draft.items = projectItems(draft.events);
      await persist();
      return publicDraft(draft);
    },

    async revertEvent({ eventId }) {
      const draft = await load();
      const sourceEvent = draft.events.find((event) => event.id === eventId);
      if (!sourceEvent) throw new Error("رخداد موردنظر پیدا نشد.");

      const activeIds = getActiveEventIds(draft.events);
      if (!activeIds.has(sourceEvent.id) && sourceEvent.type !== "event_reverted") {
        throw new Error("این رخداد قبلاً بازگردانده شده است.");
      }

      const currentIndex = draft.items.findIndex((item) => item.id === sourceEvent.itemId);
      const before = currentIndex >= 0 ? clone(draft.items[currentIndex]) : null;

      // Create compensating revert event record
      const revertRecord = {
        id: nextId("event", draft.events),
        type: "event_reverted",
        targetEventId: sourceEvent.id,
        itemId: sourceEvent.itemId,
        before,
        after: null, // calculated post-projection
        occurredAt: now(),
      };

      // Prepend compensating event to log
      draft.events.unshift(revertRecord);

      // Re-project items deterministically
      draft.items = projectItems(draft.events);

      // Record post-revert state
      const postItem = draft.items.find((item) => item.id === sourceEvent.itemId);
      revertRecord.after = postItem ? clone(postItem) : null;

      await persist();
      return publicDraft(draft);
    },
  };
}
```

---

## 5. Verification Method

To independently verify the implementation, run the following test commands:

1. **Baseline Suite**:
   ```bash
   node --test
   ```
   *Expected*: 127/127 tests pass, exit code 0.

2. **Specific Draft Store Unit Tests**:
   ```bash
   node --test test/draft-store.test.js
   ```

3. **Dedicated Compensating Revert Scenarios (to add to `test/draft-store.test.js`)**:
   - **Test A: Out-of-Order Field Revert**:
     Add item (`qty: 1, note: ""`), update quantity to `4`, update note to `"Urgent"`. Revert quantity update. Assert `item.quantity === 1` and `item.note === "Urgent"`. Assert all 5 events exist.
   - **Test B: Revert of Revert (Un-revert)**:
     Add item, resolve item, revert resolution (assert item status drops to `needs_completion`), revert the revert event. Assert item returns to `ready_for_review` and `resolvedReference` is restored.
   - **Test C: Prevent Duplicate Reverts**:
     Add item, revert addition. Call `revertEvent` again with same addition event ID. Assert error `"این رخداد قبلاً بازگردانده شده است."` is thrown.
   - **Test D: `targetEventId` Presence**:
     Assert `revertEvent` produces an event where `event.targetEventId` strictly matches the input `eventId`.

4. **Integration Tests**:
   ```bash
   node --test test/server-rest.test.js
   node --test test/e2e/tier3-cross-feature.test.js
   ```

5. **Invalidation Conditions**:
   - Any event mutation or deletion in `draft.events`.
   - `events[0]` not being the latest event.
   - Stale whole-object snapshot overwriting unrelated field updates during out-of-order reverts.
   - `event_reverted` missing `targetEventId`.

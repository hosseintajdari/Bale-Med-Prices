# M3 Technical Investigation: Resilient Atomic File Persistence & Concurrency Test Harness Design (F14)

## 1. Observation

Direct examination of the PanelPH codebase reveals the following concrete implementation details and vulnerabilities:

### 1.1 Non-Atomic Disk Persistence in `src/draft-store.js`
In `src/draft-store.js` (lines 56–61):
```javascript
56:   async function persist() {
57:     loadedDraft.status = deriveStatus(loadedDraft.items);
58:     loadedDraft.updatedAt = now();
59:     await mkdir(dirname(statePath), { recursive: true });
60:     await writeFile(statePath, `${JSON.stringify(loadedDraft, null, 2)}\n`, "utf8");
61:   }
```
- Direct invocation of `writeFile(statePath, ...)` truncates the destination file immediately upon opening (`O_TRUNC | O_CREAT | O_WRONLY`). If the process receives `SIGTERM`/`SIGINT`, encounters an uncaught exception, or loses power while streaming contents, `state/order-draft.json` is left truncated (0 bytes or partial JSON string).
- In POSIX and Windows filesystems, `fs.writeFile` is **not atomic**.

### 1.2 Brittle Cold Start and Crash Recovery in `src/draft-store.js`
In `src/draft-store.js` (lines 44–54):
```javascript
44:   async function load() {
45:     if (loadedDraft) return loadedDraft;
46:     try {
47:       loadedDraft = JSON.parse(await readFile(statePath, "utf8"));
48:     } catch (error) {
49:       if (error?.code !== "ENOENT") throw error;
50:       loadedDraft = createEmptyDraft();
51:       await persist();
52:     }
53:     return loadedDraft;
54:   }
```
- Line 49 checks ONLY `error?.code !== "ENOENT"`.
- If a previous process crash or interrupted write leaves an empty file (0 bytes), `readFile` succeeds returning `""`. `JSON.parse("")` throws `SyntaxError: Unexpected end of JSON input`.
- Because `SyntaxError` does not have `code === "ENOENT"`, line 49 re-throws the error. The application crashes unconditionally on cold boot, permanently unable to start until a human manually deletes `order-draft.json`.
- If the file is corrupted with partial JSON (`{"status":`), it similarly throws `SyntaxError` and prevents application initialization.

### 1.3 Missing Concurrency Mutex within `createOrderDraftStore`
- In `src/draft-store.js`, the factory `createOrderDraftStore(statePath)` possesses **no internal serialization queue or mutex**.
- Mutex wrapping is currently located only in `src/server.js` (lines 19–35):
```javascript
19: export function wrapWithMutex(store) {
20:   let queue = Promise.resolve();
21:   const serialized = (fn) => (...args) => {
22:     const next = queue.then(() => fn.apply(store, args));
23:     queue = next.catch(() => {});
24:     return next;
25:   };
...
```
- Any direct consumer of `createOrderDraftStore` (such as unit tests, CLI utilities, background workers, or standalone test runners) executes mutating operations asynchronously in parallel without locking.
- When 50 operations are launched via `Promise.all`:
  1. All 50 concurrently call `load()`. If `loadedDraft` is not yet loaded, all 50 run `readFile` in parallel.
  2. All 50 push items into `draft.items` concurrently.
  3. All 50 call `nextId("need", draft.items)` (line 64: `${prefix}-${collection.length + 1}-${Date.now()}`), resulting in identical IDs for operations executing in the same millisecond or before collection length increments.
  4. All 50 call `writeFile(statePath, ...)` in parallel, triggering overlapping filesystem writes where the slowest or interleaved write overwrites earlier updates, causing lost updates and corrupted event sequences.

### 1.4 Test Suite Status
Running `node --test` in `/home/admin/PanelPH`:
- 127 tests pass across 11 test files (`catalog-resolver.test.js`, `draft-store.test.js`, `qanoon-adapter.test.js`, `server-rest.test.js`, `server.test.js`, and Tier 1–4 E2E suites).
- `test/draft-store-concurrency.test.js` does **not exist** yet.
- `test/draft-store.test.js` contains only 3 sequential unit tests with no concurrency or race condition checks.

---

## 2. Logic Chain

From the observations above, the required architectural and failure recovery logic is established step-by-step:

### 2.1 The Atomic Write Guarantee (Temp File + Atomic Rename)
1. **Filesystem Atomicity**: In POSIX and Windows filesystems, replacing a file via directory rename (`rename(2)` / `MoveFileExW`) is guaranteed to be an atomic metadata pointer exchange. A reader either observes the prior intact file or the newly committed file. No reader can observe an intermediate, truncated, or half-written state.
2. **Cross-Device Link Invariant**: `fs.promises.rename` across different mount points or filesystems (e.g. from `/tmp` on `tmpfs` to `/home/admin/PanelPH/state` on `ext4`) fails with `EXDEV: cross-device link not permitted`.
   - *Requirement*: The temporary file MUST be created in the **exact same directory** as `statePath`: `dirname(statePath)`.
3. **Collision-Proof Temp File Naming**: To support rapid successive writes or multi-worker environments without temp file collisions, temp filenames must incorporate a dotfile prefix (to hide from UI/watchers), target basename, process PID, high-resolution timestamp, and cryptographically random bytes:
   ```javascript
   const tempPath = join(
     dirname(statePath),
     `.${basename(statePath)}.${process.pid}.${Date.now()}.${randomBytes(6).toString("hex")}.tmp`
   );
   ```
4. **Guaranteed Cleanup on Error**: If `writeFile` or serialization throws, an immediate `catch` block unlinks `tempPath` so orphaned temporary files never accumulate on disk.

### 2.2 Resilient Cold Start and Crash Recovery
1. **Missing Directory**: `mkdir(dirname(statePath), { recursive: true })` ensures parent directories exist recursively prior to creating the temp file.
2. **Missing State File (`ENOENT`)**: Cold start initialization creates a pristine empty draft (`createEmptyDraft()`), writes it atomically, and returns.
3. **Empty / 0-Byte State File (`!raw.trim()`)**: If a legacy or external process left a 0-byte file, `load()` must detect that the content has 0 trimmed bytes and treat it as a cold start rather than feeding `""` to `JSON.parse()`.
4. **Corrupted JSON (`SyntaxError`)**: If `JSON.parse()` fails on corrupted data:
   - For auditability and disaster recovery, quarantine the broken file to `${statePath}.corrupt.${Date.now()}` via `rename`.
   - Initialize a fresh empty draft, atomically persist valid state, and return the clean draft. The application recovers automatically without manual intervention.

### 2.3 Mutex Encapsulation Inside `src/draft-store.js`
1. Moving the mutex queue from `src/server.js` directly into `createOrderDraftStore(statePath)` satisfies `PROJECT.md` line 71 ("All mutating methods pass through an internal mutex queue ensuring serial execution per draftId").
2. Encapsulating the lock guarantees that every mutation (`addNeed`, `updateNeed`, `resolveNeed`, `revertEvent`) and read (`getDraft`) operates on a strictly serialized chain.
3. Mutex-protecting `load()` ensures that concurrent calls during startup never trigger redundant concurrent disk reads or race on `loadedDraft` initialization.
4. Mutex-protecting ID generation ensures sequential, collision-free monotonically increasing IDs.

---

## 3. Concurrency Test Suite Specification

The dedicated concurrency and race condition test suite must be implemented in `test/draft-store-concurrency.test.js`. It utilizes Node.js standard modules (`node:test`, `node:assert/strict`, `node:fs/promises`, `node:os`, `node:path`) with zero external test dependencies.

### 3.1 Test Scenarios & Assertion Matrix

| # | Test Scenario | Concurrency Level | Invariants Verified |
|---|---------------|-------------------|---------------------|
| 1 | High-concurrency parallel `addNeed` | 50 simultaneous calls (`Promise.all`) | Exactly 50 items; 50 unique item IDs; 50 unique event IDs; no lost updates; memory and disk match 100%; 0 `.tmp` files |
| 2 | Mixed concurrent operations (adds, updates, resolves) | 30 simultaneous calls (10 adds, 10 updates, 10 resolves) | Exact item count (20); all updates and resolutions cleanly applied; 40 total events; correct status derivation |
| 3 | High-concurrency parallel `revertEvent` | 20 simultaneous calls | Exactly 0 remaining items; 40 events (20 `need_added` + 20 `event_reverted`); status returns to `open`; audit log preserved |
| 4 | Persistence round-trip across simulated process restart | Sequential instances, 1 shared state file | State loaded from disk into new store instance is 100% deeply equal to prior instance state |
| 5 | Cold start in non-existent nested directory | Cold initialization | Creates deep directory path recursively (`mkdir -p`); persists valid JSON; status `open` |
| 6 | Resilient recovery from unreadable/empty (0-byte) file | Startup on 0-byte file | Does not throw `SyntaxError`; recovers to clean draft; rewrites valid JSON atomically |
| 7 | Resilient recovery from corrupted/malformed JSON | Startup on broken JSON | Does not crash; quarantines corrupt file (`.corrupt.<ts>`); boots clean valid draft |
| 8 | Interleaved concurrent reads (`getDraft`) and writes | 30 writes + 30 reads simultaneously | Zero corrupted reads; every read returns a valid snapshot; final draft contains all 30 items |
| 9 | Atomic write temporary file isolation & cleanup | 20 rapid sequential writes | Directory contains only destination file; zero leftover `.tmp` artifacts |

### 3.2 Executable Test Suite Implementation (`test/draft-store-concurrency.test.js`)

Below is the complete, self-contained implementation code to be created by the Test Writer:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOrderDraftStore } from "../src/draft-store.js";

async function createTempDir() {
  return mkdtemp(join(tmpdir(), "panelph-concurrency-"));
}

test("DraftStore — Concurrency & Resilient Persistence Suite", async (t) => {
  let tempDir;

  t.beforeEach(async () => {
    tempDir = await createTempDir();
  });

  t.afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  await t.test("1. High-concurrency parallel addNeed (50 concurrent calls)", async () => {
    const statePath = join(tempDir, "draft.json");
    const store = createOrderDraftStore(statePath);
    const count = 50;

    const promises = Array.from({ length: count }, (_, i) =>
      store.addNeed({
        name: `قلم آزمایشی ${i + 1}`,
        quantity: i + 1,
        unit: "بسته",
        note: `یادداشت تستی ${i + 1}`,
      })
    );

    const results = await Promise.all(promises);

    // 1. All promises resolved
    assert.equal(results.length, count);

    // 2. Final in-memory state has exactly 50 items and 50 events
    const draft = await store.getDraft();
    assert.equal(draft.items.length, count, "Draft items count must be exactly 50");
    assert.equal(draft.events.length, count, "Draft events count must be exactly 50");
    assert.equal(draft.status, "needs_completion");

    // 3. Unique IDs verification (zero ID collisions)
    const itemIds = new Set(draft.items.map((item) => item.id));
    assert.equal(itemIds.size, count, "All 50 item IDs must be strictly unique");

    const eventIds = new Set(draft.events.map((event) => event.id));
    assert.equal(eventIds.size, count, "All 50 event IDs must be strictly unique");

    // 4. All names present (zero lost updates)
    for (let i = 1; i <= count; i++) {
      const found = draft.items.some((item) => item.freeTextName === `قلم آزمایشی ${i}`);
      assert.ok(found, `Item 'قلم آزمایشی ${i}' must exist in draft`);
    }

    // 5. Disk verification: file exists and has identical state
    const diskContent = await readFile(statePath, "utf8");
    const diskDraft = JSON.parse(diskContent);
    assert.equal(diskDraft.items.length, count, "Disk items count must match memory");
    assert.equal(diskDraft.events.length, count, "Disk events count must match memory");
    assert.equal(diskDraft.status, "needs_completion");

    // 6. Temp file cleanup verification: no leftover .tmp files
    const dirEntries = await readdir(tempDir);
    const tmpFiles = dirEntries.filter((f) => f.includes(".tmp"));
    assert.equal(tmpFiles.length, 0, "No temporary files should linger in directory");
  });

  await t.test("2. Mixed concurrent operations (adds, updates, resolves) maintain zero lost updates", async () => {
    const statePath = join(tempDir, "draft.json");
    const store = createOrderDraftStore(statePath);

    // Step 1: Pre-populate 10 items sequentially
    for (let i = 1; i <= 10; i++) {
      await store.addNeed({ name: `قلم اولیه ${i}`, quantity: 1, unit: "عدد" });
    }

    const initialDraft = await store.getDraft();
    assert.equal(initialDraft.items.length, 10);
    const initialItemIds = initialDraft.items.map((item) => item.id);

    // Step 2: Concurrently launch:
    // - 10 new additions
    // - 10 updates on initial items
    // - 10 resolutions on initial items
    const addOps = Array.from({ length: 10 }, (_, i) =>
      store.addNeed({ name: `قلم جدید ${i + 1}`, quantity: 5, unit: "بسته" })
    );

    const updateOps = initialItemIds.map((id, i) =>
      store.updateNeed({ id, quantity: 10 + i, note: `بروزرسانی همزمان ${i}` })
    );

    const resolveOps = initialItemIds.map((id, i) =>
      store.resolveNeed({
        id,
        reference: {
          title: `داروی تایید شده ${i}`,
          genericCode: `0000${i}`,
          brandCode: `0000${i}`,
        },
      })
    );

    await Promise.all([...addOps, ...updateOps, ...resolveOps]);

    const finalDraft = await store.getDraft();

    // 20 items total: 10 initial + 10 newly added
    assert.equal(finalDraft.items.length, 20);

    // 40 events: 10 initial adds + 10 new adds + 10 updates + 10 resolves
    assert.equal(finalDraft.events.length, 40);

    // All initial items have their update applied and resolution recorded
    for (let i = 0; i < 10; i++) {
      const item = finalDraft.items.find((entry) => entry.id === initialItemIds[i]);
      assert.ok(item, `Initial item ${initialItemIds[i]} must exist`);
      assert.equal(item.quantity, 10 + i, "Updated quantity must be preserved");
      assert.equal(item.note, `بروزرسانی همزمان ${i}`, "Updated note must be preserved");
      assert.ok(item.resolvedReference, "Item must be resolved");
      assert.equal(item.status, "ready_for_review");
    }

    // Overall status is needs_completion because items 11..20 are unresolved
    assert.equal(finalDraft.status, "needs_completion");

    // Disk matches memory
    const diskDraft = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(diskDraft.items.length, 20);
    assert.equal(diskDraft.events.length, 40);
  });

  await t.test("3. High-concurrency parallel reverts preserve audit trail and exact count", async () => {
    const statePath = join(tempDir, "draft.json");
    const store = createOrderDraftStore(statePath);

    // Add 20 items
    for (let i = 1; i <= 20; i++) {
      await store.addNeed({ name: `قلم حذف‌شونده ${i}`, quantity: 1 });
    }

    const draftWith20 = await store.getDraft();
    assert.equal(draftWith20.items.length, 20);
    const addEventIds = draftWith20.events
      .filter((e) => e.type === "need_added")
      .map((e) => e.id);

    assert.equal(addEventIds.length, 20);

    // Revert all 20 add events simultaneously
    const revertOps = addEventIds.map((eventId) =>
      store.revertEvent({ eventId })
    );

    await Promise.all(revertOps);

    const revertedDraft = await store.getDraft();
    // All items should be reverted (0 items)
    assert.equal(revertedDraft.items.length, 0);

    // Event audit trail is strictly append-only: 20 adds + 20 reverts = 40 events
    assert.equal(revertedDraft.events.length, 40);
    assert.equal(revertedDraft.status, "open");

    // Verify disk consistency
    const diskDraft = JSON.parse(await readFile(statePath, "utf8"));
    assert.equal(diskDraft.items.length, 0);
    assert.equal(diskDraft.events.length, 40);
  });

  await t.test("4. Persistence round-trip across simulated process restart", async () => {
    const statePath = join(tempDir, "draft.json");

    // Process Instance 1
    const store1 = createOrderDraftStore(statePath);
    await store1.addNeed({ name: `کپسول آموکسی سیلین`, quantity: 3, unit: "ورق" });
    const draft1 = await store1.addNeed({ name: `شربت دیفن هیدرامین`, quantity: 1, unit: "شیشه" });
    await store1.resolveNeed({
      id: draft1.items[0].id,
      reference: { title: "Amoxicillin 500mg", genericCode: "00123" },
    });
    const snapshot1 = await store1.getDraft();

    // Process termination simulation (discard store1 reference)
    // Process Instance 2 starts up on existing file
    const store2 = createOrderDraftStore(statePath);
    const snapshot2 = await store2.getDraft();

    assert.deepEqual(snapshot2.items, snapshot1.items, "Items must be identical after process restart");
    assert.deepEqual(snapshot2.events, snapshot1.events, "Events must be identical after process restart");
    assert.equal(snapshot2.status, snapshot1.status);
    assert.equal(snapshot2.id, snapshot1.id);

    // Verify operations continue seamlessly on restored instance
    await store2.addNeed({ name: `استامینوفن ۳۲۵`, quantity: 2 });
    const updatedSnapshot2 = await store2.getDraft();
    assert.equal(updatedSnapshot2.items.length, 3);
    assert.equal(updatedSnapshot2.events.length, 4);
  });

  await t.test("5. Resilient cold start: auto-creates nested non-existent directory", async () => {
    const deeplyNestedPath = join(tempDir, "storage", "nested", "v1", "draft.json");
    const store = createOrderDraftStore(deeplyNestedPath);

    const initial = await store.getDraft();
    assert.equal(initial.status, "open");
    assert.equal(initial.items.length, 0);

    await store.addNeed({ name: "آسپرین", quantity: 1 });

    const fileStat = await stat(deeplyNestedPath);
    assert.ok(fileStat.isFile(), "Nested state file must be created");
  });

  await t.test("6. Resilient recovery from unreadable/empty (0-byte) file", async () => {
    const statePath = join(tempDir, "draft.json");
    // Simulate truncated file left by aborted write
    await writeFile(statePath, "", "utf8");

    const store = createOrderDraftStore(statePath);
    const draft = await store.getDraft();

    assert.equal(draft.status, "open");
    assert.equal(draft.items.length, 0);

    // Verify subsequent write operates normally
    await store.addNeed({ name: "داروی بازیابی‌شده", quantity: 2 });
    const draftAfter = await store.getDraft();
    assert.equal(draftAfter.items.length, 1);
  });

  await t.test("7. Resilient recovery from corrupted/malformed JSON with quarantine", async () => {
    const statePath = join(tempDir, "draft.json");
    // Simulate damaged JSON file
    await writeFile(statePath, '{"id": "corrupted-state", "items": [ unparseable garbage', "utf8");

    const store = createOrderDraftStore(statePath);
    const draft = await store.getDraft();

    // Store recovers gracefully rather than crashing
    assert.equal(draft.status, "open");
    assert.equal(draft.items.length, 0);

    // Verify quarantine file was created
    const dirEntries = await readdir(tempDir);
    const quarantineFiles = dirEntries.filter((f) => f.includes(".corrupt."));
    assert.ok(quarantineFiles.length > 0, "Corrupted file must be quarantined for disaster audit");
  });

  await t.test("8. Interleaved concurrent reads (getDraft) during concurrent writes", async () => {
    const statePath = join(tempDir, "draft.json");
    const store = createOrderDraftStore(statePath);

    const writeOps = Array.from({ length: 30 }, (_, i) =>
      store.addNeed({ name: `قلم همزمان ${i + 1}`, quantity: 1 })
    );

    const readOps = Array.from({ length: 30 }, () => store.getDraft());

    const [writeResults, readResults] = await Promise.all([
      Promise.all(writeOps),
      Promise.all(readOps),
    ]);

    assert.equal(writeResults.length, 30);
    assert.equal(readResults.length, 30);

    // Every read returned a valid, coherent draft snapshot (no corrupted reads)
    for (const readDraft of readResults) {
      assert.ok(Array.isArray(readDraft.items));
      assert.ok(Array.isArray(readDraft.events));
      assert.ok(["open", "needs_completion", "ready_for_review"].includes(readDraft.status));
    }

    const finalDraft = await store.getDraft();
    assert.equal(finalDraft.items.length, 30);
  });

  await t.test("9. Atomic write temporary file isolation and cleanup", async () => {
    const statePath = join(tempDir, "draft.json");
    const store = createOrderDraftStore(statePath);

    for (let i = 0; i < 20; i++) {
      await store.addNeed({ name: `قلم ${i}`, quantity: 1 });
    }

    const entries = await readdir(tempDir);
    const tmpFiles = entries.filter((name) => name.endsWith(".tmp"));
    assert.equal(tmpFiles.length, 0, "All atomic temporary files must be cleaned up");
    assert.ok(entries.includes("draft.json"), "Destination file must exist");
  });
});
```

---

## 4. Caveats

1. **Multi-Process Concurrency**:
   - The in-process mutex guarantees strict serialization within a single Node.js process (which runs the dual REST/MCP server).
   - If two *separate* external OS processes attempt to write to the exact same `order-draft.json` file simultaneously, the atomic `rename` ensures that neither file is corrupted, but the last rename will overwrite the file. In PanelPH architecture, the operational server (`src/server.js`) is designed as a single singleton process managing the draft store.
2. **Filesystem Error Handling**:
   - Fatal I/O errors such as `ENOSPC` (Disk full) or `EACCES` (Permission denied) are deliberately re-thrown by the atomic persistence handler. These reflect infrastructure failures that must surface rather than being silently ignored.
3. **Quarantine Retention**:
   - Quarantining corrupted files (`draft.json.corrupt.<timestamp>`) prevents silent data loss. In a long-running production environment, log rotation or disk monitoring should ensure obsolete quarantine files are eventually archived.
4. **Compatibility with `src/server.js`**:
   - In `src/server.js`, `wrapWithMutex` is currently wrapping `store`. When internal mutex locking is added inside `createOrderDraftStore`, wrapping with `wrapWithMutex` remains completely safe and idempotent, but `wrapWithMutex` can eventually be simplified or aliased.

---

## 5. Conclusion & Concrete Instructions

### 5.1 Instructions for M3 Worker (`src/draft-store.js`)
To achieve F13 and F14 resilience, apply the following updates to `src/draft-store.js`:
1. **Import `rename` and `unlink`**: Add `rename` and `unlink` from `"node:fs/promises"`, and `randomBytes` from `"node:crypto"`.
2. **Implement `atomicWriteFile`**:
   ```javascript
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
       try { await unlink(tempPath); } catch {}
       throw err;
     }
   }
   ```
3. **Resilient `load()`**:
   - Handle empty strings (`!raw.trim()`) by initializing an empty draft and persisting atomically.
   - Catch `SyntaxError`, quarantine the corrupted file to `${statePath}.corrupt.${Date.now()}`, and initialize a fresh clean draft.
4. **Internal Mutex Queue**:
   - Implement `let queue = Promise.resolve();` inside `createOrderDraftStore`.
   - Wrap `getDraft`, `addNeed`, `updateNeed`, `resolveNeed`, `revertEvent` with `withLock`.
   - Ensure `load()` is executed under lock on the first operation.
5. **Collision-Free IDs**:
   - Update `nextId` to include a monotonic counter or random suffix:
     `let counter = 1; function nextId(prefix) { return `${prefix}-${counter++}-${Date.now()}`; }`

### 5.2 Instructions for Test Writer
1. Create `test/draft-store-concurrency.test.js` using the exact code specified in Section 3.2.
2. Run `node --test test/draft-store-concurrency.test.js` to verify all 9 concurrency and persistence tests pass.

---

## 6. Verification Method

### 6.1 Independent Verification Commands
1. Run the targeted concurrency test suite:
   ```bash
   node --test test/draft-store-concurrency.test.js
   ```
   **Expected Result**: All 9 tests pass with exit code 0.
2. Run the complete project test suite to verify zero regressions:
   ```bash
   node --test
   ```
   **Expected Result**: 100% pass across all existing 127 tests plus the 9 concurrency tests (total 136 tests).

### 6.2 Invalidation Conditions
- Any test in `test/draft-store-concurrency.test.js` fails with an unhandled rejection, race condition error, or lost update count.
- Lingering `.tmp` files found in state directories after parallel operations.
- Process crashes on startup when pointed at a 0-byte or corrupted `order-draft.json`.

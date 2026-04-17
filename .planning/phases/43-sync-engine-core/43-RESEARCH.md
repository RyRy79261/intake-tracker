# Phase 43: Sync Engine Core - Research

**Researched:** 2026-04-17
**Domain:** Bidirectional IndexedDB ↔ NeonDB sync engine, local-first writes, LWW conflict resolution
**Confidence:** HIGH on locked decisions / MEDIUM on discretionary details

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim from 43-CONTEXT.md)

**Queue + Ordering**
- **D-01:** Dirty records tracked in a dedicated Dexie op-log table (`_syncQueue`), not via dirty flags on data rows. Op-log rows carry `{id, tableName, recordId, op: 'upsert'|'delete', enqueuedAt, attempts}`. FIFO, crash-safe, decoupled from the 16 data tables.
- **D-02:** Push enforces parent-before-child ordering via a **static topological sort in code**, derived from the Phase 42 FK graph: `prescriptions → medicationPhases → phaseSchedules → doseLogs` and `intakeRecords → substanceRecords`. Groups queued ops by table and flushes in this order.
- **D-03:** Successful ops are **deleted from `_syncQueue` on ack**. Server response includes `accepted: [{queueId}]`; client deletes exactly those rows.
- **D-04:** Writes are **coalesced on enqueue**. If an unsynced op already exists for `(tableName, recordId, op='upsert')`, its `enqueuedAt` is updated rather than appending. Push reads the current Dexie row at flush time. Deletes are never coalesced with upserts — a delete op supersedes any queued upsert for the same record.

**API Surface**
- **D-05:** Two generic endpoints: `POST /api/sync/push` and `POST /api/sync/pull`. Both sit under `withAuth`, scope by session `user_id`.
- **D-06:** Push payload per op is `{queueId, tableName, op: 'upsert'|'delete', row: {...full record}}`. Full rows, not diffs. Validation via `drizzle-zod` from `src/db/schema.ts`.
- **D-07:** Pull uses a **per-table `updatedAt` cursor**. Client persists cursor map in Dexie `_syncMeta` singleton table. Request body: `{cursors: {tableName: ts}}`. Response: `{tableName: {rows: [...], hasMore: bool}}` sorted by `updatedAt ASC`. Tombstones (`deletedAt != null`) included.
- **D-08:** Pull responses are **soft-capped per table**. Client re-calls until `hasMore === false` for every table.

**Triggers + Conflict Edges**
- **D-09:** Push fires on three triggers: debounced after-write (2–5s), `online` event, `visibilitychange → visible`. No periodic timer.
- **D-10:** Pull fires on: app startup, after each successful push, `online` event. No periodic pull.
- **D-11:** Retries use **exponential backoff with cap + jitter**: 2s → 4s → 8s → 16s → capped at 60s, ±20% jitter. No max-retries, no dead-letter.
- **D-12:** Conflict edges (in precedence):
  1. Record-level LWW by `updatedAt` (SYNC-04).
  2. Exact tie → server row wins.
  3. Non-null `deletedAt` on either side → deleted wins regardless of `updatedAt`.
  4. Server authoritative on ack: push response returns server's written `updatedAt`; client overwrites local copy.

**Scope + Observability**
- **D-13:** Wires sync into `intake-service.ts` ONLY (pilot). Remaining 14 services = Phase 44.
- **D-14:** Status lives in new Zustand store `src/stores/sync-status-store.ts`. Shape: `{lastPushedAt, lastPulledAt, queueDepth, isOnline, isSyncing, lastError}`. Persisted: `lastPushedAt`, `lastPulledAt`. In-memory: the rest.
- **D-15:** Dexie **v16 migration** adds `_syncQueue` + `_syncMeta`. No changes to the 16 data tables.

**Dev/Test Fixtures**
- **D-16:** Real user backup JSON lives at `.private-fixtures/intake-tracker-backup-2026-04-17.json` (git-ignored).
- **D-17:** Dev seed script reads `DEV_SEED_JSON` env var, calls `backup-service.importBackup()`.

### Claude's Discretion (verbatim)
- Exact debounce value for after-write push trigger (2–5s range).
- Exact soft-cap for pull response size per table.
- Whether `_syncQueue` gets a compound `(tableName, recordId)` index.
- Exact auth wrapper shape — reuse Phase 41 `withAuth`.
- Whether pilot wiring goes through a thin `syncQueue.enqueue()` helper or inlines.
- Test strategy for topo-sort unit coverage.
- Shape/key of server-authoritative ack payload.

### Deferred Ideas (OUT OF SCOPE for Phase 43)
- **Phase 44:** Wiring remaining 14 services, sync status UI in Settings, "clear failed op" affordances, offline-queue overflow protection, full E2E offline→online tests.
- **Phase 45:** One-time migration wizard, mandatory backup before upload, resumable cursors, row-count verification.
- **Future (out of v2.0):** Per-field timestamps, vector clocks, cross-tab broadcast, dead-letter queue, WebSocket push-from-server.
- **Explicitly not P43:** Status UI, any service beyond `intake-service.ts`, historical migration, per-field merge, Dexie changes beyond `_syncQueue` + `_syncMeta`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-01 | User's writes go to IndexedDB immediately regardless of network state | Pattern 1 (local-first), §5 transactional write+enqueue helper, intake-service wiring section |
| SYNC-02 | Background queue pushes dirty records to NeonDB in batches when online | §3 push loop structure, §Backoff + jitter, coalesce-on-enqueue primitives |
| SYNC-03 | App pulls new/updated records on startup and periodically during use | §7 cursor race conditions, §Trigger wiring (startup + after-push + online), tombstone propagation |
| SYNC-04 | Conflicts resolve automatically via record-level LWW using updatedAt | §9 clock skew, §12 conflict rules implementation (server-side merge), deletedAt-wins rule |
| SYNC-05 | App detects online/offline transitions and syncs queued changes on reconnect | §4 online/offline + visibilitychange plumbing, single-listener SyncProvider pattern |
</phase_requirements>

## Summary

Phase 43 builds a custom bidirectional sync engine between Dexie (IndexedDB) and Neon Postgres. The architecture is fully locked by CONTEXT.md D-01..D-17: op-log table, static topo sort, two generic REST routes, debounced-push + cursor-pull, exponential backoff, record-level LWW with `deletedAt`-wins-tie, server-authoritative ack. Pilot wiring is `intake-service.ts` only; the remaining 14 services and the status UI are deferred to Phase 44.

This research focuses on the 15 **unanswered** unknowns the planner must resolve — Dexie v16 migration mechanics, coalesce primitives, the push scheduling loop, event plumbing, transactionality, drizzle-zod discriminated unions, cursor race mitigation, clock skew handling, topo-sort API, Zustand persist/SSR behavior, dev seed plumbing, E2E strategy, validation architecture, and where the schema push slots into the wave order.

**Primary recommendation:** Build the engine as four small modules (`sync-queue.ts`, `sync-topology.ts`, `sync-engine.ts`, `sync-status-store.ts`) + two API routes + a `useSyncLifecycle()` hook mounted once in `providers.tsx`. Put the Dexie v16 bump and Postgres side (which is already live from Phase 42) in Wave 0 alongside test scaffolding. Pilot wire `intake-service.ts` through a thin `enqueueAfterWrite()` helper running inside a `db.transaction()` so write + enqueue are atomic.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Local-first write + enqueue | Browser (Dexie) | — | SYNC-01 demands zero network on the write path |
| Queue coalescing + topo-ordered flush | Browser (sync-engine.ts) | — | Queue lives in IDB; ordering is client-side logic |
| Network retry / backoff scheduling | Browser (main-thread setTimeout) | — | Service worker sync is out of scope per ARCHITECTURE.md anti-pattern #4 |
| Online/offline detection | Browser (navigator + visibility) | — | Zero-dependency, standard Web API |
| Sync status state | Browser (Zustand store + localStorage) | — | Matches settings-store pattern; no server persistence needed in P43 |
| Payload validation | API / Backend (drizzle-zod) | — | Server authoritative; client trust boundary sits at push route |
| LWW conflict resolution + merge | API / Backend (push route handler) | — | Server holds authoritative `updatedAt` (D-12) |
| Cursor-paginated change feed | API / Backend (pull route) | Database (index on `(user_id, updated_at)`) | Cursor math must be authoritative; existing `idx_intake_user_updated` already in place |
| Tombstone propagation | API / Backend → Browser | — | Server returns rows with `deletedAt != null`; client writes as-is |
| Dev fixture seeding | Browser (backup-service.importBackup) | — | IndexedDB only exists in browsers; seed must run via dev UI or console, not Node |

**Implication for planner:** every task in this phase is either Browser-tier or API-tier. There is no Frontend-Server (SSR) or CDN work. The push/pull routes are pure Route Handlers and the engine runs entirely in the main thread.

## Standard Stack

### Core (all already installed in Phase 42 — zero new runtime deps required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `dexie` | 4.4.2 latest, project on ^4.0.8 | IndexedDB wrapper + transactions | Already the local DB [VERIFIED: npm view dexie version → 4.4.2, project package.json line 46]. 4.x transactional API is what makes atomic write+enqueue possible. |
| `drizzle-orm` | ^0.45.2 | Type-safe DB client for push/pull routes | Already in package.json [VERIFIED: src/db/schema.ts, package.json]. Use `drizzle-orm/neon-http` client from `src/lib/drizzle.ts` (Phase 42). |
| `drizzle-zod` | ^0.8.3 | Generate Zod schemas from Drizzle tables for API validation | Installed in Phase 42 specifically for this phase [VERIFIED: package.json, Phase 42 D-20]. Current version 0.8.3 [VERIFIED: npm view drizzle-zod version]. |
| `zustand` | ^5.0.0 (latest 5.0.12) | Sync status store with persist middleware | Already in stack; `settings-store.ts` is the template [VERIFIED: src/stores/settings-store.ts lines 2, 249]. |
| `@neondatabase/serverless` | ^1.0.2 | Neon HTTP driver (wrapped by Drizzle) | Already installed; no direct use by sync engine. |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 3.x | Runtime validation on API boundary | Wrap `createInsertSchema(table)` from drizzle-zod into discriminated union (see §6). |
| `@tanstack/react-query` | ^5.90.20 | Invalidate caches after pull | Call `queryClient.invalidateQueries()` once after a pull completes so `use-intake-queries.ts` re-runs. |
| `dexie-react-hooks` | ^1.1.7 | `useLiveQuery` already reactive to Dexie writes | Pull writes via `bulkPut` in a single transaction auto-fire a single liveQuery update. |

### NOT Recommended (verified against philosophy + user prefs)

| Library | Why NOT |
|---------|---------|
| `p-retry` | Retry logic for this phase is ~15 lines of code and the shape required (no max-retries, state lives in `_syncQueue.attempts`) doesn't match p-retry's callback-based API. Hand-rolling is simpler. [ASSUMED based on CONTEXT D-11 shape — p-retry exists (v8.0.0 per npm view) but isn't needed here.] |
| `dexie-syncable` / `dexie-cloud-addon` | Already rejected in STACK.md §"Sync Engine: Custom Build". Custom is required. |
| `workbox-background-sync` | Service worker sync is explicitly an anti-pattern in ARCHITECTURE.md #4. Engine runs main-thread. |
| any HLC / vector-clock library | `updatedAt` LWW is the ceiling for v2.0 per REQUIREMENTS. Fancier ordering is SYNC-F01, deferred. |

**Installation:** No new deps to install in Phase 43. Everything is in place from Phase 42.

## Architecture Patterns

### System Architecture Diagram

```
                            ┌─────────────────────┐
 User action (UI)           │  React Component    │
        │                   └──────────┬──────────┘
        ▼                              │ useMutation
┌───────────────┐         ┌────────────▼──────────┐
│ intake-service│─atomic─▶│  db.transaction()     │
│  addRecord()  │         │   1. db.intakeRecords │
│  deleteRecord │         │      .add/update      │
│  updateRecord │         │   2. syncQueue.enqueue│
└───────────────┘         │      (coalesce)       │
                          └──────────┬────────────┘
                                     │
                        ┌────────────▼────────────┐
                        │  _syncQueue (Dexie)     │
                        │  rows: {queueId,table,  │
                        │   recordId,op,attempts} │
                        └────────────┬────────────┘
                                     │
     ┌───────────────────────────────┼───────────────────────────────┐
     │                               │                               │
  trigger:                        trigger:                       trigger:
  after-write                     online event                visibilitychange
  (debounce 3s)                                                  → visible
     │                               │                               │
     └───────────────┬───────────────┴───────────────┬───────────────┘
                     │                               │
                     ▼                               ▼
           ┌─────────────────┐              ┌────────────────┐
           │  pushLoop()     │              │  pullLoop()    │
           │  - topo sort    │              │  - read cursor │
           │  - batch ops    │              │    from        │
           │  - POST /push   │              │    _syncMeta   │
           │  - on success:  │              │  - POST /pull  │
           │    delete acks, │              │  - bulkPut     │
           │    trigger pull │              │    in txn      │
           │  - on failure:  │              │  - advance     │
           │    incr attempts│              │    cursor      │
           │    schedule     │              │  - repeat until│
           │    backoff      │              │    hasMore=F   │
           └────────┬────────┘              └───────┬────────┘
                    │                               │
                    │ HTTPS                         │ HTTPS
                    ▼                               ▼
         ┌──────────────────────────────────────────────┐
         │  POST /api/sync/push    POST /api/sync/pull  │
         │  (withAuth)             (withAuth)           │
         │  drizzle-zod validate   drizzle-zod validate │
         │  LWW merge per op       SELECT WHERE         │
         │  scoped by user_id      updated_at > cursor  │
         │  return {accepted,      AND user_id = ?      │
         │    serverUpdatedAt}     ORDER BY updated_at  │
         │                         LIMIT softCap        │
         └─────────────────┬────────────────────────────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ Neon Postgres │
                   │ (20 tables,   │
                   │  Phase 42)    │
                   └───────────────┘

Status telemetry (parallel):
  pushLoop/pullLoop → sync-status-store (Zustand)
                     ├─ persisted: lastPushedAt, lastPulledAt (localStorage)
                     └─ in-memory: isOnline, isSyncing, queueDepth, lastError
  Phase 44 status UI subscribes via selectors.
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── sync-engine.ts         # NEW: push/pull loops, trigger wiring, backoff
│   ├── sync-queue.ts          # NEW: enqueue/coalesce/ack helpers over db._syncQueue
│   ├── sync-topology.ts       # NEW: static ordered table array for push flush order
│   ├── sync-payload.ts        # NEW: drizzle-zod discriminated union for push body
│   ├── db.ts                  # MODIFIED: Dexie v16 bump — add _syncQueue + _syncMeta
│   └── intake-service.ts      # MODIFIED: every write wrapped in atomic write+enqueue
├── stores/
│   └── sync-status-store.ts   # NEW: Zustand + persist for sync state
├── hooks/
│   └── use-sync-lifecycle.ts  # NEW: mount once, wires online/visibility/startup
├── app/
│   ├── api/sync/
│   │   ├── push/route.ts      # NEW: withAuth + LWW merge + ack
│   │   └── pull/route.ts      # NEW: withAuth + cursor-paginated SELECT
│   └── providers.tsx          # MODIFIED: add <SyncLifecycleMount />
└── __tests__/
    ├── sync-queue.test.ts     # Coalesce semantics, delete-supersedes-upsert
    ├── sync-topology.test.ts  # Topo order invariants
    ├── sync-backoff.test.ts   # Math: 2→4→8→16→32→60 capped, jitter bounds
    └── sync-engine.test.ts    # Integration with fake-indexeddb + MSW

scripts/
└── seed-dev-db.ts             # NEW: reads DEV_SEED_JSON, calls importBackup()

.private-fixtures/             # Git-ignored (already in .gitignore per CONTEXT D-16)
└── intake-tracker-backup-2026-04-17.json
```

### Pattern 1: Dexie v16 Migration Mechanics

**What:** Dexie's `db.version(N).stores({...})` is declarative — every version must repeat the **full** schema (all tables and all indexed fields). New tables are additive, no upgrade function is needed unless you're transforming existing data.

**Critical rule from codebase (db.ts v10→v15):** Each `db.version(N)` call lists **every** table including unchanged ones. Dexie creates new object stores automatically for tables in the new version map that weren't in the old one. Dropping is by omission. [VERIFIED: src/lib/db.ts lines 320, 410, 498, 572, 593, 616]

**For v16:** copy the entire v15 `.stores({...})` block verbatim, then add two new tables:

```ts
db.version(16).stores({
  // ... all 16 existing v15 stores unchanged ...
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  // ... (15 more, same as v15) ...
  titrationPlans:          "id, conditionLabel, status, updatedAt",

  // NEW in v16
  _syncQueue:              "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta:               "tableName",
});
// No .upgrade() needed — new tables only, no data transformation.
```

**Why the `++id` primary key on `_syncQueue`:** auto-incrementing integer keeps the FIFO ordering implicit and makes ack-by-id trivial. [CITED: https://dexie.org/docs/Version/Version.stores() — "++ means auto-incremented primary key"]

**Why the compound `[tableName+recordId]` index:** enables O(log n) coalesce lookup (§Coalesce primitives). This addresses a discretion item (CONTEXT "Whether `_syncQueue` gets a compound... index") — **recommend yes**, it's required for efficient coalescing.

**Why `tableName` as the primary key on `_syncMeta`:** singleton-per-table. `_syncMeta` stores `{tableName, lastPulledUpdatedAt}` and there's exactly one row per table, looked up by table name. [ASSUMED: standard cursor-map pattern, not cited but matches D-07.]

**Gotcha: Dexie's version number is multiplied by 10 in DevTools.** `db.version(16)` shows as IndexedDB version 160. [VERIFIED: MEMORY.md — "Dexie.js multiplies version numbers by 10 internally"]

### Pattern 2: Coalesce-on-Enqueue Primitive

**Rule (D-04):**
- `enqueue(tableName, recordId, 'upsert')` + existing upsert for same `(tableName, recordId)` → UPDATE `enqueuedAt`, do not insert.
- `enqueue(tableName, recordId, 'delete')` + existing upsert for same `(tableName, recordId)` → REPLACE the upsert with a delete (delete supersedes).
- `enqueue(tableName, recordId, 'delete')` + no existing row → INSERT delete.
- `enqueue(tableName, recordId, 'upsert')` + existing delete for same → **problem**: you're recreating a soft-deleted record. Recommend: the service layer does `updateIntakeRecord({deletedAt: null})` to restore, which is an upsert — the existing delete row should be coalesced (delete replaced by upsert). This matches the undelete path in intake-service.ts `undoDeleteIntakeRecord` [VERIFIED: src/lib/intake-service.ts lines 65-73].

**Dexie idiom:** single `db.transaction('rw', db._syncQueue, async () => { ... })` wrapping a `where('[tableName+recordId]').equals([t, r]).first()` + either `.modify()` or `.add()`. The compound index makes the lookup index-backed.

```ts
// sync-queue.ts shape (planner implements)
export async function enqueue(tableName: TableName, recordId: string, op: 'upsert' | 'delete') {
  await db.transaction('rw', db._syncQueue, async () => {
    const existing = await db._syncQueue
      .where('[tableName+recordId]')
      .equals([tableName, recordId])
      .first();

    const now = Date.now();
    if (!existing) {
      await db._syncQueue.add({ tableName, recordId, op, enqueuedAt: now, attempts: 0 });
      return;
    }
    if (op === 'delete' && existing.op === 'upsert') {
      // delete supersedes
      await db._syncQueue.update(existing.id, { op: 'delete', enqueuedAt: now, attempts: 0 });
      return;
    }
    if (op === 'upsert' && existing.op === 'delete') {
      // un-delete (tombstone restoration via updatedAt change on the data row)
      await db._syncQueue.update(existing.id, { op: 'upsert', enqueuedAt: now, attempts: 0 });
      return;
    }
    // same op already queued — refresh enqueuedAt, don't duplicate
    await db._syncQueue.update(existing.id, { enqueuedAt: now });
  });
}
```

### Pattern 3: Push Scheduling Loop (no Web Worker, no service worker)

**Decision:** main-thread `setTimeout` chain, guarded by a single in-flight flag in the Zustand store. Rationale:
1. **Web Workers** cannot share a Dexie instance with the main thread — they'd open a second IndexedDB connection and fight for locks. Not worth it.
2. **Service workers** — explicitly anti-patterned in ARCHITECTURE.md #4.
3. **requestIdleCallback** — fires only when main thread is idle; fine as an optional "opportunistic kick" but not a reliable scheduler.
4. **`setTimeout` in a backgrounded tab** — browsers clamp to ~1000ms minimum [CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#reasons_for_delays_longer_than_specified], but timers still fire. For exponential backoff up to 60s, this is irrelevant — we don't need sub-second precision.

**Shape:**

```ts
// sync-engine.ts
let pushTimer: number | null = null;
let pushInFlight = false;

export function schedulePush(delayMs = DEBOUNCE_MS) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = window.setTimeout(runPushCycle, delayMs);
}

async function runPushCycle() {
  if (pushInFlight || !navigator.onLine) return;
  pushInFlight = true;
  useSyncStatusStore.setState({ isSyncing: true });
  try {
    const ops = await collectAndOrderQueuedOps();    // topo + group by table
    if (ops.length === 0) return;
    const res = await fetch('/api/sync/push', { method: 'POST', body: JSON.stringify({ ops }) });
    if (!res.ok) throw new Error(`push failed ${res.status}`);
    const { accepted } = await res.json();
    await ackQueueIds(accepted.map(a => a.queueId));
    await applyServerAuthoritativeUpdatedAt(accepted);  // D-12 step 4
    useSyncStatusStore.setState({ lastPushedAt: Date.now(), lastError: null });
    schedulePull();                                     // D-10: pull after successful push
  } catch (e) {
    const backoff = nextBackoff();
    useSyncStatusStore.setState({ lastError: String(e) });
    schedulePush(backoff);
  } finally {
    pushInFlight = false;
    useSyncStatusStore.setState({ isSyncing: false });
  }
}
```

**Recommended debounce:** **3 seconds** (middle of 2–5s range). Rationale: intake writes often come in bursts (user logs 250ml water, then quickly adds a note, then adjusts amount). 3s lets the coalescer absorb the burst without feeling sluggish.

**Backoff math (D-11):** 2s → 4s → 8s → 16s → 32s → 60s (capped); jitter ±20% via `delay * (0.8 + Math.random() * 0.4)`. The `attempts` counter lives on the queue row (D-01) so survival across tab restarts is free.

### Pattern 4: Online/Offline + visibilitychange Plumbing

**Single-mount pattern** in providers.tsx, similar to TimezoneGuard:

```tsx
// src/hooks/use-sync-lifecycle.ts
export function useSyncLifecycle() {
  useEffect(() => {
    const onOnline = () => { useSyncStatusStore.setState({ isOnline: true }); schedulePush(0); schedulePull(); };
    const onOffline = () => { useSyncStatusStore.setState({ isOnline: false }); };
    const onVisible = () => { if (document.visibilityState === 'visible' && navigator.onLine) schedulePush(0); };

    useSyncStatusStore.setState({ isOnline: navigator.onLine });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);

    schedulePull(); // D-10: pull on startup

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
```

Mounted once in `providers.tsx`:

```tsx
function SyncLifecycleMount() { useSyncLifecycle(); return null; }
// inside <QueryClientProvider>: add <SyncLifecycleMount />
```

**Why a component and not just an effect in providers directly?** Keeps `providers.tsx` declarative and avoids "providers contains a hook that depends on stores" hydration weirdness. The `return null` component pattern is already used for TimezoneGuard's cousin. [CITED: src/app/providers.tsx pattern documented in ARCHITECTURE.md §"Provider Stack"]

**Duplicate listener prevention:** use `useEffect` with empty deps + cleanup. React 18 Strict Mode will run the effect twice in dev — the cleanup handles it correctly.

### Pattern 5: Atomic Write+Enqueue Helper

**Problem:** CONTEXT D-01 says the queue is the source of dirty truth. If `db.intakeRecords.add(record)` succeeds but `syncQueue.enqueue()` fails, the record exists locally but will never push → silent data loss in the cloud.

**Solution:** `db.transaction('rw', db.intakeRecords, db._syncQueue, async () => { ... both ... })` — Dexie rolls both back on any throw. [VERIFIED: https://dexie.org/docs/Dexie/Dexie.transaction()]

**Shape (planner implements in sync-queue.ts):**

```ts
// src/lib/sync-queue.ts
export async function writeWithSync<T extends { id: string }>(
  tableName: TableName,
  op: 'upsert' | 'delete',
  action: () => Promise<T>,
): Promise<T> {
  return db.transaction('rw', db.table(tableName), db._syncQueue, async () => {
    const record = await action();
    await enqueue(tableName, record.id, op);
    return record;
  });
}
```

**intake-service.ts wiring (recommendation — addresses CONTEXT discretion item):**
Use a thin helper. Inlining the enqueue per method duplicates error paths and makes the transactional boundary easier to break in review.

```ts
// src/lib/intake-service.ts (after)
export async function addIntakeRecord(...): Promise<ServiceResult<IntakeRecord>> {
  try {
    const record = await writeWithSync('intakeRecords', 'upsert', async () => {
      const r: IntakeRecord = { id: generateId(), /* ... */, ...syncFields() };
      await db.intakeRecords.add(r);
      return r;
    });
    schedulePush();  // debounced
    return ok(record);
  } catch (e) { return err('Failed to add intake record', e); }
}
```

Same treatment for `deleteIntakeRecord` (op: `delete`... but wait — D-04 says delete is still an enqueue, which per D-06 sends the full row with non-null `deletedAt`. So actually: `updateIntakeRecord` with `{deletedAt: now, updatedAt: now}` + enqueue op='upsert'. Only a **hard** delete would use op='delete', and this codebase never hard-deletes [CITED: ARCHITECTURE.md §"Established Patterns" — "Soft-delete via nullable `deletedAt` — never hard-delete"]). **Clarification for planner:** op='delete' in the queue means "tombstone this row locally-without-update" semantics are not used; soft-delete goes through upsert path. `op: 'delete'` in `_syncQueue` may end up unused in P43 but keep it in the schema for when cascading cleanups (e.g. prescription deletion wipes phases) land in P44+.

### Pattern 6: drizzle-zod Discriminated Union for Push Payload

**drizzle-zod API (v0.8.3):** [CITED: https://orm.drizzle.team/docs/zod]
- `createInsertSchema(table)` → `z.ZodObject` that mirrors the table columns.
- `createSelectSchema(table)` → same shape for select results.

Heterogeneous batch pushes need a **discriminated union** keyed by `tableName`:

```ts
// src/lib/sync-payload.ts
import { z } from 'zod';
import { createInsertSchema } from 'drizzle-zod';
import * as schema from '@/db/schema';

const intakeRowSchema = createInsertSchema(schema.intakeRecords);
const substanceRowSchema = createInsertSchema(schema.substanceRecords);
// ... repeat for all 16 app tables ...

const opSchema = z.discriminatedUnion('tableName', [
  z.object({
    queueId: z.number(),
    tableName: z.literal('intakeRecords'),
    op: z.enum(['upsert', 'delete']),
    row: intakeRowSchema,
  }),
  z.object({
    queueId: z.number(),
    tableName: z.literal('substanceRecords'),
    op: z.enum(['upsert', 'delete']),
    row: substanceRowSchema,
  }),
  // ... 14 more members ...
]);

export const pushBodySchema = z.object({ ops: z.array(opSchema).max(500) });
export type PushOp = z.infer<typeof opSchema>;
```

**Trade-off to flag:** the union member list grows with all 16 tables, but each is one line that references the generated schema. Total file ~40 lines and stays in sync with schema.ts by construction. [ASSUMED: this is the standard idiom for drizzle-zod heterogeneous batches — no explicit citation found, but matches the zod discriminated-union docs at https://zod.dev/?id=discriminated-unions]

**User_id handling:** drizzle-zod generates a schema that includes `userId` as required. The server should `.omit({ userId: true })` because the route derives userId from the session — never trust a client-supplied userId. See §Security below.

### Pattern 7: Pull Cursor Race-Condition Mitigation

**The race (from CONTEXT #7):**
1. Client pulls with `cursor = 100`.
2. Server scans rows WHERE `updated_at > 100`, finds {A: 105, B: 110}, returns them.
3. Between steps 2 and 3, server writes row C with `updated_at = 108`.
4. Client advances cursor to 110 (max seen). Row C is now permanently missed.

**Mitigation (standard pattern):** server returns its `Date.now()` at the **start** of the query, and the client advances the cursor to `min(maxRowUpdatedAt, serverTime - skewMargin)`. [CITED: The Hidden Problems of Offline-First Sync — https://dev.to/salazarismo/the-hidden-problems-of-offline-first-sync-idempotency-retry-storms-and-dead-letters-1no8, and ObjectBox conflict resolution docs at https://objectbox.io/customizable-conflict-resolution-for-offline-first-apps/]

**Recommended implementation:**

```ts
// /api/sync/pull route.ts
export const POST = withAuth(async ({ request, auth }) => {
  const serverTime = Date.now();                  // capture BEFORE query
  const body = pullBodySchema.parse(await request.json());
  const result: Record<string, {rows: any[], hasMore: boolean}> = {};

  for (const tableName of PULL_ORDER) {           // topo order on pull too (children before parents is fine, but keep consistent)
    const cursor = body.cursors[tableName] ?? 0;
    const rows = await drizzleDb.select().from(tableFor(tableName))
      .where(and(
        eq(tableFor(tableName).userId, auth.userId!),
        gt(tableFor(tableName).updatedAt, cursor),
      ))
      .orderBy(asc(tableFor(tableName).updatedAt))
      .limit(PULL_SOFT_CAP + 1);

    const hasMore = rows.length > PULL_SOFT_CAP;
    result[tableName] = { rows: rows.slice(0, PULL_SOFT_CAP), hasMore };
  }

  return NextResponse.json({ result, serverTime });
});
```

Client advances cursor with margin:

```ts
// sync-engine.ts — after applying pull
const SKEW_MARGIN_MS = 30_000; // 30s cushion absorbs transatlantic latency + clock drift
const safeCursor = Math.min(maxRowUpdatedAt, serverTime - SKEW_MARGIN_MS);
await db._syncMeta.put({ tableName, lastPulledUpdatedAt: safeCursor });
```

**Recommended soft-cap:** **500 rows per table per pull** (matches CONTEXT D-08 hint "~500 rows" and PITFALLS §Performance Traps "batch 50-500 records").

### Pattern 8: Tombstone Propagation on Pull

**Issue:** pulled rows include `deletedAt != null` tombstones. Dexie doesn't have native soft-delete — the client just bulk-puts them, overwriting any local row with the tombstone's state.

**Scope check for P43 pilot (intake-service.ts):** every read in intake-service.ts **already** filters `deletedAt === null` — see lines 96-98, 124, 134-135, 161-163, 185, 210, 340-342. So pulled tombstones are already handled correctly by the pilot. **No pilot code change needed for tombstones.** [VERIFIED: src/lib/intake-service.ts full file read]

**Flag for P44:** other services must have the same pattern. Backup-service and composable-entry-service already filter in most places, but P44 should audit all 14 services for `deletedAt` filtering in every read path.

### Pattern 9: Clock Skew Tolerance

**Concern from CONTEXT #9:** Client clock ahead of server. If client writes `updatedAt: CLIENT_NOW + 1hr`, the LWW comparison on the server accepts it as newer than everything, and future server writes fight it.

**Mitigation:** server **clamps** the incoming `updatedAt` on push:

```ts
// /api/sync/push route.ts — per op
const serverNow = Date.now();
const MAX_FUTURE_MS = 60_000; // accept up to 60s future (NTP skew)
const clampedUpdatedAt = Math.min(op.row.updatedAt, serverNow + MAX_FUTURE_MS);

// then compare against existing row's updatedAt for LWW
const existing = await drizzleDb.select().from(table).where(eq(table.id, op.row.id)).limit(1);
if (existing[0] && existing[0].deletedAt != null && op.row.deletedAt == null) {
  // D-12 step 3: deleted wins
  skip;
} else if (!existing[0] || clampedUpdatedAt >= existing[0].updatedAt) {
  // upsert (ties go to server: if strict `>`, existing wins on exact tie per D-12 step 2)
  await drizzleDb.insert(table).values({ ...op.row, updatedAt: clampedUpdatedAt, userId: auth.userId }).onConflictDoUpdate(...);
}
return { queueId: op.queueId, serverUpdatedAt: clampedUpdatedAt };  // D-12 step 4
```

**Exact-tie rule (D-12 step 2):** use strict `>` not `>=` for "client wins". On equality, the server's existing row stays.

**Why 60s clamp ceiling:** covers NTP jitter, mobile data tower time drift, typical misset clocks. Beyond 60s is device-broken territory; clamping to `serverNow + 60s` is still forward-progress and the server ack will re-synchronize the client timestamp. [ASSUMED: 60s is a reasonable default — no strict citation, but matches common practice in sync systems like ObjectBox HLC tuning.]

### Pattern 10: Topo-Sort API Shape

**Recommended shape (simplest that satisfies D-02):** an ordered `readonly string[]` export.

```ts
// src/lib/sync-topology.ts
export const PUSH_TABLE_ORDER = [
  // Parents first, children after. Based on Phase 42 FK graph (42-CONTEXT.md D-08).
  'prescriptions',
  'titrationPlans',           // referenced by medicationPhases
  'medicationPhases',          // -> prescriptions, titrationPlans
  'phaseSchedules',            // -> medicationPhases
  'inventoryItems',            // -> prescriptions
  'doseLogs',                  // -> prescriptions, medicationPhases, phaseSchedules, inventoryItems
  'inventoryTransactions',     // -> inventoryItems, doseLogs
  'dailyNotes',                // -> prescriptions, doseLogs
  'intakeRecords',             // (no inner FK as parent in v15)
  'substanceRecords',          // -> intakeRecords
  // The rest have no inner FKs — order doesn't matter:
  'weightRecords', 'bloodPressureRecords', 'eatingRecords',
  'urinationRecords', 'defecationRecords', 'auditLogs',
] as const;
export type TableName = typeof PUSH_TABLE_ORDER[number];
```

**Why a plain array over a `sortOps(ops)` function:**
- Auditable in one glance (CONTEXT §"Specific Ideas").
- `collectAndOrderQueuedOps()` in sync-engine.ts iterates `PUSH_TABLE_ORDER`, queries `_syncQueue` for each, flattens — trivial code.
- Zero runtime topo-sort bugs (static wins).

**Unit test approach for pilot (addresses CONTEXT discretion item):** assert invariants against the static array:
1. For each FK pair in `schema.ts` (e.g. `medicationPhases.prescriptionId → prescriptions.id`), assert `PUSH_TABLE_ORDER.indexOf('prescriptions') < PUSH_TABLE_ORDER.indexOf('medicationPhases')`.
2. Assert all 16 table names are present, no duplicates.
3. Assert the array is `readonly` (`as const`) so TypeScript prevents silent reordering.

Pull ordering can ignore FK constraints (rows come with foreign keys already set; no FK validation happens on the client) — **use the same PUSH_TABLE_ORDER for consistency**.

### Pattern 11: Zustand persist Gotchas in Next.js 14 App Router

**Gotcha:** Zustand `persist` middleware reads `localStorage` during store creation. On SSR, `localStorage` doesn't exist → the first render is with defaults, then client hydration swaps in persisted state → hydration mismatch warnings if the store is used in components that render before client-side hydration.

**Mitigation (already solved in settings-store.ts):** `createJSONStorage(() => localStorage)` — lazy factory, not direct access [VERIFIED: src/stores/settings-store.ts line 250]. Zustand knows to skip during SSR. Safe.

**Recommended fields to persist (D-14):**

```ts
// src/stores/sync-status-store.ts
interface SyncStatusState {
  // persisted
  lastPushedAt: number | null;
  lastPulledAt: number | null;
  // in-memory only
  isOnline: boolean;
  isSyncing: boolean;
  queueDepth: number;
  lastError: string | null;
}

export const useSyncStatusStore = create<SyncStatusState & Actions>()(
  persist(
    (set) => ({
      lastPushedAt: null,
      lastPulledAt: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: false,
      queueDepth: 0,
      lastError: null,
      // ... actions ...
    }),
    {
      name: 'intake-tracker-sync-status',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // CRITICAL: only persist the timestamp fields
      partialize: (state) => ({
        lastPushedAt: state.lastPushedAt,
        lastPulledAt: state.lastPulledAt,
      }),
    },
  ),
);
```

`partialize` is the Zustand idiom for "persist these fields only" — everything else resets to defaults on reload. [CITED: https://zustand.docs.pmnd.rs/integrations/persisting-store-data#partialize]

### Pattern 12: Dev Seed Script Plumbing

**The catch (CONTEXT #12):** IndexedDB is browser-only. A Node `tsx scripts/seed-dev-db.ts` cannot access it directly. Options:

| Option | Feasibility | Recommendation |
|--------|-------------|----------------|
| `tsx` + `fake-indexeddb` polyfill writing to a `.indexeddb-dump/` dir | Fragile — Dexie doesn't expose the raw data, and next dev would start clean anyway | NO |
| Dev-only UI button in Settings > Debug that reads `DEV_SEED_JSON` fetch'd from `/.private-fixtures/` | Works, but fixture is git-ignored so needs a dev-only `/api/dev/fixture` endpoint reading from disk | PARTIAL |
| **Dev-only script runs in browser via page init hook, guarded by `process.env.NODE_ENV === 'development'` and env var `NEXT_PUBLIC_DEV_SEED=1`** | Clean — `scripts/seed-dev-db.ts` becomes a module imported by a dev-only React component, which reads `DEV_SEED_JSON` via a dev-only API route that reads from `.private-fixtures/` | **YES** |
| User clicks existing "Import Backup" UI in Settings > Storage & Security and picks the file manually | Zero new code, uses existing `backup-service.importBackup()` | **YES — simplest** |

**Recommendation:** Two-track approach.
1. **Minimal path (ship this in P43):** document that dev seeding happens via the **existing** "Import Backup" UI (once Phase 40 adds the Storage & Security section it's one click). No new `seed-dev-db.ts` script needed — just a Debug panel button or a short README entry.
2. **Scripted path (optional, add if planner thinks it pays off):** `scripts/seed-dev-db.ts` + `/api/dev/seed/route.ts` (dev-only, guarded by `process.env.NODE_ENV !== 'production'`) that serves the fixture; a `useEffect` in the Debug panel auto-imports when `NEXT_PUBLIC_DEV_SEED=1`.

**CONTEXT D-17 says "planner should add a dev-only seed script (path-configurable via `DEV_SEED_JSON` env var)".** Honor this: build track 2. But keep the wiring lightweight (an API route + a `<DevSeedAutoload />` component mounted only when the flag is set).

### Pattern 13: E2E Testing Strategy

**Existing infrastructure (Phase 41/42):**
- Playwright configured (`playwright.config.ts`, `e2e/` dir) [VERIFIED: repo layout].
- `e2e/global-setup.ts` seeds Neon Auth session by signing in once and persisting `playwright/.auth/user.json` [VERIFIED: e2e/global-setup.ts lines 19-79].
- CI `e2e` job creates an ephemeral Neon branch per run using `neondatabase/create-branch-action@v5` and `delete-branch-action@v3`, sets `DATABASE_URL` to the branch URL [VERIFIED: .github/workflows/ci.yml lines 167-192].
- `scripts/seed-e2e-user.ts` is a one-time manual bootstrap — Neon Auth is project-wide, not branch-per-run [VERIFIED: .github/workflows/ci.yml lines 174-177].

**P43 E2E strategy (recommended for the pilot):** **one** E2E spec — `e2e/sync-engine.spec.ts` — that:

1. Reuses the authenticated storage state (already signed in).
2. Clears `intake_records` for the test user on the ephemeral Neon branch (DELETE FROM via a test-only helper route or direct Drizzle call in a fixture).
3. Seeds 50 intake records into Dexie via `backup-service.importBackup()` driven from a fixture JSON.
4. Calls `window.__syncEngine.pushNow()` (test-only global, dev-only) and awaits completion.
5. Queries Neon via a new `/api/__test__/count-intake` route (dev/test-guarded) and asserts count === 50.
6. Deletes one record locally, pushes, verifies `deletedAt != null` on the server row.
7. Simulates "other device wrote to Neon" by directly INSERTing a row via Drizzle, then triggers `pullNow()`, verifies the row arrives in Dexie.
8. Offline→online test: `context.setOffline(true)`, write 5 records, assert they're queued (query `_syncQueue` from the page), set offline false, wait for auto-push, verify in Neon.

**Playwright network offline mode:** [CITED: https://playwright.dev/docs/network#network-events — `page.context().setOffline(true)` fires `offline` event correctly]. This gives real online/offline simulation.

**Dev-only test hooks:** expose `window.__syncEngine = { pushNow, pullNow, getQueueDepth }` guarded by `process.env.NODE_ENV !== 'production'`. Standard pattern — same as existing dev flags.

**Unit + integration test split:**
- `sync-queue.test.ts` — coalesce rules, delete-supersedes-upsert, un-delete path. Uses `fake-indexeddb` + vitest.
- `sync-topology.test.ts` — FK invariant assertions against `src/db/schema.ts`.
- `sync-backoff.test.ts` — pure math: 2→4→8→16→32→60, jitter bounds in `[0.8, 1.2]`.
- `sync-engine.test.ts` — integration: mocked `fetch` via MSW, simulate push ack, pull response, cursor advance, skew margin.

### Anti-Patterns to Avoid

- **Calling `syncQueue.enqueue()` OUTSIDE a `db.transaction()` that also contains the data write.** Opens a window where the data row exists but the queue row doesn't. See §5.
- **Using `localStorage` for the cursor map or queue depth.** Queue is a Dexie table per D-01; cursor map is a Dexie `_syncMeta` table per D-07. localStorage is only for the two persisted Zustand fields (D-14).
- **Passing `user_id` from the client in the push payload.** Server derives it from the session (`auth.userId!`). `.omit({userId: true})` on the drizzle-zod schema enforces this.
- **Running pull inside the push's try/catch.** They should be independent — a failed push shouldn't prevent a pull.
- **Reading Dexie rows in `collectAndOrderQueuedOps()` one-at-a-time.** Use `bulkGet()` against the latest row snapshots — a 500-op push should be ~2 Dexie round trips, not 500.
- **Relying on `setInterval` for the push loop.** Use recursive `setTimeout` — the coalescer makes periodic pull/push redundant (per D-10: no periodic pull).
- **Using `dexie-cloud-addon` or `dexie-syncable`.** Already rejected in STACK.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema-to-Zod translation | Write Zod schemas matching each table by hand | `drizzle-zod` `createInsertSchema` | Installed, auto-stays-in-sync with `src/db/schema.ts`, and removes the main drift risk |
| Online/offline detection | Custom ping loop | `navigator.onLine` + `online`/`offline` events | Zero deps, standard Web API |
| Tab-visibility detection | Polling `document.hidden` | `visibilitychange` event | Standard Web API |
| Cursor cursor / pagination protocol | Opaque cursor strings | `updatedAt` bigint cursor per table | Already the index in both Dexie and Postgres, bigint arithmetic is trivial |
| Auth middleware for sync routes | Re-derive session check | `withAuth` from `src/lib/auth-middleware.ts` | Phase 41 already built this; same HOF every other API route uses |
| IndexedDB ↔ JSON encoding for dev seed | Custom loader | `backup-service.importBackup()` | Already handles all 16 tables, already tested, matches fixture shape exactly |
| Persisting Zustand to localStorage | Custom `useEffect` subscribe + JSON.parse | `persist` middleware + `partialize` | Same pattern as settings-store.ts, correct SSR handling baked in |
| Atomic multi-table write | Manual rollback | `db.transaction('rw', t1, t2, fn)` | Dexie rolls back on throw; no state reconciliation needed |
| Drizzle ephemeral branch in CI | Custom create/delete step | `neondatabase/create-branch-action@v5` + `delete-branch-action@v3` | Already the established pattern (e2e + schema-migration jobs) |

**Key insight:** **the entire phase is orchestration of existing primitives**. Every hard problem (atomic writes, SSR-safe persist, CI branches, schema validation) already has a canonical answer in this codebase. The custom code is ~400 LOC of glue: topo array, coalesce logic, backoff math, trigger wiring, two routes, two tests.

## Runtime State Inventory

**Not a rename/refactor phase** — this is greenfield addition of two new Dexie tables and two new API routes. No string-replacement sweep needed.

**That said**, there IS state to be aware of:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Dexie v15 IntakeTrackerDB on the user's device — existing data must survive v16 migration | v16 migration is additive (new tables only); Dexie auto-preserves existing tables. Verify via local test against the `.private-fixtures/` backup. |
| Live service config | None — Neon Auth is project-wide, Neon branches are per-CI-run | None |
| OS-registered state | None | None |
| Secrets/env vars | `DATABASE_URL` (already set for push-db + Drizzle); no new secrets in P43 | None |
| Build artifacts | None (no rename) | None |

## Common Pitfalls

### Pitfall 1: Enqueue Outside Transaction → Silent Data Loss

**What goes wrong:** `await db.intakeRecords.add(record)` succeeds, network drops, `await syncQueue.enqueue()` fails (e.g. quota error on the queue write). The record never pushes, the user sees it locally, it never appears on other devices.

**Why it happens:** forgetting that the queue is the source of dirty truth (D-01). Without a transaction, the two writes are independent.

**How to avoid:** ALWAYS use `writeWithSync()` helper (§Pattern 5). Every modified path in `intake-service.ts` goes through it. Write a unit test that throws inside the enqueue and asserts the data row doesn't persist.

**Warning signs:** Dexie DevTools showing more intake rows than `_syncQueue` rows + push timestamps older than the newest intake row.

### Pitfall 2: Cursor Advancing Past Unfetched Rows (The Race)

**What goes wrong:** see §Pattern 7. Client misses rows that were written server-side between the SELECT and the response.

**How to avoid:** server returns `serverTime`, client clamps cursor to `min(maxUpdatedAt, serverTime - 30s)`. Write an E2E test that INSERTs a row mid-pull (via a test hook that sleeps) and asserts the client catches it on the next pull cycle.

### Pitfall 3: Ack Races with Local Writes

**What goes wrong:** Push ack arrives saying "row X accepted with serverUpdatedAt=1000". Client overwrites local row X's `updatedAt` to 1000 (D-12 step 4). But meanwhile the user edited row X again locally, with `updatedAt=1050`, enqueueing another op. If the ack handler blindly overwrites, the user's new edit is lost.

**How to avoid:** when applying server-authoritative `updatedAt`, compare against current local `updatedAt` and **only overwrite if the local row's `updatedAt` is ≤ the ack's timestamp**. Otherwise, a newer local edit exists and the ack is stale relative to it; leave local row alone, let next push reconcile.

```ts
async function applyServerAck(queueId: number, serverUpdatedAt: number, recordId: string, tableName: string) {
  const local = await db.table(tableName).get(recordId);
  if (local && local.updatedAt <= serverUpdatedAt) {
    await db.table(tableName).update(recordId, { updatedAt: serverUpdatedAt });
  }
  // If local.updatedAt > serverUpdatedAt, a newer edit is already queued — skip.
  await db._syncQueue.delete(queueId);
}
```

### Pitfall 4: Zustand Persist SSR Hydration Mismatch

**What goes wrong:** component renders `state.lastPushedAt` on server (null) then on client (actual value) → React hydration error.

**How to avoid:** don't use persisted fields in server-rendered content. The sync status UI is Phase 44's problem, but flag to the planner: any component reading `lastPushedAt` should be wrapped in `useEffect` + local state, or marked `'use client'` and gated on a hydration flag. Zustand's `persist` docs have the canonical solution [CITED: https://zustand.docs.pmnd.rs/integrations/persisting-store-data#hydration-and-asynchronous-storages].

### Pitfall 5: Dexie v16 Bump Doesn't Repeat Full v15 Schema

**What goes wrong:** adding `_syncQueue` / `_syncMeta` without repeating all 16 existing table definitions. Dexie drops the unmentioned stores on upgrade. User loses all their data.

**How to avoid:** copy the entire v15 `.stores({...})` object, then add two lines. Write a migration test: open a Dexie instance at v15, seed with a fixture, upgrade to v16, verify all v15 tables still have rows. The existing backup-service integrity tests at `src/__tests__/integrity/` are the template.

### Pitfall 6: Push Batch Too Large → Vercel Timeout

**What goes wrong:** user offline for 2 weeks, 3000 ops queued, first push sends all 3000, Vercel times out at 10s (Hobby) or 60s (Pro).

**How to avoid:** cap push batch size at **200 ops**. On flush, shift first 200 off the queue, push, ack, repeat until queue empty. PITFALLS.md §Performance Traps says "batch 50-100 per sync request" — 200 is a reasonable middle-ground for full-row payloads on average intake-record size (~300 bytes).

### Pitfall 7: Tombstone Read Path Leak in Future Services (P44 concern, flag now)

**What goes wrong:** pilot intake-service.ts correctly filters `deletedAt === null` in every read, but when Phase 44 wires the remaining 14 services, a missing filter re-shows tombstoned records.

**How to avoid:** plan a lint-style check (could be part of P44's plan, but call it out in P43 research): `src/__tests__/services-filter-deletedAt.test.ts` scans each service file for reads of the 16 tables and asserts each either passes through `where('deletedAt').equals(null)` or filters in JS. The framework exists — see `bundle-security.test.ts` as a file-scanning AST test.

## Code Examples

### Example 1: Dexie v16 stores({...}) block
```ts
// src/lib/db.ts — added after db.version(15).stores({...})
// Source: follows the v10-v15 pattern in the same file, which requires repeating
// the full schema each version (verified in src/lib/db.ts lines 320-633).
db.version(16).stores({
  // --- REPEAT ALL v15 STORES VERBATIM ---
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  weightRecords:           "id, timestamp, updatedAt",
  bloodPressureRecords:    "id, timestamp, position, arm, updatedAt",
  eatingRecords:           "id, timestamp, groupId, updatedAt",
  urinationRecords:        "id, timestamp, updatedAt",
  defecationRecords:       "id, timestamp, updatedAt",
  prescriptions:           "id, isActive, updatedAt, createdAt",
  medicationPhases:        "id, prescriptionId, status, type, titrationPlanId, updatedAt",
  phaseSchedules:          "id, phaseId, time, enabled, updatedAt",
  inventoryItems:          "id, prescriptionId, isActive, updatedAt",
  inventoryTransactions:   "id, [inventoryItemId+timestamp], inventoryItemId, timestamp, type, updatedAt",
  doseLogs:                "id, [prescriptionId+scheduledDate], prescriptionId, phaseId, scheduleId, scheduledDate, scheduledTime, status, updatedAt",
  dailyNotes:              "id, date, prescriptionId, doseLogId, updatedAt",
  auditLogs:               "id, [action+timestamp], timestamp, action",
  substanceRecords:        "id, [type+timestamp], type, timestamp, source, sourceRecordId, groupId, updatedAt",
  titrationPlans:          "id, conditionLabel, status, updatedAt",
  // --- NEW in v16 ---
  _syncQueue:              "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta:               "tableName",
});
```

### Example 2: Server-side LWW merge in /api/sync/push
```ts
// src/app/api/sync/push/route.ts (sketch)
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db as drizzleDb } from '@/lib/drizzle';
import { pushBodySchema } from '@/lib/sync-payload';
import { schemaByTableName } from '@/lib/sync-topology';
import { eq, and } from 'drizzle-orm';

const MAX_FUTURE_MS = 60_000;

export const POST = withAuth(async ({ request, auth }) => {
  const body = pushBodySchema.parse(await request.json());
  const serverNow = Date.now();
  const accepted: Array<{ queueId: number; serverUpdatedAt: number }> = [];

  // TODO planner: batch into a single transaction via drizzleDb.transaction(async (tx) => ...)
  for (const op of body.ops) {
    const table = schemaByTableName[op.tableName];
    const clampedUpdatedAt = Math.min(op.row.updatedAt, serverNow + MAX_FUTURE_MS);

    const existing = await drizzleDb.select().from(table)
      .where(and(eq(table.id, op.row.id), eq(table.userId, auth.userId!)))
      .limit(1);

    const serverRow = existing[0];

    // D-12 step 3: deleted wins tie
    if (serverRow && serverRow.deletedAt != null && op.row.deletedAt == null) {
      accepted.push({ queueId: op.queueId, serverUpdatedAt: serverRow.updatedAt });
      continue;
    }

    // D-12 step 2: strict > (server wins exact tie)
    if (!serverRow || clampedUpdatedAt > serverRow.updatedAt) {
      await drizzleDb.insert(table)
        .values({ ...op.row, userId: auth.userId!, updatedAt: clampedUpdatedAt })
        .onConflictDoUpdate({
          target: table.id,
          set: { ...op.row, userId: auth.userId!, updatedAt: clampedUpdatedAt },
        });
    }
    // D-12 step 4: authoritative ack
    accepted.push({ queueId: op.queueId, serverUpdatedAt: clampedUpdatedAt });
  }

  return NextResponse.json({ accepted });
});
```

### Example 3: sync-status-store.ts
```ts
// src/stores/sync-status-store.ts
// Source: pattern from src/stores/settings-store.ts lines 153-297 (persist + createJSONStorage)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SyncStatusState {
  lastPushedAt: number | null;
  lastPulledAt: number | null;
  isOnline: boolean;
  isSyncing: boolean;
  queueDepth: number;
  lastError: string | null;
}

export const useSyncStatusStore = create<SyncStatusState>()(
  persist(
    () => ({
      lastPushedAt: null,
      lastPulledAt: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: false,
      queueDepth: 0,
      lastError: null,
    }),
    {
      name: 'intake-tracker-sync-status',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({
        lastPushedAt: s.lastPushedAt,
        lastPulledAt: s.lastPulledAt,
      }),
    },
  ),
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-field timestamps (see original ARCHITECTURE.md v2.0) | Record-level LWW with `deletedAt`-wins-tie | REQUIREMENTS.md + CONTEXT D-12 | Simplifies server merge to ~20 LOC; per-field is SYNC-F01 (future) |
| dexie-syncable ISyncProtocol | Custom op-log queue | STACK.md sync decision | Full control, zero maintenance risk from an abandoned addon |
| Service-worker background sync | Main-thread setTimeout loop | ARCHITECTURE.md anti-pattern #4 | Simpler debugging, no SW lifecycle issues |
| Privy JWT auth on routes | Neon Auth session cookie via `withAuth` | Phase 41 | Zero Bearer token plumbing; same-origin fetch works automatically |
| Raw SQL via `@neondatabase/serverless` | Drizzle ORM with `neon-http` | Phase 42 | Type-safe queries, drizzle-zod for payload validation |

**Deprecated/outdated:**
- `dexie-syncable` — abandoned.
- `dexie-cloud-addon` — requires Dexie Cloud SaaS, rejected.
- per-field timestamps — deferred to SYNC-F01.
- PIN gate — removed Phase 41.

## Assumptions Log

Claims in this research tagged `[ASSUMED]` that the planner / discuss-phase may want to confirm:

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `p-retry` not needed — hand-rolled backoff is simpler | Standard Stack > NOT Recommended | Low — worst case planner adds `p-retry` back; the CONTEXT-locked backoff shape (no max-retries) isn't p-retry's sweet spot anyway |
| A2 | 60s `MAX_FUTURE_MS` clock-skew clamp is adequate | §9 | Low — value is tunable; 60s matches typical NTP drift tolerance. If real-world devices show >60s drift, bump to 5min |
| A3 | 500 rows per-table pull soft-cap is the right number | §7 | Low — arbitrary within the "~500" CONTEXT hint; planner can set to any value; too low = more round trips, too high = more memory |
| A4 | 200 ops per push batch is the right cap | Pitfall 6 | Low — tunable; 200 × ~300 bytes = 60KB payload, well under Vercel limits |
| A5 | `db.transaction('rw', table1, table2, fn)` rolls back both writes on any throw | §5 | None — verified via Dexie docs, standard behavior [CITED: https://dexie.org/docs/Dexie/Dexie.transaction()] |
| A6 | 3s debounce is the right after-write trigger delay | §3 | Low — within CONTEXT 2–5s range; tune based on UAT |
| A7 | `setTimeout` in backgrounded tab still fires (just clamped to ≥1s) | §3 | None — verified via MDN |
| A8 | drizzle-zod's `createInsertSchema` + Zod `discriminatedUnion` is the canonical pattern for heterogeneous batch API validation | §6 | Medium — no explicit citation found for this exact composition, but both primitives are well-documented individually; risk is style, not correctness |
| A9 | Op-log `op: 'delete'` unused in P43 pilot because soft-delete goes through upsert | §5 | Low — schema field is still defined so P44 can use it if needed; pilot ignoring it is safe |
| A10 | The `_syncQueue` compound `(tableName, recordId)` index is worth the storage cost for O(log n) coalesce lookup | §2 | Low — discretion item; even linear scan of a 200-op queue is <1ms |

## Open Questions

1. **Q:** Should the discriminated union in sync-payload.ts be centralized (one big union of 16 members) or distributed (per-table schemas exported individually, union constructed at the route level)?
   - **What we know:** both work, Zod supports both shapes.
   - **What's unclear:** maintenance ergonomics as future tables land.
   - **Recommendation:** centralize. One file to audit. Matches schema.ts being a single-file source of truth.

2. **Q:** Does the pilot need a rollback path if v16 migration fails mid-upgrade on a user's device?
   - **What we know:** Dexie wraps upgrades in a transaction — any throw reverts. Pure additive schema = low risk.
   - **What's unclear:** what if `crypto.randomUUID()` or some environment thing breaks at upgrade time.
   - **Recommendation:** test migration against the `.private-fixtures/` backup on a fresh profile. No explicit rollback logic needed; Dexie handles it.

3. **Q:** How does the phase handle the push ack when the response is partial (e.g. server accepted 100 of 200 ops, then 500'd)?
   - **What we know:** CONTEXT says "accepted: [{queueId}]" — only accepted ops are listed.
   - **What's unclear:** what happens to the unlisted ones — re-queued? Left untouched?
   - **Recommendation:** "left untouched + retry on next cycle" is correct. Unlisted ops keep their `attempts` counter and will be re-sent. Document this in the push route's contract.

4. **Q:** `intake-service.ts` has `clearAllData()` [VERIFIED: line 352]. What should that do to `_syncQueue`?
   - **What we know:** it's dev-only (Debug panel).
   - **What's unclear:** should clearing also enqueue 16 table-wide deletes?
   - **Recommendation:** for the pilot, leave `clearAllData` untouched and document that dev-clear bypasses sync. Phase 44/45 can formalize.

5. **Q:** Will there be a manual "Sync Now" button in P43?
   - **What we know:** `SYNC-F03` is explicitly deferred to future.
   - **What's unclear:** whether the dev-only `window.__syncEngine.pushNow()` test hook counts as "Sync Now."
   - **Recommendation:** dev-only hook yes (needed for E2E); user-facing button no (Phase 44 / Future).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Package manager (enforced by preinstall hook) | ✓ | 10.30.2 | — |
| Node ≥18 | Runtime | ✓ | 22 (CI) / local dev | — |
| Dexie 4.x | IndexedDB wrapper | ✓ | ^4.0.8 installed | — |
| drizzle-orm | DB client | ✓ | ^0.45.2 | — |
| drizzle-zod | Runtime validation | ✓ | ^0.8.3 | — |
| Zustand 5.x | Status store | ✓ | ^5.0.0 | — |
| @neondatabase/serverless | Drizzle HTTP driver | ✓ | ^1.0.2 | — |
| Neon branch creation (CI) | E2E tests against Postgres | ✓ | `create-branch-action@v5` + `delete-branch-action@v3` already wired | — |
| Vitest | Unit tests | ✓ | pnpm test script | — |
| Playwright | E2E tests | ✓ | pnpm test:e2e; `storageState` already configured | — |
| `fake-indexeddb` | Unit-testing Dexie-backed modules | ✗ | — | Install as dev-dep OR run tests in jsdom+polyfill |
| `.private-fixtures/intake-tracker-backup-2026-04-17.json` | Dev seed + E2E fixture | ? | Must be placed by user locally | Backup export UI can generate one from any Dexie state |

**Missing dependencies with no fallback:** none blocking.

**Missing dependencies with fallback:**
- `fake-indexeddb` — standard Dexie-unit-test dependency. Install recommendation: `pnpm add -D fake-indexeddb`. If planner wants to avoid, unit tests can be integration-style (real IDB via Playwright) but that's much slower.

**Dev fixture:** CONTEXT D-16 specifies the path. User must manually place the backup JSON there (git-ignored). No action for automation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (already used; `pnpm test` → `vitest run`) + Playwright (E2E) |
| Config file | `vitest.config.ts` + `playwright.config.ts` (existing) |
| Quick run command | `pnpm vitest run src/__tests__/sync-*.test.ts` |
| Full suite command | `pnpm test && pnpm test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYNC-01 | Write to Dexie completes without network calls | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "writes locally without network"` | ❌ Wave 0 |
| SYNC-01 | Write + enqueue is atomic (both roll back on throw) | unit | `pnpm vitest run src/__tests__/sync-queue.test.ts -t "atomic write and enqueue"` | ❌ Wave 0 |
| SYNC-02 | Batch push fires after debounce when online | unit (MSW) | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "debounced push"` | ❌ Wave 0 |
| SYNC-02 | Backoff sequence is 2→4→8→16→32→60 with ±20% jitter | unit | `pnpm vitest run src/__tests__/sync-backoff.test.ts` | ❌ Wave 0 |
| SYNC-02 | Coalesce-on-enqueue deduplicates upserts; delete supersedes | unit | `pnpm vitest run src/__tests__/sync-queue.test.ts -t "coalesce"` | ❌ Wave 0 |
| SYNC-02 | Topo order respects FK graph | unit (introspects schema.ts) | `pnpm vitest run src/__tests__/sync-topology.test.ts` | ❌ Wave 0 |
| SYNC-02 | Full push cycle against real Neon branch | e2e | `pnpm test:e2e e2e/sync-engine.spec.ts --grep "push"` | ❌ Wave 0 |
| SYNC-03 | Pull on startup advances cursor correctly | unit (MSW) | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "pull startup"` | ❌ Wave 0 |
| SYNC-03 | Cursor clamps to `serverTime - skewMargin` | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "cursor skew margin"` | ❌ Wave 0 |
| SYNC-03 | Pull against real Neon branch pulls server-written rows | e2e | `pnpm test:e2e e2e/sync-engine.spec.ts --grep "pull"` | ❌ Wave 0 |
| SYNC-04 | Record-level LWW by updatedAt | unit (server route handler) | `pnpm vitest run src/__tests__/sync-push-route.test.ts -t "LWW"` | ❌ Wave 0 |
| SYNC-04 | Server wins exact tie | unit | `pnpm vitest run src/__tests__/sync-push-route.test.ts -t "server wins tie"` | ❌ Wave 0 |
| SYNC-04 | `deletedAt != null` wins any tie | unit | `pnpm vitest run src/__tests__/sync-push-route.test.ts -t "deletedAt wins"` | ❌ Wave 0 |
| SYNC-04 | Client clock-skew clamp on push | unit | `pnpm vitest run src/__tests__/sync-push-route.test.ts -t "clamp future"` | ❌ Wave 0 |
| SYNC-04 | Server-authoritative ack overwrites local updatedAt | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "ack overwrites"` | ❌ Wave 0 |
| SYNC-05 | `online` event triggers push | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "online triggers push"` | ❌ Wave 0 |
| SYNC-05 | `visibilitychange → visible` triggers push | unit | `pnpm vitest run src/__tests__/sync-engine.test.ts -t "visibility triggers push"` | ❌ Wave 0 |
| SYNC-05 | Offline→online round-trip against real Neon branch | e2e | `pnpm test:e2e e2e/sync-engine.spec.ts --grep "offline reconnect"` | ❌ Wave 0 |
| v16 migration | Dexie v15→v16 preserves all existing data | unit (fake-indexeddb) | `pnpm vitest run src/__tests__/migration/dexie-v16.test.ts` | ❌ Wave 0 |
| Schema parity | Pilot intake-service still passes existing schema-parity test | existing | `pnpm vitest run src/__tests__/schema-parity.test.ts` | ✅ exists (Phase 42) |
| Tombstone reads | Pilot intake-service reads filter `deletedAt===null` | regression | Existing intake-service tests (if any) | ✅ implicit (code audit) |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/__tests__/sync-*.test.ts` (~5s)
- **Per wave merge:** `pnpm test` (full Vitest ~30s) + `pnpm test:e2e e2e/sync-engine.spec.ts` (~60s against Neon branch)
- **Phase gate:** Full `pnpm test && pnpm test:e2e` green, schema-migration CI job green, verify-schema.ts green.

### Wave 0 Gaps
- [ ] `src/__tests__/sync-queue.test.ts` — covers coalesce, atomicity, delete-supersedes
- [ ] `src/__tests__/sync-topology.test.ts` — covers FK invariants against src/db/schema.ts
- [ ] `src/__tests__/sync-backoff.test.ts` — covers backoff math + jitter
- [ ] `src/__tests__/sync-engine.test.ts` — covers trigger wiring + pull/push loop via MSW
- [ ] `src/__tests__/sync-push-route.test.ts` — covers server-side LWW logic
- [ ] `src/__tests__/migration/dexie-v16.test.ts` — covers v16 migration data preservation
- [ ] `e2e/sync-engine.spec.ts` — covers push/pull/reconnect against real Neon branch
- [ ] Install `fake-indexeddb` as dev dep (for Dexie unit tests)
- [ ] Add dev-only `window.__syncEngine` test hook in dev/test builds
- [ ] Add test-only helper route (e.g. `/api/__test__/count-intake?userId=...`) guarded by `NODE_ENV !== 'production'`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Defense-in-depth on every sync route: Neon Auth session + user_id scoping + drizzle-zod payload validation + `.omit({userId: true})` on insert schema so client can't forge userId |
| V2 Authentication | yes | Reuse `withAuth` from src/lib/auth-middleware.ts (Phase 41) — cookie-based Neon Auth session |
| V3 Session Management | yes | Handled by Neon Auth; no code in P43 |
| V4 Access Control | yes | Every push/pull query scoped by `auth.userId!` via Drizzle `WHERE user_id = ?` clauses; FK ON DELETE CASCADE to `neon_auth.users_sync(id)` (Phase 42) enforces data ownership on delete |
| V5 Input Validation | yes | drizzle-zod discriminated union on push body (§6); zod pullBodySchema on pull body |
| V6 Cryptography | no | Neon Auth handles session cookie crypto; no app-level crypto in P43 |
| V7 Error Handling | yes | Never return drizzle stack traces to client — `withAuth` already wraps; add explicit try/catch with generic 500 + server log |
| V8 Data Protection | yes | Sync payloads contain health data (PHI) — TLS enforced by Vercel/Neon; do NOT log payload bodies in Vercel function logs (PITFALLS.md §Security Mistakes) |
| V9 Communication | yes | HTTPS only, same-origin fetch (no CORS issues); Vercel/Neon both force TLS |

### Known Threat Patterns for PWA + Serverless + Neon Postgres

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User A's client sends ops for User B's records | Elevation of Privilege | Server DERIVES user_id from session, `.omit({userId: true})` on insert schema, WHERE user_id = auth.userId on SELECT/UPDATE |
| Replay attack on push route | Tampering | `queueId` is client-generated; server uses `onConflictDoUpdate` so idempotent replays are safe. No extra nonce needed |
| Malicious giant push payload (DoS) | Denial of Service | `z.array(opSchema).max(500)` in pushBodySchema; Vercel function timeout is a hard backstop |
| SQL injection via tableName discriminator | Tampering | `z.literal('intakeRecords')` — discriminator is a finite union, not a free string. Can't inject |
| Client-forged `updatedAt` far in future | Tampering | Server clamps to `min(op.row.updatedAt, serverNow + 60s)` (§9) |
| Client-forged `id` collides with another user's | Info Disclosure | `id` is client-generated UUID; collision probability ~0. Still enforced by WHERE user_id = ? — another user's id would not match this user's SELECT |
| Drizzle ORM auto-coerces nullable fields unexpectedly | Tampering | drizzle-zod generates schemas that match drizzle exactly; any null/undefined mismatch is caught at parse time |
| Timing side-channel on LWW compare | Info Disclosure | Negligible risk — `updatedAt` is a bigint; constant-time compare unneeded |
| Dev-only test hooks leak into production | Elevation of Privilege | `window.__syncEngine` and `/api/__test__/*` routes gated on `process.env.NODE_ENV !== 'production'` at module top; bundle-security.test.ts should add an assertion that these strings don't appear in the production bundle |

### Security Review Checklist (for the planner's plan-checker)
- [ ] Push route `.omit({userId: true})` on the drizzle-zod insert schema
- [ ] Every Drizzle query in sync routes includes `eq(table.userId, auth.userId!)`
- [ ] No `console.log(ops)` or `console.log(body)` in push/pull route handlers
- [ ] Dev-only test hooks guarded by `NODE_ENV`
- [ ] bundle-security.test.ts updated (or new assertion added) for dev-hook leak check
- [ ] Zod discriminated union has `max(500)` cap on ops array

## Project Constraints (from CLAUDE.md)

- **Package manager:** pnpm only (enforced via preinstall hook). Never use npm/yarn.
- **Offline-first, mobile-focused:** single-user PWA, `max-w-lg` container. Sync engine must NEVER block UI or require network for writes (SYNC-01).
- **Data layer in Dexie (IndexedDB):** do NOT introduce any other client-side DB. Sync engine augments Dexie, does not replace it.
- **Services pattern:** domain logic in `src/lib/*-service.ts`; React Query hooks in `src/hooks/use-*-queries.ts`. The pilot `intake-service.ts` wiring MUST preserve this boundary — sync is inside service methods, not inside hooks.
- **Zustand for preferences; React Query for data:** new sync-status-store is Zustand (matches settings-store pattern); do NOT put sync status in React Query.
- **Provider stack order:** `ErrorBoundary → QueryClientProvider → ThemeProvider → TimezoneGuard → children`. Add the `<SyncLifecycleMount />` inside `QueryClientProvider` (needs it for `queryClient.invalidateQueries()` after pull) and above `TimezoneGuard` (order doesn't matter for sync; keep the existing shape).
- **API route pattern:** `withAuth` HOF + `NextResponse.json(...)`. The two new sync routes MUST follow this.
- **Path alias:** `@/*` → `src/*`.
- **No server-side DB for user data — except now Phase 42 did change this.** NeonDB is now source of truth for mirrored tables. This is a genuine architectural shift that CLAUDE.md doesn't yet reflect; the sync engine is the bridge.

## User Preferences (from MEMORY.md)

- **Never start `pnpm dev` in planning or execution.** User runs it themselves.
- **Prefer flexible/composable patterns over rigid/explicit ones** — codebase is pre-refinement. (Applies to the enqueue helper shape: one composable `writeWithSync()` helper > 20 inlined enqueue calls across service methods.)
- **Never install fork packages without explicit approval.** All recommended libraries in this research are mainstream (drizzle-zod, zustand, dexie, fake-indexeddb).
- **Use Vercel-Neon integration env names** — no custom env var names. `DATABASE_URL` is the canonical one (already in use).
- **Verify before asking.** Planner should have running tests and smoke checks before UAT.
- **MCP tools (Pencil, etc.) only in main conversation.** P43 has no UI component, so this is not a concern — but the test hooks use plain JS globals, not MCP.

## Sources

### Primary (HIGH confidence) — Context7 / Official docs / Codebase verification
- [Dexie `db.transaction()`](https://dexie.org/docs/Dexie/Dexie.transaction()) — atomic multi-table writes roll back on throw
- [Dexie compound indexes](https://dexie.org/docs/Compound-Index) — `[tableName+recordId]` shape for coalesce lookup
- [Dexie `db.version(N).stores()`](https://dexie.org/docs/Version/Version.stores()) — must repeat full schema each version; `++id` = auto-increment
- [Zustand `partialize`](https://zustand.docs.pmnd.rs/integrations/persisting-store-data#partialize) — selective persistence
- [Zustand SSR hydration](https://zustand.docs.pmnd.rs/integrations/persisting-store-data#hydration-and-asynchronous-storages) — hydration flag pattern
- [Zod discriminated unions](https://zod.dev/?id=discriminated-unions) — heterogeneous payload validation
- [Drizzle-Zod](https://orm.drizzle.team/docs/zod) — `createInsertSchema`, `createSelectSchema`
- [Playwright network events](https://playwright.dev/docs/network) — `context.setOffline(true)`
- [MDN setTimeout clamping](https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout#reasons_for_delays_longer_than_specified) — ≥1s in backgrounded tabs
- Codebase: `src/lib/db.ts` (v10-v15 migration pattern), `src/stores/settings-store.ts` (persist template), `src/lib/auth-middleware.ts` (withAuth), `src/lib/intake-service.ts` (pilot wiring target), `src/db/schema.ts` (Phase 42 FK graph), `.github/workflows/ci.yml` (Neon branch pattern), `e2e/global-setup.ts` (storageState)
- Planning docs: `.planning/phases/43-sync-engine-core/43-CONTEXT.md`, `.planning/research/ARCHITECTURE.md` §Sync Engine, `.planning/research/STACK.md` §Sync Engine: Custom Build, `.planning/research/PITFALLS.md`, `.planning/phases/42-postgres-schema-drizzle-setup/42-CONTEXT.md`

### Secondary (MEDIUM confidence) — WebSearch verified against official sources
- [The Hidden Problems of Offline-First Sync (dev.to, 2025-2026)](https://dev.to/salazarismo/the-hidden-problems-of-offline-first-sync-idempotency-retry-storms-and-dead-letters-1no8) — cursor race, idempotency, retry storms
- [Offline Sync Conflict Resolution Patterns (Sachith, 2026-04)](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-crash-course-practical-guide-apr-8-2026/) — LWW patterns, tombstones
- [ObjectBox Customizable Conflict Resolution (2026-03)](https://objectbox.io/customizable-conflict-resolution-for-offline-first-apps/) — HLC / server-time-based cursor safety
- [Building Offline-First Sync Engine (dev.to)](https://dev.to/daliskafroyan/builing-an-offline-first-app-with-build-from-scratch-sync-engine-4a5e) — architecture cross-check

### Tertiary (LOW confidence) — single source, flagged
- None — every claim in this research is either verified in the codebase or cited from official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything already installed in Phase 42, verified via package.json + npm view
- Architecture patterns: HIGH — CONTEXT decisions are locked; research only fills in the how, not the what
- Dexie migration mechanics: HIGH — verified against codebase v10-v15 pattern
- Push/pull scheduling: MEDIUM — setTimeout chain is standard but hand-rolled; could use a library like p-retry as alternative
- Clock skew / cursor race: MEDIUM — mitigations are standard industry practice but tunable values (60s, 30s, 500 rows) are estimates
- Testing strategy: HIGH — reuses existing Vitest/Playwright/Neon-branch infrastructure; no new patterns invented
- Security: HIGH — ASVS mapping is straightforward; all mitigations follow existing withAuth pattern
- drizzle-zod discriminated union: MEDIUM — primitives documented, exact composition is judgment

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days — sync patterns and Dexie behavior are stable; drizzle-zod is the only fast-moving dep and it's at 0.8.3 already installed)

---

*Phase: 43-sync-engine-core*
*Research: 2026-04-17*

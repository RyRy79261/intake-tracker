# 38 — Sync (UI + engine)

**Files covered:**
- `src/components/sync/sync-pulse-indicator.tsx` (ambient corner dot + status label)
- `src/components/sync/sync-error-banner.tsx` (bottom toast banner on failure)
- `src/components/sync/sync-lifecycle-mount.tsx` (invisible engine-mount component)
- `src/lib/sync-engine.ts` (push/pull loops, backoff, lifecycle triggers)
- `src/lib/sync-queue.ts` (op-log helpers over Dexie `_syncQueue`)
- `src/lib/sync-payload.ts` (push/pull zod payload schemas + table maps)
- `src/lib/sync-topology.ts` (FK parent-before-child push ordering)
- `src/lib/network-status.ts` (online/offline detection, web + Capacitor)
- `src/stores/sync-status-store.ts` (Zustand status store, persisted)
- `src/hooks/use-sync-lifecycle.ts` (start/stop engine on auth + mode)
- `src/hooks/use-sync-auto-detect.ts` (cold-start cloud-sync restore)
- `src/components/settings/storage-info-section.tsx` (settings sync status panel)
- `src/components/settings/data-management-section.tsx` (export-blocked-during-sync gate)
- `src/app/api/sync/{push,pull,status,cleanup,verify-hash}/route.ts` (server endpoints)
- `src/app/providers.tsx` (mount points)

**Purpose:** Offline-first, Last-Write-Wins replication of all 18 Dexie tables to Neon Postgres for a single user across devices. A background engine debounces local writes into batched pushes and cursor-paginated pulls; an ambient corner dot and a failure banner are the only persistent UI surfaces, with a richer status panel inside Settings → Storage.

---

## Features

### Ambient sync pulse indicator (`SyncPulseIndicator`)
- A single status dot pinned flush to the **dead top-left corner** of the viewport; only ~a quarter of the circle is visible. Fixed position, `z-[2147483647]` (max), `pointer-events-none` on the wrapper so it never blocks content; the button itself is `pointer-events-auto`.
- Color-codes one of four states (see Enums): syncing=yellow, synced=green, offline=slate, error=red.
- **Pulses** (animate-ping ring at 60% opacity) only while in the `syncing` state.
- Color transitions are animated (`transition-colors duration-500`).
- Renders a **toast-like text label** that auto-fades. The label flashes automatically whenever a sync cycle *starts*, and on tap. Auto-dismisses after `LABEL_DURATION_MS = 1800ms`.
- Label slides in from the left (`translate-x` + opacity transition, 300ms).
- Label text is dynamic and reflects the precise sub-state (download vs. N-changes vs. generic).
- Only rendered at all when `storageMode === "cloud-sync"` AND authenticated AND not on an `/auth` route — otherwise returns `null`.
- Stays in the `syncing` state until the **first full pull** completes (`initialSyncComplete`), so a fresh device never flashes "synced" prematurely.

### Sync error banner (`SyncErrorBanner`)
- A dismissible toast fixed to the **bottom** (`bottom-4 left-4 right-4`, max-w-md, centered), `z-50`.
- Slides up on appear (`animate-in slide-in-from-bottom-4 duration-300`).
- Shows a fixed "Sync failed" heading + the raw `lastError` string (broken across words, xs, 80% opacity).
- Destructive-themed styling with `AlertTriangle` icon, blurred translucent background, distinct dark-mode variant.
- Has a dismiss (X) button; once dismissed it stays hidden for the session (local `dismissed` state — note: not re-shown on a new error until remount).
- Only shown when `lastError` is set AND not dismissed AND authenticated AND not on `/auth`.

### Sync lifecycle mount (`SyncLifecycleMount`)
- Renders `null`. Composes the two lifecycle hooks (`useSyncAutoDetect`, `useSyncLifecycle`) driven by `authenticated`.
- Mounted once in the provider tree alongside the pulse indicator and error banner.

### Engine — push (`sync-engine.ts`)
- **Debounced push**: `schedulePush(delayMs = 3000)` collapses rapid writes into one flush firing `delayMs` after the *last* call. No-op when engine not started or suspended.
- **Push cycle** (`runPushCycle`): collects up to `PUSH_BATCH_CAP = 50` queue rows ordered by FK topology (parent-before-child), FIFO within a table; POSTs `{ops}` to `/api/sync/push`; applies server `updatedAt` acks (guarded); removes acked queue rows; chains a pull; re-drains if more rows queued during flight.
- **Idempotent / guarded**: no-op if a push is already in flight, engine suspended, or device offline.
- **Server ack application**: only writes the server `serverUpdatedAt` back onto the local row when `local.updatedAt <= serverUpdatedAt` (avoids clobbering a newer in-flight local edit).
- **Rejected ops**: increments per-row `attempts`, surfaces `"N record(s) failed: <table>: <error>"` to `lastError`, logs `[sync] N op(s) rejected`.
- **Exponential backoff with jitter** (`nextBackoff`): `2000 * 2^attempts` capped at `60000`, ±20% jitter. On network/HTTP failure increments attempts and reschedules a push via this backoff.
- **401 handling**: clears `lastError` and silently returns (treats unauthenticated as not-an-error).

### Engine — pull (`sync-engine.ts`)
- **Microtask-scheduled pull** (`schedulePull`) — avoids synchronous recursion when chained from a push.
- **Pull cycle** (`runPullCycle`): reads per-table keyset cursors `(updatedAt, id)` from `_syncMeta`, POSTs `{cursors}` to `/api/sync/pull`, applies each table's returned rows in an atomic `bulkPut` + cursor-advance transaction, and loops while *any* table reports `hasMore`.
- **Clock-skew cursor clamp**: when a table drains but its newest rows fall inside the `SKEW_MARGIN_MS = 30000` window, the persisted cursor is clamped back to `serverTime - 30s` (id reset to `""`) so the next pull re-scans for concurrently-written rows. Not applied while `hasMore` is true (would re-fetch the same page forever).
- On full drain: sets `lastPulledAt`, clears `lastError`, sets `initialSyncComplete = true`, and **invalidates all React Query caches** so every hook refetches.
- **No pull backoff**: unlike push, a network/HTTP failure during pull only sets `lastError` and returns — it does **not** reschedule a retry. The next pull comes solely from a chained push or another trigger (online/visibility/startup).

### Engine — lifecycle / triggers
- **Startup pull** kicked once on `startEngine()` (D-10).
- **Network listener**: on `online`, schedules an immediate push (`delay 0`) and a pull; updates `isOnline` in the store.
- **Visibility listener**: when the tab/app becomes visible AND online, schedules an immediate push (catches edits made before backgrounding).
- **Suspend/resume** (`suspendEngine` / `resumeEngine`): used by the in-app component preview (help docs) which swaps the active DB to a throwaway; suspension cancels pending push timers and gates push/pull/schedule so preview data never reaches the cloud.
- **Stop/start** (`stopEngine` / `startEngine`): idempotent; stop cancels timers, resets flags, clears error + syncing. Used on logout→login transitions.
- **Dev-only hook**: in non-production, exposes `window.__syncEngine = { pushNow, pullNow, getQueueDepth }` (string guarded out of production bundle).

### Queue (`sync-queue.ts`)
- **`enqueue(table, id, op)`**: append-or-coalesce a pending op against the `[tableName+recordId]` compound index (4 coalesce rules — see Business rules).
- **`writeWithSync(table, op, action)`**: wraps a Dexie data write + its enqueue in a single `rw` transaction so both roll back together on throw.
- **`ack(queueIds)`**: bulk-delete acknowledged rows (idempotent, ignores unknown ids).
- **`getQueueDepth()`**: cheap `count()` for the status UI.

### Auto-detect cloud sync (`use-sync-auto-detect.ts`)
- On cold start (cleared localStorage / new device) where `storageMode === "local"`, calls `GET /api/sync/status` once; if the server reports `hasSyncedData`, silently flips `storageMode` back to `"cloud-sync"`. Silent on failure (user can re-enable manually). Runs at most once per session (`checked` ref guard).

### Settings — storage info panel (`StorageInfoSection`)
- Shows a **Sync status badge**: "Cloud Sync" (green) or "Local only" (secondary).
- In cloud-sync mode shows a **full-copy line** with three sub-states (have full copy / downloading / waiting offline).
- Shows **"Last synced <localized timestamp>"** from `lastPushedAt`.
- In local mode + authenticated: a **"Switch to Cloud Sync"** button (or **"Resume Migration"** if an interrupted migration is detected).
- In local mode + signed-out: a "Sign In to enable cloud sync" prompt.
- Shows estimated storage usage/quota and total record count.

### Settings — export gate (`DataManagementSection`)
- Blocks/​warns on data export while `storageMode === "cloud-sync" && !initialSyncComplete` (this device may not yet hold the full cloud dataset → export would be incomplete). Shows a confirm-anyway warning dialog.
- The component also (beyond the sync-incomplete export gate) gates **import** behind its own confirm dialog ("merge backup data with your existing data — new records added, duplicates skipped") and, after an import, surfaces a **conflict-review drawer** ("Review N conflicts") when the import reports conflicts.

### Server endpoints
- **`POST /api/sync/push`**: batched LWW upsert/delete; returns `{accepted[], rejected[]}`. On a Zod validation 400 it logs the full `parsed.error.flatten()` to the **server logs** (`[sync/push] Zod validation failed`) but returns only a generic `{ error: "Invalid request" }` to the client.
- **`POST /api/sync/pull`**: cursor-paginated per-table SELECT; returns `{result, serverTime}`. On a Zod validation 400 it returns `{ error: "Invalid request", details: parsed.error.flatten() }` to the **client** (asymmetric with push, which never leaks validation details to the client).
- **`GET /api/sync/status`**: probes 5 high-signal tables, returns `{hasSyncedData: boolean}`.
- **`POST /api/sync/cleanup`**: hard-deletes all of a user's server rows (FK-safe order) — used by migration/reset.
- **`POST /api/sync/verify-hash`**: returns deterministic SHA-256 per-table hashes + row counts for integrity verification (migration flow).

---

## User actions & interactions

- **Tap the corner dot** → flashes the status label for 1800ms (`flashLabel`). The dot has an `aria-label` equal to the current status string. No other effect — it is purely informational.
- **Dismiss the error banner (X)** → hides the banner for the rest of the session.
- **Settings → "Switch to Cloud Sync"** → opens the migration wizard (fresh).
- **Settings → "Resume Migration"** → opens the migration wizard in resume mode (only shown when an interrupted migration is detected).
- **Settings → "Sign In"** (local + signed-out) → navigates to `/auth`.
- **Settings → Export with incomplete sync** → opens a confirm dialog ("export may be incomplete"); confirm proceeds, cancel aborts.
- **Implicit (no UI)**: any data write throughout the app enqueues a sync op and (after 3s debounce) triggers a push. Going online, the tab becoming visible, login, and app start all trigger pushes/pulls automatically.

---

## States & presentations

### Pulse indicator — four mutually-exclusive states (priority order: error → offline → syncing → synced)
| State | Color | Animation | Label |
|---|---|---|---|
| `error` (`lastError` set) | red (`bg-red-500`) | none | "Sync error" |
| `offline` (`!isOnline`) | slate (`bg-slate-400`) | none | "Offline — changes saved locally" |
| `syncing` (`isSyncing` OR `queueDepth>0` OR `!initialSyncComplete`) | yellow (`bg-yellow-400`) | ping pulse | dynamic (below) |
| `synced` (default) | emerald (`bg-emerald-500`) | none | "All changes synced" |

- **Syncing label variants**:
  - `!initialSyncComplete` → **"Downloading your data…"**
  - `queueDepth > 0` → **"Syncing N change(s)…"** (singular "change" when N===1, else "changes")
  - else → **"Syncing…"**
- **Label visibility**: hidden by default (`opacity-0`, slightly offset), shown on sync-start or tap, fades after 1800ms.
- **Not rendered**: when storageMode≠cloud-sync, unauthenticated, or on `/auth` routes.

### Error banner states
- **Hidden**: no `lastError`, dismissed, unauthenticated, or on `/auth`.
- **Visible**: slide-up toast with heading + error detail + dismiss button.

### Settings storage panel sub-states (cloud-sync)
- **Initial sync complete** → green check + "Full copy of your data on this device".
- **Downloading (online, not complete)** → amber spinner (`Loader2 animate-spin`) + "Downloading your full data to this device…".
- **Waiting (offline, not complete)** → `CloudOff` icon + "Waiting to download your data (offline)".
- **Last-synced line** appears only when `lastPushedAt` exists.

### Engine internal states (not directly visual, but drive store)
- `isSyncing` true while a push OR pull cycle is in flight; flips `false` in `finally`.
- `pushInFlight` / `pullInFlight` guards make cycles non-reentrant.
- `engineSuspended` (preview active) / `engineStarted` (lifecycle).

---

## Enums, options & configurable values

### Engine constants (`sync-engine.ts`)
- `DEBOUNCE_MS = 3000` (after-write push debounce window)
- `PUSH_BATCH_CAP = 50` (max queue rows collected per push cycle)
- `BACKOFF_BASE_MS = 2000`
- `BACKOFF_CAP_MS = 60_000`
- `JITTER_RATIO = 0.2` (±20%)
- `SKEW_MARGIN_MS = 30_000` (pull cursor clock-skew clamp)
- Backoff formula: `round(min(2000·2^attempts, 60000) · (0.8 + random·0.4))`

### Indicator constants
- `LABEL_DURATION_MS = 1800`
- `COLOR` map: syncing `bg-yellow-400`, synced `bg-emerald-500`, offline `bg-slate-400`, error `bg-red-500`
- `PulseState` enum: `"syncing" | "synced" | "offline" | "error"`

### Storage mode
- `storageMode: "local" | "cloud-sync"` (settings-store), default `"local"`.
- Badge labels: "Cloud Sync" / "Local only".

### Sync op enum
- `SyncOp = "upsert" | "delete"` (delete path reserved; pilot does soft-delete via upsert with `deletedAt`).

### Server payload caps
- Push: `z.array(opSchema).max(500)` (500 ops/payload server-side; client sends ≤50/cycle).
- Pull: `PULL_SOFT_CAP = 500` rows per table per request (`limit(PULL_SOFT_CAP + 1)` to detect `hasMore`).
- Push route: `MAX_FUTURE_MS = 60_000` clock-skew clamp; `SELECT_CHUNK_SIZE = 100`.
- Verify-hash route: `SELECT_CHUNK_SIZE = 200`.
- All routes: `maxDuration = 60` (Vercel timeout guard).

### The 18 syncable tables (`TABLE_PUSH_ORDER`, FK parent-before-child)
1. `prescriptions` 2. `titrationPlans` 3. `medicationPhases` 4. `phaseSchedules` 5. `inventoryItems` 6. `doseLogs` 7. `inventoryTransactions` 8. `dailyNotes` 9. `intakeRecords` 10. `substanceRecords` 11. `weightRecords` 12. `bloodPressureRecords` 13. `eatingRecords` 14. `urinationRecords` 15. `defecationRecords` 16. `auditLogs` 17. `userProfile` 18. `insightReports`
- Pull iterates these but **excludes `auditLogs`** (pull route filters `t !== 'auditLogs'`).
- Cleanup uses a reverse child-before-parent `DELETION_ORDER` (16 tables; userProfile/insightReports omitted there).
- Status probe tables: `intakeRecords, weightRecords, prescriptions, doseLogs, auditLogs`.

---

## Data model touched

### Dexie tables (read/written by engine + queue)
- **`_syncQueue`** (`SyncQueueRow`): `id?` (++auto), `tableName`, `recordId`, `op: "upsert"|"delete"`, `enqueuedAt: number`, `attempts: number`. Indexes: `++id, [tableName+recordId], tableName, enqueuedAt` (Dexie v16+).
- **`_syncMeta`** (`SyncMetaRow`): `tableName` (PK), `lastPulledUpdatedAt: number`, `lastPulledId?: string` (keyset tiebreaker, defaults `""`).
- All 18 data tables (read for push payloads, written via `bulkPut` on pull).

### Zustand store (`sync-status-store.ts`, persist key `intake-tracker-sync-status`, version 2)
- Persisted: `lastPushedAt: number|null`, `lastPulledAt: number|null`, `initialSyncComplete: boolean`.
- Ephemeral (reset on reload): `isOnline: boolean` (default true), `isSyncing: boolean`, `queueDepth: number`, `lastError: string|null`.
- Actions: `setOnline, setSyncing, setQueueDepth, setLastError, markPushed, markPulled`. **Note:** `markPushed` / `markPulled` are effectively dead — the engine never calls them; it writes `lastPushedAt` / `lastPulledAt` via `setState` directly.
- Migration v<2: `initialSyncComplete = (lastPulledAt != null)` for legacy users.

### Server (Neon Postgres via Drizzle) — `sync-payload.ts` schemas
- Push body: `{ ops: [{ queueId: number, tableName: <literal>, op: "upsert"|"delete", row: <table row schema, .omit({userId}) > ] }`.
- Push response: `{ accepted: [{queueId, serverUpdatedAt}], rejected: [{queueId, tableName, error}] }`.
- Pull body: `{ cursors: { <tableName>: number | {updatedAt, id} } }` (partialRecord; unknown keys 400-rejected; `__proto__` rejected at preprocess boundary).
- Pull response: `{ result: { <tableName>: {rows[], hasMore} }, serverTime }`.
- Every row schema omits `userId` (server derives `auth.userId!` from session — client cannot forge).

---

## Validation, edge cases & business rules

### Queue coalesce rules (D-04, `enqueueInsideTx`)
- none + any → add new row
- upsert + upsert → update `enqueuedAt` only (keep attempts)
- upsert + delete → switch op to delete, reset attempts (delete wins)
- delete + upsert → switch op to upsert, reset attempts (un-delete)
- delete + delete → update `enqueuedAt` only

### Push collection / ordering
- Grouped by table in `TABLE_PUSH_ORDER`; FIFO within table (`enqueuedAt` ASC). Unknown table names skipped.
- Delete ops carry the soft-deleted tombstone row if present, else synthesize a minimal stub `{id, deletedAt, updatedAt}`.
- Upsert ops re-read the live Dexie row at flush time (latest-wins, D-04); skip if the row vanished.

### Server LWW precedence (push route, D-12)
1. Server row has non-null `deletedAt` AND incoming `deletedAt` null → **skip** (deleted can't be resurrected), ack with server's `updatedAt`.
2. No server row OR `clampedUpdatedAt > existing.updatedAt` → **upsert** (`onConflictDoUpdate`).
2b. **Tombstone tie-break**: incoming tombstone vs live server row at an *exact* `updatedAt` tie → write the tombstone (delete wins ties).
3. Else (server newer, or upsert/upsert tie) → **skip**, ack with `existing.updatedAt` (server wins ties via strict `>`).
- `clampedUpdatedAt = min(op.row.updatedAt, serverNow + 60_000)` (future-clock clamp).
- Ensures the user row exists in `users_sync` (`onConflictDoNothing`) before FK-dependent inserts.
- `sanitizeRow`: converts `undefined`/`""` field values to `null` before write.
- DB errors → reject op with generic `"Server rejected the write"` (no schema leakage); request body never logged (PHI).

### Pull keyset pagination
- Filter: `updatedAt > cursor.updatedAt OR (updatedAt = cursor.updatedAt AND id > cursor.id)`; order `(updatedAt ASC, id ASC)`.
- `serverTime` captured BEFORE any SELECT; client clamps next cursor to `min(maxRowUpdatedAt, serverTime − 30s)`.
- Tombstones are NEVER filtered out (applied as soft-delete writes on client).
- Cursor advance while `hasMore` uses the exact last tuple (no skew clamp) to make forward progress through duplicate-`updatedAt` runs.

### Client ack guard
- Apply server `updatedAt` to local row only when `local.updatedAt <= serverUpdatedAt` (Pitfall 3 — protects a newer in-flight local edit already re-enqueued by coalesce).

### Engine guards / gating
- Push/pull no-op when offline, suspended, or already in flight.
- Re-drain after a successful push only when ≥1 op was acked (else un-acked ops loop forever).
- Engine only runs when `authenticated && storageMode === "cloud-sync"`; otherwise lifecycle hook clears `lastError`/`isSyncing` and returns.
- 401 on push/pull treated as silent non-error (clears `lastError`).
- Network detection: cached `navigator.onLine`, web `online`/`offline` events, or Capacitor `@capacitor/network` listener when running native.

### Security
- All routes behind `withAuth`; every SELECT/write scoped by `eq(table.userId, auth.userId!)`; client `userId` never trusted (`.omit({userId})`).
- Pull rejects unknown cursor keys and `__proto__` at the schema boundary; `id` capped at 200 chars; `updatedAt` must be a non-negative integer.

---

## Sub-components / variants

- **`SyncPulseIndicator`** — ambient corner status dot + auto-fading label (the primary always-on sync UI).
- **`SyncErrorBanner`** — dismissible bottom failure toast showing `lastError`.
- **`SyncLifecycleMount`** — null-rendering mount that wires the engine to auth state.
- **`StorageInfoSection`** (settings) — full sync-status panel: badge, full-copy state, last-synced, switch/resume/sign-in CTAs.
- **`DataManagementSection`** (settings) — export gate warning the user when sync is incomplete; also wraps the import confirm dialog and post-import conflict-review drawer.
- **`useSyncLifecycle`** — starts/stops the engine on `authenticated × storageMode` changes.
- **`useSyncAutoDetect`** — one-shot cold-start cloud-sync restore via `/api/sync/status`.
- **`sync-queue.ts`** — `enqueue`, `enqueueInsideTx`, `writeWithSync`, `ack`, `getQueueDepth`.
- **`sync-engine.ts`** — `nextBackoff`, `schedulePush`, `runPushCycle`, `schedulePull`, `runPullCycle`, `startEngine`, `stopEngine`, `suspend/resumeEngine`, lifecycle listeners.
- **`sync-payload.ts`** — push/pull zod schemas, `schemaByTableName`, `PULL_SOFT_CAP`.
- **`sync-topology.ts`** — `TABLE_PUSH_ORDER` FK ordering + `TableName` union.
- **`network-status.ts`** — `isOnline`, `initNetworkListener` (web + Capacitor).
- **API routes** — `push`, `pull`, `status`, `cleanup`, `verify-hash`.

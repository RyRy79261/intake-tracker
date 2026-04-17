# Phase 43: Sync Engine Core - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a bidirectional sync module between Dexie (IndexedDB, local-first) and NeonDB (Postgres, server) that delivers: local-first writes that never block on the network; queued background push with exponential backoff; periodic/on-reconnect pull; and record-level last-write-wins conflict resolution driven by `updatedAt`.

Phase 43 proves the engine end-to-end against **one pilot service** (`intake-service.ts`). Phase 44 wires the remaining 14 services and builds the user-facing status UI. Phase 45 handles the one-time historical migration via a wizard. The sync engine and its API routes are delivered here; broad service integration and UI are **out of scope**.

</domain>

<decisions>
## Implementation Decisions

### Queue + Ordering
- **D-01:** Dirty records are tracked in a dedicated Dexie op-log table (`_syncQueue`), not via dirty flags on data rows. Op-log rows carry at minimum `{id, tableName, recordId, op: 'upsert'|'delete', enqueuedAt, attempts}`. Explicit FIFO semantics, crash-safe, decoupled from the 16 data tables.
- **D-02:** Push enforces parent-before-child ordering via a **static topological sort in code**, derived from the Phase 42 FK graph: `prescriptions → medicationPhases → phaseSchedules → doseLogs` and `intakeRecords → substanceRecords`. Pusher groups queued ops by table and flushes in this order. FK graph is static — no runtime dependency tracking.
- **D-03:** Successful ops are **deleted from `_syncQueue` on ack**. Server response includes an `accepted: [{queueId}]` array; client deletes exactly those rows. No audit/status-flag history in the queue.
- **D-04:** Writes are **coalesced on enqueue**. If an unsynced op already exists for `(tableName, recordId, op='upsert')`, its `enqueuedAt` is updated rather than appending a new row. Push reads the current Dexie row at flush time — queue carries latest-wins intent, not row snapshots. Deletes are never coalesced with upserts: a delete op supersedes any queued upsert for the same record.

### API Surface
- **D-05:** Two generic endpoints: `POST /api/sync/push` (accepts a batch of heterogeneous ops across tables) and `POST /api/sync/pull` (returns changes since cursors, body carries the cursor map). Both sit under `withAuth`, scope writes/reads by session `user_id`, and use the same pattern established by Phase 41's auth-guarded routes.
- **D-06:** Push payload per op is `{queueId, tableName, op: 'upsert'|'delete', row: {...full record}}`. Full rows, not diffs — server does the LWW compare and writes, simple and idempotent. Validation is via `drizzle-zod`-generated schemas derived from `src/db/schema.ts` (Phase 42 D-20 unlocks this).
- **D-07:** Pull uses a **per-table `updatedAt` cursor**. Client persists the cursor map in a Dexie `_syncMeta` singleton table (`{tableName → lastPulledUpdatedAt}`). Request body is `{cursors: {tableName: ts}}`; response returns `{tableName: {rows: [...], hasMore: bool}}` sorted by `updatedAt ASC`. Tombstones (rows with non-null `deletedAt`) are included — the client applies them as soft-delete writes.
- **D-08:** Pull responses are **soft-capped per table** (planner's discretion on the cap — think ~500 rows). Client re-calls pull until `hasMore` is false for every table. Keeps memory bounded on first-login bulk pulls and week-offline reconnects.

### Triggers + Conflict Edges
- **D-09:** Push fires on **three triggers**: debounced after-write (~2–5s after the last write, planner picks exact value), `online` event from `navigator`, and tab `visibilitychange → visible`. No periodic timer — writes and reconnect are the real signals.
- **D-10:** Pull fires on: app startup, after each successful push (so the client sees its own server-authoritative timestamps), and on `online` event. No periodic pull — single-user means remote changes only come from this user's other devices, and push→pull catches those on next use.
- **D-11:** Retries use **exponential backoff with cap + jitter**: 2s, 4s, 8s, 16s… capped at 60s, with ±20% jitter. **No max-retries and no dead-letter queue** — ops stay queued until a successful push. Phase 44 is responsible for any user-facing "clear failed op" debug affordance.
- **D-12:** Conflict edges (in precedence order):
  1. **Record-level LWW by `updatedAt`** (SYNC-04).
  2. **On exact tie, server row wins.**
  3. **Non-null `deletedAt` on either side → deleted wins regardless of `updatedAt`.** Soft-delete must never be resurrected by a stale edit.
  4. **Server is authoritative on ack**: the push response returns the server's written `updatedAt` per op, and the client overwrites its local copy. Prevents drift from client-clock skew.

### Scope + Observability
- **D-13:** Phase 43 wires sync into **`intake-service.ts` only** (pilot). Every write path in that service calls `syncQueue.enqueue()` after the Dexie write; the pull loop writes into `db.intakeRecords` on successful pull. Phase 44 wires the remaining 14 services and delivers the status UI. This keeps P43 focused on engine correctness and bounds engine-redesign risk to one service's wiring.
- **D-14:** Sync engine status lives in a new Zustand store: `src/stores/sync-status-store.ts`. Shape: `{lastPushedAt, lastPulledAt, queueDepth, isOnline, isSyncing, lastError}`. Persisted fields (`lastPushedAt`, `lastPulledAt`) use Zustand's `persist` middleware to localStorage — matches the existing `settings-store.ts` convention. Ephemeral fields (`isOnline`, `isSyncing`, `queueDepth`, `lastError`) stay in-memory. Phase 44's status UI subscribes via selectors; no Dexie migration cost beyond `_syncQueue` + `_syncMeta`.
- **D-15:** A Dexie **v16 migration** adds `_syncQueue` (op-log) and `_syncMeta` (cursor map). No changes to the 16 data tables — their existing sync scaffolding (`createdAt`/`updatedAt`/`deletedAt`/`deviceId`) is already sufficient.

### Dev/Test Fixtures (local only, never committed)
- **D-16:** Real user-data JSON export lives at `.private-fixtures/intake-tracker-backup-2026-04-17.json` (from `backup-service.ts` export format, matches the `BackupData` interface). `.private-fixtures/` is git-ignored. Used for: (a) seeding a dev Dexie with realistic volume before exercising the engine, (b) dry-running the push path against a throwaway Neon branch, (c) rehearsing the Phase 45 migration wizard before it ever touches real data.
- **D-17:** Planner should add a dev-only seed script (path-configurable via `DEV_SEED_JSON` env var) that imports the fixture through `backup-service.importBackup()` — reuses existing import logic rather than inventing a parallel loader.

### Claude's Discretion
- Exact debounce value for after-write push trigger (D-09) — planner picks in the 2–5s range.
- Exact soft-cap for pull response size per table (D-08).
- Whether `_syncQueue` gets a compound `(tableName, recordId)` index for fast coalesce lookup.
- Exact auth wrapper for the two sync routes — reuse whatever `withAuth` shape Phase 41 established.
- Whether the pilot `intake-service.ts` wiring goes through a thin `syncQueue.enqueue()` helper or inlines the enqueue per method.
- Test strategy for FK topo-sort unit coverage (since the pilot service has no inner FKs, the ordering logic should be covered by a dedicated unit test rather than waiting for P44).
- Shape and key of the server-authoritative ack payload (array of `{queueId, updatedAt}` vs map) — any shape works as long as the client can reconcile.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Sync Engine Design
- `.planning/research/ARCHITECTURE.md` §"Sync Engine" / §"Component-by-Component Change Analysis" — target architecture diagram, service-layer enqueue pattern, API route sketch. Ground truth for this phase's shape.
- `.planning/research/STACK.md` §"Sync Engine: Custom Build" — custom module rationale (why not Dexie Cloud / dexie-syncable), sync design steps, confidence notes.
- `.planning/research/PITFALLS.md` — known sync pitfalls (if file contains sync content); read first for edge cases to plan around.

### Requirements + Roadmap
- `.planning/REQUIREMENTS.md` §"Cloud Sync" — SYNC-01 through SYNC-05 acceptance criteria (record-level LWW is the ceiling; per-field merge excluded).
- `.planning/ROADMAP.md` §"Phase 43: Sync Engine Core" — goal, success criteria, SYNC-01..05 mapping, dependency on Phase 42.
- `.planning/ROADMAP.md` §"Phase 44: Sync Service Integration" and §"Phase 45: Data Migration" — downstream phase boundaries; anything matching those descriptions is NOT part of P43.

### Prior-Phase Decisions That Propagate
- `.planning/phases/42-postgres-schema-drizzle-setup/42-CONTEXT.md` §"Schema Shape & Types" — bigint ms timestamps, `user_id text NOT NULL` on every row, inner FKs without cascade (D-08 in P42 — this is what forces P43 D-02 topo-sort).
- `.planning/phases/42-postgres-schema-drizzle-setup/42-CONTEXT.md` §"Integration with Phase 41 & Existing Code" — D-20 marks `drizzle-zod` as a P43 concern for sync-payload validation.
- `.planning/phases/41-neon-auth-privy-removal/41-01-PLAN.md` — `withAuth` + `getSession` pattern the two sync routes must sit beside.

### Existing Code (must be read before modifying)
- `src/lib/db.ts` — Dexie schema v15 (will bump to v16). `_syncQueue` + `_syncMeta` table definitions land here.
- `src/db/schema.ts` — Phase 42 Drizzle source of truth. `drizzle-zod` schemas for sync-payload validation derive from this.
- `src/lib/intake-service.ts` — pilot service. Write paths gain `syncQueue.enqueue()` calls.
- `src/lib/backup-service.ts` — existing export/import covering all 16 tables; `BackupData` shape matches the fixture at `.private-fixtures/`. Dev seed script reuses `importBackup()` rather than inventing a parallel loader.
- `src/stores/settings-store.ts` — template for the new `sync-status-store.ts` (Zustand + `persist` middleware pattern).
- `src/lib/auth-middleware.ts` — `withAuth` wrapper to reuse on the two sync routes.

### Dev/Test Fixtures (local only)
- `.private-fixtures/intake-tracker-backup-2026-04-17.json` — real user export for dev seeding and end-to-end testing. `.private-fixtures/` is git-ignored.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backup-service.ts` — `BackupData` interface + `exportAll()` / `importBackup()` already cover all 16 tables with optional encryption. Dev seed script reuses `importBackup()`; no parallel loader needed. Fixture at `.private-fixtures/` matches this shape exactly.
- `settings-store.ts` — existing Zustand + `persist` pattern is the direct template for `sync-status-store.ts`.
- `@neondatabase/serverless` + Drizzle `neon-http` driver (installed in Phase 42) — zero new HTTP dependency for the two sync routes.
- `drizzle-zod` (installed in Phase 42) — generates runtime Zod schemas from `src/db/schema.ts` for push-payload validation.
- `src/lib/auth-middleware.ts` `withAuth` wrapper — same auth guard Phase 41 established for protected routes.
- `navigator.onLine` + `online`/`offline` / `visibilitychange` events — zero-dependency reconnect detection.
- React Query `useMutation` — already pervasive; the sync engine itself does not need React Query, but UI affordances in Phase 44 will.

### Established Patterns
- Every data row carries `createdAt` / `updatedAt` / `deletedAt` / `deviceId` scaffolding since Dexie v10 — the sync engine treats these as the canonical sync metadata. No per-field timestamps (deferred from P42).
- Soft-delete via nullable `deletedAt` — never hard-delete. Sync engine propagates deletes as upserts-with-deletedAt.
- String UUIDs (`crypto.randomUUID()`) everywhere — no auto-increment; IDs are globally unique across users, safe to treat as primary key.
- Dexie migrations repeat full schema per version (db.ts v15 pattern) — v16 must repeat all 16 table definitions and add the two new tables.
- API routes under `src/app/api/**` use `NextResponse` + `withAuth` pattern — two sync routes follow suit.

### Integration Points
- **New:** `src/lib/sync-engine.ts` (core module: push loop, pull loop, backoff, trigger wiring).
- **New:** `src/lib/sync-queue.ts` (op-log enqueue/coalesce/ack helpers over `db._syncQueue`).
- **New:** `src/lib/sync-topology.ts` (static FK topo-sort table order).
- **New:** `src/stores/sync-status-store.ts` (Zustand store for engine status).
- **New:** `src/app/api/sync/push/route.ts` + `src/app/api/sync/pull/route.ts`.
- **New:** `scripts/seed-dev-db.ts` (reads `DEV_SEED_JSON`, calls `backup-service.importBackup()`).
- **Modified:** `src/lib/db.ts` — v16 bump adds `_syncQueue` + `_syncMeta`.
- **Modified:** `src/lib/intake-service.ts` — pilot wiring of `syncQueue.enqueue()` after every write path.
- **Modified:** `.gitignore` — `.private-fixtures/` entry (already done during discuss).
- **Unchanged in P43:** the other 14 service files (`medication-service`, `health-service`, `dose-log-service`, `eating-service`, `substance-service`, `composable-entry-service`, etc.) — wired in P44.
- **Unchanged in P43:** status UI / settings page — built in P44.
- **Unchanged in P43:** existing historical IndexedDB data — moved to Neon in P45's wizard, not P43.

</code_context>

<specifics>
## Specific Ideas

- **One pilot service keeps the engine testable.** If the engine design needs a second pass, redo cost in P43 is one service's wiring, not fifteen. P44's wire-up is mechanical once the engine is proven.
- **Static topo sort beats runtime dependency tracking** because the FK graph is static (Phase 42 D-08). Encoding the order as an ordered array of table names in `sync-topology.ts` is auditable in one glance.
- **Coalesce-on-enqueue is a latest-wins signal, not a snapshot.** Push always reads the current Dexie row at flush time — keeps the queue tight and avoids stale-payload bugs from rapid edits.
- **Server-authoritative ack timestamps** close the client-clock-skew loop: local `updatedAt` is overwritten with what the server actually wrote on success, so the pull path never sees a "newer local" it already accepted.
- **`deletedAt` wins every tie** is the one non-LWW rule in the conflict matrix. Resurrection-from-stale-edit is the nastiest soft-delete bug; this rule blocks it by design.
- **No dead-letter queue** is deliberate — single-user app, server is the same user, failures are almost always transient (network, auth expiry). Ops stay queued until a real success. Phase 44 owns user-facing recovery affordances.
- **Fixture-driven dev seed** means the engine sees real shapes and volumes before it ever runs against production Neon. The existing `backup-service.importBackup()` makes this one import statement, not a new loader.
- **Zustand store + localStorage persistence** matches the codebase's established pattern and costs zero Dexie-migration overhead beyond the two new sync tables.

</specifics>

<deferred>
## Deferred Ideas

### Phase 44 (Sync Service Integration)
- Wiring `syncQueue.enqueue()` into the remaining 14 services (medication, health, dose-log, eating, substance, composable-entry, weight, blood-pressure, urination, defecation, inventory, inventory-transaction, titration-plan, daily-notes, audit).
- Sync status UI inside the Storage & Security section of Settings (last sync time, online indicator, queue depth, sync health).
- User-facing "clear failed op" or "force resync" debug affordances.
- Offline-queue overflow protection (e.g. cap queue size, warn user).
- E2E tests covering offline→online flush across all services.

### Phase 45 (Data Migration)
- One-time wizard uploading existing IndexedDB data to NeonDB.
- Mandatory backup before upload + row-count verification after.
- Resumable migration cursors.
- Reuse of sync push path — P45 will build on the engine delivered here.

### Future Enhancements (out of v2.0 scope)
- Per-field timestamp merge (deferred in P42 42-CONTEXT.md — record-level LWW is the ceiling for v2.0).
- Vector clocks / sequence numbers beyond `updatedAt`.
- Cross-tab sync-status broadcasting (single-tab single-user is the norm).
- Dead-letter queue + user-facing op recovery UI.
- WebSocket-based push-from-server (polling + event-driven triggers are sufficient).

### Explicitly Not in Scope for Phase 43
- Status UI (Phase 44).
- Wiring services beyond `intake-service.ts` (Phase 44).
- Historical data migration (Phase 45).
- Per-field merge (future milestone).
- Any Dexie structural change to the 16 data tables beyond `_syncQueue` + `_syncMeta` (none needed — existing sync scaffolding is sufficient).

</deferred>

---

*Phase: 43-sync-engine-core*
*Context gathered: 2026-04-17*

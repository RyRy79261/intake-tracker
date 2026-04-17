---
phase: 43-sync-engine-core
plan: 02
subsystem: sync
tags:
  - sync
  - dexie
  - migration
  - indexeddb

dependency_graph:
  requires:
    - 43-01 (test scaffolding: dexie-v16.test.ts stub with 6 it.todo + 1 failing MISSING test)
  provides:
    - "db.version(16) schema with _syncQueue (op-log) + _syncMeta (cursor map) stores"
    - "Exported TypeScript types SyncQueueRow and SyncMetaRow"
    - "EntityTable<SyncQueueRow, 'id'> and EntityTable<SyncMetaRow, 'tableName'> on the Dexie instance"
  affects:
    - 43-04 (sync-payload validation — can now import SyncQueueRow)
    - 43-05 (sync-queue enqueue/coalesce/ack helpers — reads/writes db._syncQueue)
    - 43-06 (sync-engine push/pull loop — reads db._syncQueue, writes db._syncMeta)
    - 43-07 (intake-service pilot wiring — calls syncQueue.enqueue() which hits db._syncQueue)

tech_stack:
  added: []
  patterns:
    - "Dexie migration: full v15 schema repeated verbatim in v16 stores block (PITFALL 5 — omission drops stores)"
    - "Additive-only migration: no .upgrade() callback because both new tables start empty"
    - "Compound index [tableName+recordId] for O(log n) coalesce lookup (D-04)"
    - "Dexie auto-increment primary key (++id) on _syncQueue for FIFO row id"
    - "Singleton-per-table primary key (tableName) on _syncMeta"
    - "Migration test seeds at raw IDB version 150 via indexedDB.open(), triggers upgrade by opening Dexie"

key_files:
  created:
    - .planning/phases/43-sync-engine-core/deferred-items.md
  modified:
    - src/lib/db.ts
    - src/__tests__/migration/dexie-v16.test.ts

decisions:
  - "Zero-touch upgrade: no .upgrade() callback — both tables start empty, matches v14 precedent (db.ts L590)"
  - "_syncQueue indexes: ++id primary, [tableName+recordId] compound (coalesce), tableName and enqueuedAt (batch-by-table scans + FIFO flush ordering)"
  - "_syncMeta keyPath = tableName (singleton per-table cursor, D-07). Only one row per table, so no secondary indexes needed"
  - "Test structure mirrors v15-migration.test.ts exactly — per-test db.close + db.delete + seed at IDB 150 + db.open to exercise the upgrade path cleanly"
  - "Data-preservation test seeds 3 intakeRecords (water, salt, water) and asserts count + field-level equality on one representative record"

metrics:
  duration_minutes: 6
  completed_at: "2026-04-17T18:28:50Z"
  tasks_completed: 2
  tests_passed: 6
  files_modified: 2
  files_created: 1
---

# Phase 43 Plan 02: Dexie v16 Schema + _syncQueue / _syncMeta Summary

Dexie v16 migration lands with two new tables (`_syncQueue` op-log and `_syncMeta` cursor map) while preserving all 16 v15 data tables verbatim — unblocking every Wave 2+ plan that needs to read/write sync state in IndexedDB.

## What Shipped

### Task 1 — TypeScript types + EntityTable fields (commit `7b36059`)

Added to `src/lib/db.ts` alongside the existing 16 record interfaces:

```typescript
export interface SyncQueueRow {
  id?: number;               // ++id auto-increment
  tableName: string;
  recordId: string;
  op: "upsert" | "delete";   // literal union, not string
  enqueuedAt: number;
  attempts: number;
}

export interface SyncMetaRow {
  tableName: string;
  lastPulledUpdatedAt: number;
}
```

Plus two new EntityTable fields on the `IntakeTrackerDB` class typing:

```typescript
_syncQueue: EntityTable<SyncQueueRow, "id">;
_syncMeta: EntityTable<SyncMetaRow, "tableName">;
```

Types ship independent of the schema block so Wave 2 executors can import `SyncQueueRow` / `SyncMetaRow` from `@/lib/db` as soon as this plan merges.

### Task 2 — db.version(16).stores block + migration tests (commit `33e84a2`)

Added to `src/lib/db.ts`:

```typescript
db.version(16).stores({
  // --- REPEAT all v15 stores verbatim (PITFALL 5: omission drops data) ---
  intakeRecords:           "id, [type+timestamp], timestamp, source, groupId, updatedAt",
  // ... 15 more data tables verbatim ...
  titrationPlans:          "id, conditionLabel, status, updatedAt",
  // --- NEW in v16 ---
  _syncQueue:              "++id, [tableName+recordId], tableName, enqueuedAt",
  _syncMeta:               "tableName",
});
```

Rewrote `src/__tests__/migration/dexie-v16.test.ts` with 6 real tests (replacing the stub `expect.fail()` test and 6 `it.todo` placeholders):

1. Existing v15 intakeRecords (3 seeded) survive upgrade with all fields intact.
2. `_syncQueue` table exists, is empty, and has `primKey.auto === true`.
3. `_syncMeta` table exists, is empty, and has `primKey.keyPath === "tableName"`.
4. `_syncQueue` coalesce round-trip via `[tableName+recordId]` compound index, with a negative-case miss assertion.
5. `_syncMeta` put+get round-trip, plus upsert semantics (put twice, row count stays at 1, value updated).
6. All 18 tables retained post-upgrade (16 v15 data tables + `_syncQueue` + `_syncMeta`).

Shared `seedAtV15()` helper opens at IDB 150, creates all 16 v15 object stores, then closes so Dexie can re-open and drive the upgrade.

## Verification

| Command | Result |
|---------|--------|
| `pnpm vitest run src/__tests__/migration/dexie-v16.test.ts` | 6 passed |
| `pnpm vitest run src/__tests__/migration/v15-migration.test.ts` | 8 passed (no regression) |
| `pnpm tsc --noEmit` (plan scope) | 0 errors in `src/lib/db.ts` and `src/__tests__/migration/dexie-v16.test.ts` |
| `grep -c "db.version(16).stores" src/lib/db.ts` | 1 |
| `grep -c "export interface SyncQueueRow" src/lib/db.ts` | 1 |
| `grep -c "export interface SyncMetaRow" src/lib/db.ts` | 1 |
| `grep -c "_syncQueue: EntityTable<SyncQueueRow" src/lib/db.ts` | 1 |
| `grep -c "_syncMeta: EntityTable<SyncMetaRow" src/lib/db.ts` | 1 |

All 5 must-have truths in the plan frontmatter verified:
- Dexie v16 opens successfully and preserves every v15 row (Task 2 test 1).
- `_syncQueue` with `[tableName+recordId]` compound index exists (Task 2 test 4).
- `_syncMeta` with `tableName` primary key exists (Task 2 test 5).
- TypeScript knows about `db._syncQueue` and `db._syncMeta` as typed EntityTable fields (Task 1 + tsc clean).
- v15 → v16 migration test passes against fake-indexeddb (Task 2 test 1–6).

## Deviations from Plan

None. Plan executed exactly as written.

## Deferred Issues (Out of Scope)

`src/lib/sync-payload.ts` is untracked at the plan base commit and has 17 pre-existing TypeScript errors related to `drizzle-zod` and `ZodDiscriminatedUnionOption` typing. This file is NOT in plan 43-02's `files_modified` list — ownership belongs to a later sync-payload plan (likely 43-04). Logged in `.planning/phases/43-sync-engine-core/deferred-items.md`.

Plan 43-02's own scope (`src/lib/db.ts` + `src/__tests__/migration/dexie-v16.test.ts`) has zero TypeScript errors and zero test failures.

## TDD Gate Compliance

- **RED:** Plan 43-01 committed the stub test file (`1369c8a test(43-01): ...`) that failed with `expect.fail(...)` — confirmed failing at plan start (1 failed, 6 todo).
- **GREEN:** `7b36059` (feat: types) + `33e84a2` (feat: schema + real tests) — all 6 tests now pass.
- **REFACTOR:** Not needed — direct implementation was clean.

## Threat Flags

None. No new network endpoints, auth paths, or trust-boundary surface introduced. IndexedDB is same-origin and per-device; `_syncQueue` / `_syncMeta` rows stay on the user's own device until Plan 43-06's push loop carries them over the authenticated sync route.

## Commits

| Hash | Task | Scope |
|------|------|-------|
| `7b36059` | Task 1 | feat: SyncQueueRow, SyncMetaRow types + EntityTable fields |
| `33e84a2` | Task 2 | feat: db.version(16).stores block + 6 passing migration tests |

## Unblocks

Wave 2 executors can now:

```typescript
import { db, type SyncQueueRow, type SyncMetaRow } from "@/lib/db";

await db._syncQueue.add({
  tableName: "intakeRecords",
  recordId: "abc",
  op: "upsert",
  enqueuedAt: Date.now(),
  attempts: 0,
});

const cursor = await db._syncMeta.get("intakeRecords");
```

Plans 43-04 (validation), 43-05 (sync-queue), 43-06 (sync-engine), and 43-07 (intake-service pilot) are unblocked by this plan.

## Self-Check: PASSED

- FOUND: src/lib/db.ts (modified, v16 stores block present)
- FOUND: src/__tests__/migration/dexie-v16.test.ts (6 real tests, stub replaced)
- FOUND: .planning/phases/43-sync-engine-core/deferred-items.md
- FOUND: commit 7b36059 (Task 1)
- FOUND: commit 33e84a2 (Task 2)

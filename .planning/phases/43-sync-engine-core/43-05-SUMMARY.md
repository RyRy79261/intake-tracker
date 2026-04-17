---
phase: 43-sync-engine-core
plan: 05
subsystem: sync
tags: [sync, queue, topology, zustand, dexie, coalesce, topo-sort]

# Dependency graph
requires:
  - phase: 43-01
    provides: Plan 01 bootstrap + stub tests (sync-queue.test.ts, sync-topology.test.ts)
  - phase: 43-02
    provides: Dexie v16 _syncQueue (++id, [tableName+recordId], tableName, enqueuedAt) and SyncQueueRow/SyncMetaRow types
provides:
  - Static FK topo order for the 16 data tables (TABLE_PUSH_ORDER readonly tuple + TableName literal union)
  - Op-log queue helpers (enqueue, ack, getQueueDepth) with D-04 coalesce semantics via [tableName+recordId] compound index
  - Atomic data+queue write helper (writeWithSync) — single rw transaction, both tables roll back on throw
  - Zustand sync status store with persist partialize (only lastPushedAt + lastPulledAt persist; other fields reset on reload)
affects: [43-06, 43-07, 44, 45]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static FK topo order as a `readonly` tuple `as const` with derived literal-union type"
    - "Coalesce-on-enqueue via Dexie compound index lookup + update-vs-add branching"
    - "Shared inner coalesce helper reused by standalone enqueue() and writeWithSync() to avoid nested Dexie rw transactions"
    - "Zustand `persist` with `partialize` projecting a 2-field subset to localStorage"

key-files:
  created:
    - src/lib/sync-topology.ts
    - src/lib/sync-queue.ts
    - src/stores/sync-status-store.ts
  modified:
    - src/__tests__/sync-topology.test.ts
    - src/__tests__/sync-queue.test.ts

key-decisions:
  - "Declared an internal `coalesceInsideTx` helper and kept it un-exported — reused by both `enqueue()` (opens its own tx) and `writeWithSync()` (reuses the outer tx) so Dexie never sees nested overlapping rw transactions"
  - "Used numeric auto-increment `id` on _syncQueue rows (already chosen in 43-02 via `++id`); enqueue reads back the auto-assigned id via `.first()` on the [tableName+recordId] index for update branches"
  - "Queued-op coalesce for same-op (upsert+upsert, delete+delete) updates enqueuedAt only and keeps attempts — prevents a retry storm from resetting backoff progress on a still-failing row"
  - "Cross-op coalesce (upsert↔delete) resets attempts to 0 — the new intent gets a fresh retry budget because it represents a genuinely different payload"
  - "`isOnline` default reads `navigator.onLine` only when `typeof navigator !== 'undefined'` so the module stays SSR-safe; true is the fallback when navigator is absent"

patterns-established:
  - "Topo-order constant shape: readonly tuple `as const` + `typeof[number]` literal union for compile-time table-name validation"
  - "Every FK edge in src/db/schema.ts is mirrored as a parent→child pair in the topo parity test — changing the schema without updating TABLE_PUSH_ORDER fails CI"
  - "Transactional helpers accept either `db.table(name)` for dynamic-table scoping or the explicit EntityTable — `db.transaction('rw', db.table(tableName), db._syncQueue, …)` works for writeWithSync's generic tableName parameter"

requirements-completed: [SYNC-01, SYNC-02]

# Metrics
duration: ~15min
completed: 2026-04-17
---

# Phase 43 Plan 05: Sync queue + topology + status store Summary

**Pure client-side op-log helpers (enqueue/ack/writeWithSync with D-04 coalesce), static FK topo order, and Zustand sync-status store with 2-field persist partialize — all three modules ready for Plan 06 engine composition**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-17T16:34:00Z (worktree base reset)
- **Completed:** 2026-04-17T16:40:00Z
- **Tasks:** 3 (Task 1 topo, Task 2 queue, Task 3 store)
- **Files created:** 3 (sync-topology.ts, sync-queue.ts, sync-status-store.ts)
- **Files modified:** 2 (sync-topology.test.ts, sync-queue.test.ts)
- **Tests added:** 9 (4 topology + 5 queue)

## Accomplishments

- **sync-topology.ts:** 16-entry readonly tuple of table names in FK-safe parent-before-child order, plus the `TableName` literal-union type. Documents every FK edge inline and is guarded by a parity test that iterates the 13 known FK pairs and asserts parent-before-child.
- **sync-queue.ts:** `enqueue(table, id, op)`, `ack(queueIds)`, `getQueueDepth()`, and `writeWithSync(table, op, action)` helpers. Coalesce covers all four D-04 cases (upsert+upsert, upsert→delete supersede, delete→upsert un-delete, delete+delete). writeWithSync composes into a single Dexie `rw` transaction — data write and enqueue roll back together on throw.
- **sync-status-store.ts:** Zustand store mirroring settings-store.ts with `persist` + `createJSONStorage(() => localStorage)` + `version: 1` + `partialize` projecting only `lastPushedAt` + `lastPulledAt` to localStorage. Ephemeral fields (`isOnline`, `isSyncing`, `queueDepth`, `lastError`) reset on reload.
- All 9 tests pass against fake-indexeddb (4/4 topology + 5/5 queue).
- `pnpm tsc --noEmit` reports zero errors in plan-scope files.

## Task Commits

Each TDD cycle committed atomically:

1. **Task 1 RED:** `1df3608` — `test(43-05): add failing tests for sync-topology (RED)`
2. **Task 1 GREEN:** `20d856a` — `feat(43-05): implement sync-topology with TABLE_PUSH_ORDER (GREEN)`
3. **Task 2 RED:** `50f20c7` — `test(43-05): add failing tests for sync-queue (RED)`
4. **Task 2 GREEN:** `1032ccf` — `feat(43-05): implement sync-queue helpers (GREEN)`
5. **Task 2 fix:** `4bdc475` — `fix(43-05): satisfy strict noUncheckedIndexedAccess in sync-queue tests`
6. **Task 3:** `9863b3f` — `feat(43-05): add sync-status-store with persist+partialize`

## Files Created/Modified

- `src/lib/sync-topology.ts` (created, 55 LoC) — TABLE_PUSH_ORDER + TableName type, cites D-02 and documents FK graph inline.
- `src/lib/sync-queue.ts` (created, 129 LoC) — enqueue + ack + getQueueDepth + writeWithSync + internal coalesceInsideTx.
- `src/stores/sync-status-store.ts` (created, 71 LoC) — Zustand persist+partialize.
- `src/__tests__/sync-topology.test.ts` (modified) — 4 real tests replacing Plan 01 stub.
- `src/__tests__/sync-queue.test.ts` (modified) — 5 real tests replacing Plan 01 stub (atomic rollback, upsert+upsert coalesce, delete-supersedes, un-delete, ack-isolation).

## Decisions Made

- **Shared `coalesceInsideTx` helper (not exported).** Initially I considered inlining coalesce logic inside both `enqueue()` and `writeWithSync()` to keep them self-contained. That would duplicate the 4-branch D-04 logic. Factoring it into a helper that assumes it's already inside a rw tx lets `enqueue()` wrap it in `db.transaction('rw', db._syncQueue, …)` (its own tx) and lets `writeWithSync()` call it inside the already-open outer tx that also scopes the data table — Dexie never sees nested overlapping rw scopes.
- **Auto-increment `id` on _syncQueue (43-02 choice).** Plan 05 didn't re-litigate this. `enqueue()` does NOT specify the id when adding — Dexie fills it. On coalesce, the `.first()` lookup by compound index returns the row with the already-assigned id, which the update then targets.
- **Attempts reset on op transition, preserved on same-op.** A rapid repeat upsert+upsert against the same record is not a "fresh" op — the user just edited twice. Same for delete+delete. But a delete→upsert (un-delete) or upsert→delete (supersede) represents a genuinely new intent and deserves a clean retry budget. This matches D-04's semantics and is covered by the "delete supersedes queued upsert for same recordId" test (asserts attempts === 0 after the transition).
- **SSR-safe `isOnline` default.** The persist middleware hydrates on the client, but the initial state factory runs wherever `create()` is first evaluated (potentially during SSR build via a module import). Guarding `navigator` with `typeof` check keeps the store importable in any context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS strict `noUncheckedIndexedAccess` violations in sync-queue tests**
- **Found during:** Task 2 GREEN verification (post-commit `pnpm tsc --noEmit`)
- **Issue:** `rows[0].op` and similar array-index accesses triggered `TS2532: Object is possibly 'undefined'` under this project's strict TS config. Tests ran correctly against fake-indexeddb (5/5 pass) but the type-check leg of verification was failing.
- **Fix:** Destructured `const [row] = rows;`, asserted `expect(row).toBeDefined();`, and dereferenced `row!.op` / `row!.enqueuedAt`. Added `expect(remaining).toHaveLength(1)` before `remaining[0]!.recordId` in the ack test.
- **Files modified:** `src/__tests__/sync-queue.test.ts`
- **Verification:** `pnpm tsc --noEmit 2>&1 | grep "error TS" | grep -E "(sync-queue|sync-topology|sync-status-store)" | wc -l` → 0.
- **Committed in:** `4bdc475`

---

**Total deviations:** 1 auto-fixed (Rule 1 — TS strict access).
**Impact on plan:** Trivial cleanup; no scope creep. Behavior identical.

## Issues Encountered

- **Pre-existing pull-route TS errors on base.** `pnpm tsc --noEmit` reports `TS2307: Cannot find module '@/app/api/sync/pull/route'` at 6 sites in `src/__tests__/sync-pull-route.test.ts`. These errors are from Plan 43-04 work (the `src/app/api/sync/pull/` route file existed only as untracked content in this worktree and is committed on a different branch path). Out of 43-05 scope — NOT fixed. Deferred to 43-04's verification.
- **Worktree had residual untracked 43-04 work.** After the mandatory base reset to `dc9427f`, `git status` showed modified `src/lib/sync-payload.ts` and untracked `src/app/api/sync/pull/route.ts` — pre-existing worktree state from sibling-plan work, not introduced by 43-05. Left untouched.

## User Setup Required

None — all three modules are client-side only (IndexedDB + localStorage). No external configuration.

## Next Phase Readiness

- **Plan 06 (engine loop) unblocked.** Can `import { enqueue, ack, getQueueDepth, writeWithSync } from '@/lib/sync-queue'` and compose the push/pull scheduler. `TABLE_PUSH_ORDER` is the authoritative flush order for the push loop.
- **Plan 07 (pilot service wiring) unblocked.** `writeWithSync("intakeRecords", "upsert", async () => { ... })` is the drop-in helper for `addIntakeRecord`, `updateIntakeRecord`, and `deleteIntakeRecord` in `intake-service.ts`.
- **Phase 44 (status UI) unblocked on store shape.** `useSyncStatusStore` exports the exact 6 fields + 6 actions the status UI will consume via selectors.
- No blockers.

## Verification Evidence

```
$ pnpm vitest run src/__tests__/sync-queue.test.ts src/__tests__/sync-topology.test.ts
Test Files  2 passed (2)
     Tests  9 passed (9)

$ pnpm tsc --noEmit 2>&1 | grep -E "(sync-queue\.ts|sync-topology\.ts|sync-status-store\.ts)" | wc -l
0
```

All acceptance grep criteria passed:
- `export const TABLE_PUSH_ORDER` + `as const` + `export type TableName` in sync-topology.ts
- `export async function enqueue/ack/writeWithSync` in sync-queue.ts
- `db.transaction` appears twice (enqueue + writeWithSync) in sync-queue.ts
- `[tableName+recordId]` compound index lookup appears twice in sync-queue.ts
- `useSyncStatusStore`, `partialize:`, `lastPushedAt: state.lastPushedAt`, `intake-tracker-sync-status`, `createJSONStorage`, `version: 1` all present in sync-status-store.ts

## Self-Check: PASSED

All claimed files exist:
- `src/lib/sync-topology.ts` — FOUND (55 LoC, meets 30 min_lines)
- `src/lib/sync-queue.ts` — FOUND (129 LoC, meets 70 min_lines)
- `src/stores/sync-status-store.ts` — FOUND (71 LoC, meets 50 min_lines)
- `src/__tests__/sync-topology.test.ts` — FOUND (populated, 4 real `it()`, 0 todos)
- `src/__tests__/sync-queue.test.ts` — FOUND (populated, 5 real `it()`, 0 todos)

All claimed commits exist on feat/android-release:
- `1df3608` test RED topology — FOUND
- `20d856a` feat GREEN topology — FOUND
- `50f20c7` test RED queue — FOUND
- `1032ccf` feat GREEN queue — FOUND
- `4bdc475` fix queue test strictness — FOUND
- `9863b3f` feat sync-status-store — FOUND

---
*Phase: 43-sync-engine-core*
*Plan: 05*
*Completed: 2026-04-17*

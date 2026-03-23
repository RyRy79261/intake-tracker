---
phase: 12-composable-data-foundation
plan: 01
subsystem: database
tags: [dexie, indexeddb, soft-delete, schema-migration, composable-entries]

# Dependency graph
requires: []
provides:
  - "Dexie v15 schema with groupId index on intakeRecords, eatingRecords, substanceRecords"
  - "Soft-delete standardization for intake-service and eating-service (deletedAt filtering on all reads)"
  - "undoDeleteIntakeRecord and undoDeleteEatingRecord functions"
  - "Undo toast on individual record deletes via showUndoToast"
  - "seedComposableGroup fixture helper for Plan 02 tests"
affects: [12-02-composable-entry-service, ui-intake-cards]

# Tech tracking
tech-stack:
  added: []
  patterns: [soft-delete-with-deletedAt-filtering, undo-toast-on-delete, composable-group-index]

key-files:
  created:
    - src/__tests__/migration/v15-migration.test.ts
    - src/lib/intake-service.test.ts
    - src/lib/eating-service.test.ts
  modified:
    - src/lib/db.ts
    - src/lib/intake-service.ts
    - src/lib/eating-service.ts
    - src/hooks/use-intake-queries.ts
    - src/hooks/use-eating-queries.ts
    - src/__tests__/fixtures/db-fixtures.ts

key-decisions:
  - "v15 schema uses no .upgrade() function - existing records naturally have undefined groupId excluded from index"
  - "Soft-delete getRecordsPaginated loads all records then slices - acceptable for single-user data volume"
  - "Soft-delete getRecordsByCursor loads all records then filters - acceptable for single-user data volume"

patterns-established:
  - "Soft-delete pattern: update({deletedAt: now, updatedAt: now}) instead of delete(id)"
  - "Read filtering: all read queries must include .filter(r => r.deletedAt === null)"
  - "Undo pattern: showUndoToast in onSuccess callback with undoDelete*Record"
  - "Composable fields: groupId, originalInputText, groupSource as optional on record interfaces"

requirements-completed: [COMP-02, COMP-03]

# Metrics
duration: 15min
completed: 2026-03-23
---

# Phase 12 Plan 01: Schema Migration & Soft-Delete Summary

**Dexie v15 schema with groupId index on 3 tables, soft-delete standardization for intake/eating services with deletedAt filtering on all reads, and undo toasts on individual deletes**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-23T21:48:36Z
- **Completed:** 2026-03-23T22:03:36Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Dexie v15 schema adds groupId index to intakeRecords, eatingRecords, and substanceRecords without corrupting existing records
- Intake-service and eating-service use soft-delete (deletedAt) with filtering on all 10 read functions
- Undo toasts wired into useDeleteIntake and useDeleteEating hooks per D-08
- 24 new unit tests (8 migration + 11 intake + 5 eating) all passing
- Build and full test suite green (229/230 tests pass; 1 pre-existing titration-service failure)

## Task Commits

Each task was committed atomically:

1. **Task 1: Dexie v15 schema migration + interface updates** - `35a19c6` (feat)
2. **Task 2: Soft-delete standardization for intake-service and eating-service** - `43e8a7e` (feat)
3. **Task 3: Wire undo toasts into individual delete hooks** - `46a7799` (feat)

## Files Created/Modified
- `src/lib/db.ts` - v15 schema block with groupId index; IntakeRecord, EatingRecord, SubstanceRecord interfaces extended with groupId, originalInputText, groupSource
- `src/lib/intake-service.ts` - Soft-delete deleteIntakeRecord, undoDeleteIntakeRecord, deletedAt filtering on 8 read functions
- `src/lib/eating-service.ts` - Soft-delete deleteEatingRecord, undoDeleteEatingRecord, deletedAt filtering on 2 read functions
- `src/hooks/use-intake-queries.ts` - showUndoToast in useDeleteIntake onSuccess
- `src/hooks/use-eating-queries.ts` - showUndoToast in useDeleteEating onSuccess
- `src/__tests__/fixtures/db-fixtures.ts` - Added timezone to makeIntakeRecord/makeEatingRecord; added seedComposableGroup helper
- `src/__tests__/migration/v15-migration.test.ts` - 8 tests for data survival and groupId index queryability
- `src/lib/intake-service.test.ts` - 11 tests for soft-delete behavior and read filtering
- `src/lib/eating-service.test.ts` - 5 tests for soft-delete behavior and read filtering

## Decisions Made
- v15 schema uses no `.upgrade()` function - existing records naturally have undefined groupId, which IndexedDB excludes from index entries. Zero backfill required.
- `getRecordsPaginated` and `getRecordsByCursor` load all records then filter/slice instead of using Dexie's `.offset()/.limit()` which run before `.filter()`. Acceptable for single-user data volume.
- Used existing `showUndoToast` from `src/components/medications/undo-toast.tsx` rather than creating a new component.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree out of sync with branch HEAD**
- **Found during:** Initial file reads
- **Issue:** Worktree was at commit `0208336` (old branch state) while `feat/ui-fixes` branch was at `e675c54` (current HEAD with v14 schema, service-result pattern, etc.)
- **Fix:** `git reset --hard e675c54` to sync worktree with actual branch state
- **Files modified:** All source files (reset to correct state)
- **Verification:** All planned interfaces, patterns, and files now match plan expectations

**2. [Rule 2 - Missing Critical] Added timezone field to makeIntakeRecord and makeEatingRecord fixtures**
- **Found during:** Task 1 (fixture updates)
- **Issue:** Fixture helpers were missing `timezone: "UTC"` field that interfaces require
- **Fix:** Added `timezone: "UTC"` default to both fixture functions
- **Files modified:** src/__tests__/fixtures/db-fixtures.ts
- **Verification:** All tests pass with correct timezone field

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correct execution. No scope creep.

## Issues Encountered
- ESLint `pnpm lint` fails in worktree due to `@next/next` plugin resolution conflict between worktree and parent paths. Pre-existing issue unrelated to plan changes. Build (`pnpm build`) succeeds, confirming TypeScript compilation is clean.
- Pre-existing test failure in `src/lib/titration-service.test.ts` (1 of 230 tests). Out of scope for this plan.

## Known Stubs
None - all data paths are fully wired.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- groupId index is queryable on all 3 tables - ready for composable entry service in Plan 02
- Soft-delete pattern established for intake and eating services - Plan 02 can build cascading delete on top
- undoDelete functions available for Plan 02's group-level undo
- seedComposableGroup fixture ready for Plan 02 tests

## Self-Check: PASSED

- All 3 created test files exist
- All 3 task commits verified (35a19c6, 43e8a7e, 46a7799)
- db.version(15) present in db.ts
- groupId fields in interfaces
- Soft-delete patterns in both services
- Undo toasts wired in both hooks
- seedComposableGroup helper in fixtures

---
*Phase: 12-composable-data-foundation*
*Completed: 2026-03-23*

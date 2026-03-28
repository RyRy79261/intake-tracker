---
phase: 21-data-integrity-gates
plan: 01
subsystem: testing
tags: [vitest, dexie, schema-validation, static-analysis, integrity-tests]

# Dependency graph
requires:
  - phase: 20-core-ci-pipeline
    provides: vitest test infrastructure and CI pipeline
provides:
  - Static schema parser for db.ts (parseDbSchema, getLatestTables)
  - Schema consistency test catching missing tables across Dexie versions (DATA-04)
  - Three-way sync test enforcing db.ts/BackupData/fixtures alignment (DATA-07)
affects: [21-02-PLAN, future schema changes, future table additions]

# Tech tracking
tech-stack:
  added: []
  patterns: [static-file-parsing for integrity tests, actionable error messages with fix instructions]

key-files:
  created:
    - src/__tests__/integrity/parse-schema.ts
    - src/__tests__/integrity/schema-consistency.test.ts
    - src/__tests__/integrity/table-sync.test.ts
  modified: []

key-decisions:
  - "Static file reading via fs.readFileSync instead of importing db.ts (avoids Dexie initialization side effects)"
  - "Explicit TABLE_TO_FIXTURE mapping instead of derived naming (handles plural/singular inconsistencies safely)"
  - "Actionable error messages include file path and exact fix instructions per D-12/D-13 design decisions"

patterns-established:
  - "Integrity test pattern: static file parsing in src/__tests__/integrity/ for cross-file consistency checks"
  - "Error message format: x [Category]: description + Missing: what + Fix: how"

requirements-completed: [DATA-04, DATA-07]

# Metrics
duration: 3min
completed: 2026-03-28
---

# Phase 21 Plan 01: Data Integrity Gates Summary

**Static schema parser and two integrity test suites verifying Dexie version block consistency (DATA-04) and three-way db.ts/BackupData/fixtures sync (DATA-07)**

## Performance

- **Duration:** 3 min 25s
- **Started:** 2026-03-28T09:38:04Z
- **Completed:** 2026-03-28T09:41:29Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments
- Reusable static schema parser that extracts all 6 Dexie version blocks (v10-v15) and 16 tables from db.ts without importing Dexie
- Schema consistency test suite (4 tests) catching any version block missing tables from its predecessor, with actionable error messages
- Three-way sync test suite (4 tests) enforcing alignment between db.ts tables, BackupData interface keys, and fixture maker functions
- All 308 existing tests still pass -- zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create reusable static schema parser** - `4b01d03` (feat)
2. **Task 2: Create schema consistency test (DATA-04)** - `60b6def` (test)
3. **Task 3: Create three-way table sync test (DATA-07)** - `5a3ffa7` (test)

## Files Created/Modified
- `src/__tests__/integrity/parse-schema.ts` - Static schema parser: reads db.ts from disk, extracts version-to-table mappings via regex
- `src/__tests__/integrity/schema-consistency.test.ts` - 4 tests verifying parser correctness and version-to-version table consistency
- `src/__tests__/integrity/table-sync.test.ts` - 4 tests verifying three-way sync between db.ts, BackupData, and fixture makers

## Decisions Made
- Used `fs.readFileSync` with `__dirname`-relative path resolution instead of importing db.ts to avoid Dexie initialization side effects
- Used explicit TABLE_TO_FIXTURE mapping rather than deriving fixture names from table names, since naming is non-trivial (e.g., "doseLogs" -> "makeDoseLog", "prescriptions" -> "makePrescription")
- Used `expect.unreachable()` for per-item error reporting before the aggregate `toHaveLength(0)` assertion, giving developers specific actionable messages when sync breaks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Worktree was on an old branch (pre-v1.0) and needed fast-forward merge to feat/ui-fixes before execution could begin
- Vitest 4 uses `--bail` instead of `-x` flag -- adjusted verification commands accordingly

## Known Stubs

None -- all tests are fully functional with real file parsing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Integrity test infrastructure established in `src/__tests__/integrity/`
- Parser utility ready for reuse by Plan 02 (backup round-trip and migration tests)
- All 8 new integrity tests integrated into the existing 308-test suite

## Self-Check: PASSED

All 3 created files verified on disk. All 3 task commits verified in git log.

---
*Phase: 21-data-integrity-gates*
*Completed: 2026-03-28*

---
phase: 24-ci-optimization-benchmarking
plan: 01
subsystem: testing
tags: [vitest, benchmark, coverage, v8, fake-indexeddb, dexie, ci]

# Dependency graph
requires:
  - phase: 21-data-integrity-gates
    provides: "Migration tests, backup round-trip tests, and db-fixtures for seeding"
provides:
  - "Vitest bench files for migration chain and backup round-trip"
  - "Baseline benchmarks/results.json for CI regression comparison"
  - "Coverage json-summary reporter config for CI coverage action"
  - "bench and bench:ci scripts in package.json"
affects: [24-02-ci-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: ["vitest bench with fake-indexeddb/auto for DB benchmarks", "benchmark baseline JSON committed for CI comparison"]

key-files:
  created:
    - src/__tests__/bench/migration.bench.ts
    - src/__tests__/bench/backup.bench.ts
    - benchmarks/results.json
  modified:
    - vitest.config.ts
    - package.json

key-decisions:
  - "Bench files import fake-indexeddb/auto directly (vitest bench skips setupFiles)"
  - "Baseline JSON committed to repo for vitest bench --compare in CI"

patterns-established:
  - "Bench files must import fake-indexeddb/auto at top (not rely on setup.ts)"
  - "benchmarks/results.json is the committed baseline for CI perf regression detection"

requirements-completed: [BNCH-01, CIOP-02]

# Metrics
duration: 3min
completed: 2026-03-28
---

# Phase 24 Plan 01: Benchmarks & Coverage Config Summary

**Vitest bench files for Dexie migration chain and backup round-trip with committed JSON baselines and v8 coverage config for CI**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-28T20:10:53Z
- **Completed:** 2026-03-28T20:14:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added v8 coverage reporter with json-summary output for CI coverage action
- Created migration chain v10-v15 benchmark (measures db.open() upgrade path through fake-indexeddb)
- Created backup round-trip benchmark (measures export+import across all 16 tables)
- Generated and committed baseline benchmarks/results.json for future CI comparison
- Added bench and bench:ci scripts to package.json

## Task Commits

Each task was committed atomically:

1. **Task 1: Add coverage reporters to vitest config and bench scripts to package.json** - `103050a` (chore)
2. **Task 2: Create benchmark test files and generate baseline JSON** - `fa6a1fd` (feat)

## Files Created/Modified
- `vitest.config.ts` - Added coverage block with v8 provider, json-summary/json/text reporters, reportOnFailure
- `package.json` - Added bench and bench:ci scripts
- `src/__tests__/bench/migration.bench.ts` - Migration chain v10-v15 benchmark using fake-indexeddb
- `src/__tests__/bench/backup.bench.ts` - Backup export+import round-trip benchmark for all 16 tables
- `benchmarks/results.json` - Committed baseline benchmark results for CI comparison

## Decisions Made
- Bench files import fake-indexeddb/auto directly because vitest bench does not use test.setupFiles (Pitfall 7 from research)
- Baseline JSON committed to repo so CI can use vitest bench --compare for regression detection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all benchmarks ran successfully on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Benchmark files and baseline JSON ready for Plan 02 (CI workflow) to consume
- Coverage json-summary reporter configured for davelosert/vitest-coverage-report-action
- All 311 existing tests continue to pass unchanged

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.

---
*Phase: 24-ci-optimization-benchmarking*
*Completed: 2026-03-28*

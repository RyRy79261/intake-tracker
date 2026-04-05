---
phase: 24-ci-optimization-benchmarking
plan: 02
subsystem: infra
tags: [github-actions, ci, paths-filter, coverage, caching, benchmarking, dorny, vitest]

# Dependency graph
requires:
  - phase: 24-ci-optimization-benchmarking
    plan: 01
    provides: "Vitest coverage json-summary config, bench scripts, baseline benchmarks/results.json"
  - phase: 20-core-ci-pipeline
    provides: "Base CI workflow with 8 jobs + ci-pass gate"
  - phase: 21-data-integrity-gates
    provides: "data-integrity CI job (unconditional)"
  - phase: 23-supply-chain-hardening
    provides: "supply-chain CI job (unconditional)"
provides:
  - "Path-based job gating via dorny/paths-filter (src + bench categories)"
  - "Coverage delta PR comments via vitest-coverage-report-action with base-branch comparison"
  - "Next.js build caching via actions/cache@v4"
  - "Benchmark execution in CI gated on bench-relevant file changes"
  - "Skip-aware ci-pass gate accepting skipped gated jobs"
affects: []

# Tech tracking
tech-stack:
  added: ["dorny/paths-filter@v4", "davelosert/vitest-coverage-report-action@v2", "actions/cache@v4"]
  patterns: ["Path-filter as dedicated job with boolean outputs consumed via needs", "Dual-branch coverage comparison in single job (base then PR)", "Skip-aware CI gate accepting success OR skipped for gated jobs"]

key-files:
  created: []
  modified:
    - .github/workflows/ci.yml

key-decisions:
  - "Coverage job runs both base and PR branch coverage in a single job (sequential approach) rather than parallel artifact-based comparison"
  - "Benchmark CI step uses pnpm bench --run --compare (read-only) instead of bench:ci (which would overwrite baselines)"
  - "ci-pass gate splits checks: unconditional jobs require success, gated jobs accept success OR skipped"

patterns-established:
  - "dorny/paths-filter as standalone changes job with outputs consumed by downstream gated jobs"
  - "Dual-branch coverage: checkout base_ref, run coverage, save to coverage-base/, checkout PR, run coverage, compare via json-summary-compare-path"
  - "Skip-aware CI gate: unconditional jobs checked with != success, gated jobs iterated with success/skipped check"

requirements-completed: [CIOP-01, CIOP-02, CIOP-03, BNCH-01]

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 24 Plan 02: CI Workflow Optimization Summary

**CI workflow with path-based job gating, delta coverage PR comments, .next/cache caching, and benchmark execution across 12 jobs**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-28T20:20:22Z
- **Completed:** 2026-03-28T20:22:27Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added dorny/paths-filter changes job with src and bench filter categories for intelligent job gating
- Gated test-tz-sa, test-tz-de, and e2e jobs on src path changes so docs-only PRs skip expensive jobs
- Added .next/cache caching to build job with hashFiles-based cache key and restore-key fallback
- Added coverage job with dual-branch comparison (base then PR) producing delta-only PR comments
- Added benchmark job gated on bench-relevant file changes (db.ts, migration/integrity tests, backup-service)
- Updated ci-pass gate to accept success OR skipped for gated jobs while requiring success for unconditional jobs
- CI workflow now has 12 jobs: changes, lint, typecheck, test-tz-sa, test-tz-de, build, data-integrity, e2e, supply-chain, coverage, benchmark, ci-pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add changes job, build cache, coverage job, and benchmark job to ci.yml** - `deb3d2a` (feat)

## Files Created/Modified
- `.github/workflows/ci.yml` - Complete CI workflow with 12 jobs: path filtering, coverage reporting, build caching, benchmarking, and skip-aware gate

## Decisions Made
- Coverage job uses sequential single-job approach (checkout base, run coverage, save, checkout PR, run coverage, compare) rather than parallel artifact-based comparison -- simpler and the test suite runs fast (~15s)
- Benchmark CI step runs `pnpm bench --run --compare benchmarks/results.json` (read-only comparison) rather than `pnpm bench:ci` to avoid overwriting committed baselines
- ci-pass gate separates unconditional jobs (changes, lint, typecheck, build, data-integrity, supply-chain) requiring success from gated jobs (test-tz-sa, test-tz-de, e2e, coverage, benchmark) accepting success or skipped

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - the worktree was based on an older commit without ci.yml, so the file was created fresh with all existing jobs plus new additions, matching the current ci.yml from feat/ui-fixes as the baseline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CI workflow is complete with all 12 jobs ready for GitHub Actions execution
- Coverage reporting will activate automatically on PRs with src changes
- Benchmark comparison will run on PRs touching db.ts, migration tests, integrity tests, or backup-service
- Path filtering will skip expensive jobs on docs-only PRs
- All 34 acceptance criteria verified passing via automated Python validation

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.

---
*Phase: 24-ci-optimization-benchmarking*
*Completed: 2026-03-28*

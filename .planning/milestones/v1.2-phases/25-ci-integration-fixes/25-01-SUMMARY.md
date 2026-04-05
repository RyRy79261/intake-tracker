---
phase: 25-ci-integration-fixes
plan: 01
subsystem: infra
tags: [typescript, ci, github-actions, vitest, benchmarks]

# Dependency graph
requires:
  - phase: 24-ci-optimization
    provides: CI workflow with typecheck job, benchmark baselines, supply chain drift check
provides:
  - "Typecheck CI job passes with ES2020 target"
  - "Supply chain drift check verifies all 4 pnpm security settings"
  - "Clean benchmark baselines without worktree paths"
  - "Vitest bench exclude for .claude/** worktree directories"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ES2020 target for tsc --noEmit (minimum for regex s-flag and Set spread)"
    - "Vitest benchmark.exclude to prevent worktree bench file discovery"

key-files:
  created: []
  modified:
    - tsconfig.json
    - .github/workflows/ci.yml
    - benchmarks/results.json
    - vitest.config.ts

key-decisions:
  - "ES2020 target chosen as minimum needed for TS1501/TS2802 fixes (not ESNext) since it only affects tsc --noEmit"
  - "Added .claude/** to vitest exclude and benchmark.exclude to prevent worktree bench file discovery during regeneration"

patterns-established:
  - "Vitest bench exclusions: .claude/** must be excluded to avoid duplicate bench runs from worktrees"

requirements-completed: [CIPL-01, CIPL-03, BNCH-01, SCHN-04]

# Metrics
duration: 6min
completed: 2026-03-28
---

# Phase 25 Plan 01: CI Integration Fixes Summary

**ES2020 tsconfig target fixing 4 typecheck errors, complete 4-setting supply chain drift check, and clean benchmark baselines without worktree paths**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-28T22:28:14Z
- **Completed:** 2026-03-28T22:34:39Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Fixed typecheck CI job by adding `"target": "ES2020"` to tsconfig.json, resolving all 4 TypeScript errors (TS1501 regex s-flag, TS2802 Set spread)
- Completed supply chain drift check loop to verify all 4 pnpm security settings (added auditLevel as 4th setting)
- Regenerated benchmark baselines from main repo root with clean paths (no worktree references)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix typecheck target and supply chain drift check** - `4e6bbd2` (fix)
2. **Task 2: Regenerate benchmark baselines with clean paths** - `9abeac6` (fix)

## Files Created/Modified
- `tsconfig.json` - Added `"target": "ES2020"` as first entry in compilerOptions
- `.github/workflows/ci.yml` - Added `auditLevel` to supply chain drift check for-loop
- `benchmarks/results.json` - Regenerated with main repo paths (no worktree references)
- `vitest.config.ts` - Added `.claude/**` to test exclude and benchmark.exclude

## Decisions Made
- ES2020 chosen over ESNext as minimum target needed for the 4 specific TypeScript errors. Next.js uses SWC independently for transpilation; this only affects `tsc --noEmit`.
- Added `.claude/**` exclusion to vitest config to prevent worktree bench files from being picked up during benchmark generation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added .claude/** to vitest exclude and benchmark.exclude**
- **Found during:** Task 2 (Benchmark regeneration)
- **Issue:** Running `pnpm bench:ci` from main repo root still picked up `.bench.ts` files from `.claude/worktrees/` directories, producing worktree paths in results.json
- **Fix:** Added `.claude/**` to both `test.exclude` and `test.benchmark.exclude` in vitest.config.ts
- **Files modified:** vitest.config.ts
- **Verification:** Reran `pnpm bench:ci` - only 2 bench files found (main repo), 0 worktree references in output
- **Committed in:** 9abeac6 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix was necessary to complete benchmark regeneration without worktree paths. No scope creep.

## Issues Encountered
- Worktree-based execution required checking out files from feat/ui-fixes branch since the worktree was based on an older commit without ci.yml or benchmarks. This is normal parallel execution behavior.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all changes are complete and functional.

## Next Phase Readiness
- All 3 milestone audit defects (DEFECT-01, DEFECT-02, DEFECT-03) resolved
- CI pipeline should pass all jobs on clean PR
- No blockers for merging to main

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 25-ci-integration-fixes*
*Completed: 2026-03-28*

---
phase: 20-core-ci-pipeline
plan: 02
subsystem: infra
tags: [github-actions, ci, pnpm, node20, bundle-security, timezone-testing]

# Dependency graph
requires:
  - phase: 20-01
    provides: pnpm typecheck script, bundle-security.test.ts with Neon DB patterns, zero TS strict-mode errors
provides:
  - Complete CI pipeline workflow gating all PRs to main
  - 5 parallel check jobs (lint, typecheck, test-tz-sa, test-tz-de, build)
  - ci-pass gate job as single required status check
  - Bundle security scan integrated into build job
affects: [branch-protection-setup, future-ci-enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pnpm/action-setup@v5 reads packageManager from package.json (no version pin)"
    - "actions/setup-node@v4 cache: pnpm for store caching (no dual-caching)"
    - "ci-pass gate with if:always() and explicit per-job result checks (no wildcard)"

key-files:
  created:
    - .github/workflows/ci.yml
  modified: []

key-decisions:
  - "Node 20 instead of Node 18 (EOL since April 2025) for CI runners"
  - "Explicit per-job result checks in ci-pass gate instead of wildcard needs.*.result (avoids GitHub Actions runner bug #1540)"
  - "Single actions/setup-node cache only, no dual-caching with actions/cache or pnpm/action-setup cache"

patterns-established:
  - "CI gate pattern: if:always() + explicit result checks for each upstream job"
  - "pnpm CI setup: checkout -> pnpm/action-setup@v5 -> setup-node@v4 with cache -> frozen-lockfile install"

requirements-completed: [CIPL-01, CIPL-02, CIPL-03]

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 20 Plan 02: CI Workflow Summary

**GitHub Actions CI pipeline with 5 parallel jobs (lint, typecheck, dual-TZ tests, build+security) gated by ci-pass status check**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-28T08:37:30Z
- **Completed:** 2026-03-28T08:39:12Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- Created `.github/workflows/ci.yml` with 5 parallel check jobs plus ci-pass gate job
- All 5 jobs use Node 20, pnpm/action-setup@v5 (reads packageManager from package.json), and setup-node@v4 cache
- Build job runs production build followed by bundle security scan (sequential in same job)
- ci-pass gate uses `if: always()` with explicit per-job result checks, avoiding wildcard runner bug and skipped-job pitfall
- Implements all user decisions D-01 through D-08 from research phase

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CI workflow with parallel jobs and gate** - `7a207a0` (feat)

## Files Created/Modified
- `.github/workflows/ci.yml` - Complete CI pipeline: 5 parallel check jobs + ci-pass gate (87 lines)

## Decisions Made
- Used Node 20 instead of Node 18 (matching version-bump.yml would use EOL Node 18) -- Node 20 is active LTS
- Used explicit per-job result checks (`needs.lint.result`, `needs.typecheck.result`, etc.) instead of wildcard `needs.*.result` to avoid GitHub Actions runner bug #1540
- No `version:` input on pnpm/action-setup -- reads from package.json packageManager field automatically
- Single cache layer only (actions/setup-node cache: pnpm) to avoid dual-caching anti-pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Branch protection must be configured manually** in GitHub repo settings after the CI workflow is verified running on a PR:
- Require `ci-pass` status check to pass before merge
- Require branches to be up to date before merging
- Do not allow bypassing required checks (no admin bypass)
- No force pushes to main
- No branch deletions for main

## Known Stubs

None - the workflow file is complete with no placeholder code.

## Next Phase Readiness
- CI workflow ready to trigger on any PR to main
- Branch protection settings documented for manual configuration
- All CIPL requirements (01, 02, 03) satisfied by this workflow

## Self-Check: PASSED

---
*Phase: 20-core-ci-pipeline*
*Completed: 2026-03-28*

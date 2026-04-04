---
phase: 26-comprehensive-e2e-test-coverage
plan: 01
subsystem: testing
tags: [playwright, e2e, dashboard, blood-pressure, weight, urination, defecation]

requires:
  - phase: 22-playwright-e2e
    provides: "Initial Playwright setup, auth.setup.ts, original spec files"
provides:
  - "Route-mirrored spec file naming convention (auth, dashboard, medications)"
  - "Dashboard card test coverage for BP, weight, urination, defecation"
  - "7 total dashboard test cases covering all 6 card types"
affects: [26-02, 26-03]

tech-stack:
  added: []
  patterns: ["scrollIntoViewIfNeeded for below-fold cards", "exact toast assertions to avoid aria-live duplication", "section ID scoping for card-specific interactions"]

key-files:
  created: []
  modified:
    - e2e/auth.spec.ts
    - e2e/dashboard.spec.ts
    - e2e/medications.spec.ts

key-decisions:
  - "Renamed spec files via git mv to preserve history"
  - "Used scrollIntoViewIfNeeded for all 4 new tests since BP/weight/urination/defecation cards are below the fold"

patterns-established:
  - "Route-mirrored naming: spec files match app routes (dashboard.spec.ts for /, medications.spec.ts for /medications)"
  - "Section ID scoping: use #section-{name} to scope interactions to specific dashboard cards"

requirements-completed: [D-01, D-02, D-05, D-06, D-13]

duration: 2min
completed: 2026-04-03
---

# Phase 26 Plan 01: Route-Mirrored Spec Renames + Dashboard Card Coverage Summary

**Renamed 3 spec files to mirror app routes and added 4 new dashboard card tests for BP, weight, urination, and defecation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-03T09:21:38Z
- **Completed:** 2026-04-03T09:23:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Renamed auth-bypass.spec.ts, intake-logs.spec.ts, medication-wizard.spec.ts to route-mirrored names (auth, dashboard, medications)
- Updated test.describe block names to match new file semantics
- Added 4 new dashboard tests: blood pressure recording, weight recording, urination quick-log, defecation quick-log
- Dashboard spec now covers all 6 card types with 7 total test cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename spec files to mirror app routes** - `c988f13` (refactor)
2. **Task 2: Add dashboard card tests for BP, weight, urination, defecation** - `023362a` (test)

## Files Created/Modified
- `e2e/auth.spec.ts` - Renamed from auth-bypass.spec.ts (content unchanged)
- `e2e/dashboard.spec.ts` - Renamed from intake-logs.spec.ts, describe block updated to "Dashboard", 4 new test cases added
- `e2e/medications.spec.ts` - Renamed from medication-wizard.spec.ts, describe block updated to "Medications"

## Decisions Made
- Renamed files via git mv to preserve git history across the rename
- Used scrollIntoViewIfNeeded() for all 4 new card tests since BP, weight, urination, and defecation cards are below the fold on the dashboard
- Used exact: true on all toast assertions to avoid aria-live region double-match (per research Pitfall 2)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Route-mirrored file naming convention established for Plans 02 and 03 to follow
- Dashboard spec ready for Plan 02 to add history.spec.ts and settings.spec.ts
- auth.setup.ts intentionally NOT renamed (per D-04) and remains as the Playwright setup project

## Self-Check: PASSED

All files exist, all commits verified, all old filenames confirmed removed.

---
*Phase: 26-comprehensive-e2e-test-coverage*
*Completed: 2026-04-03*

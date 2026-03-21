---
phase: 09-data-integrity-and-backup
plan: 02
subsystem: ui
tags: [drawer, conflict-resolution, backup, import, react]

requires:
  - phase: 09-data-integrity-and-backup-01
    provides: backup-service with conflict detection, ImportResult, ConflictRecord, resolveConflicts
provides:
  - ConflictReviewDrawer component with per-row and batch conflict resolution
  - Import confirmation dialog before restore
  - Import result summary with new/skipped/conflict counts
  - useResolveConflicts hook
affects: []

tech-stack:
  added: []
  patterns:
    - "Pending file pattern: store file in state, show confirmation, then proceed"
    - "Conflict review with batch and per-row resolution using Map<string, boolean>"

key-files:
  created:
    - src/components/settings/conflict-review-drawer.tsx
  modified:
    - src/hooks/use-backup-queries.ts
    - src/components/settings/data-management-section.tsx

key-decisions:
  - "ConflictRecord imported from hooks layer (re-exported), not directly from backup-service (ESLint no-restricted-imports rule)"
  - "Default conflict decision is Keep (current data) for all conflicts"

patterns-established:
  - "Conflict review drawer: batch + per-row toggle pattern for merge conflict resolution"

requirements-completed: [DATA-02]

duration: 3min
completed: 2026-03-21
---

# Phase 09 Plan 02: Conflict Review UI Summary

**ConflictReviewDrawer with per-row and batch resolution, import confirmation dialog, and import result summary**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T14:06:14Z
- **Completed:** 2026-03-21T14:09:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created ConflictReviewDrawer with per-row Keep/Use Backup toggles and batch resolution buttons
- Added import confirmation dialog warning users about merge behavior before proceeding
- Updated import summary to show all 16 table counts and conflict count
- Added useResolveConflicts hook wrapping the resolveConflicts service function

## Task Commits

Each task was committed atomically:

1. **Task 1: Update backup hooks and create conflict review Drawer** - `f3129ce` (feat)
2. **Task 2: Update data management section with confirmation and conflict flow** - `e751412` (feat)

## Files Created/Modified
- `src/components/settings/conflict-review-drawer.tsx` - ConflictReviewDrawer component with batch/per-row resolution
- `src/hooks/use-backup-queries.ts` - Added useResolveConflicts hook, updated upload toast with all counts, re-exported ConflictRecord
- `src/components/settings/data-management-section.tsx` - Import confirmation, result summary, conflict drawer integration

## Decisions Made
- ConflictRecord type re-exported from hooks layer to comply with ESLint no-restricted-imports rule (components cannot import services directly)
- Default conflict resolution is "Keep" (current data) -- user must explicitly choose "Use Backup"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed ESLint no-restricted-imports for ConflictRecord**
- **Found during:** Task 1
- **Issue:** Plan specified importing ConflictRecord from backup-service in the drawer component, but ESLint rule blocks direct service imports from components
- **Fix:** Re-exported ConflictRecord from use-backup-queries.ts and imported from there in the drawer
- **Files modified:** src/hooks/use-backup-queries.ts, src/components/settings/conflict-review-drawer.tsx
- **Verification:** pnpm lint passes
- **Committed in:** f3129ce (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Import path change only, no functional difference.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data integrity and backup phase complete (both plans finished)
- Import/export with conflict detection and resolution fully functional
- Ready for next phase

---
*Phase: 09-data-integrity-and-backup*
*Completed: 2026-03-21*

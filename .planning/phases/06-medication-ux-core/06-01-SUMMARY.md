---
phase: 06-medication-ux-core
plan: 01
subsystem: ui
tags: [react, medications, compound-list, fractions, haptic, shadcn]

requires:
  - phase: 03-service-layer-rebuild
    provides: medication service hooks (usePrescriptions, useInventoryForPrescription, usePhasesForPrescription, useDailyDoseSchedule)
provides:
  - 3-tab medication page layout (schedule, medications, settings)
  - Compound-first medication list with CompoundCard
  - Shared utility module (formatPillCount, hapticTake, hapticSkip, computeProgress)
  - Empty schedule component with cat icon
  - Badge UI component
affects: [06-02, 06-03, 06-04, 06-05]

tech-stack:
  added: [shadcn-badge]
  patterns: [compound-first-display, unicode-fractions, haptic-feedback]

key-files:
  created:
    - src/lib/medication-ui-utils.ts
    - src/components/medications/compound-card.tsx
    - src/components/medications/compound-list.tsx
    - src/components/medications/empty-schedule.tsx
    - src/components/ui/badge.tsx
  modified:
    - src/components/medications/med-footer.tsx
    - src/app/medications/page.tsx

key-decisions:
  - "MedTab reduced from 5 to 3 values (schedule, medications, settings) - status and prescriptions tabs removed"
  - "CompoundCard uses useDailyDoseSchedule to derive next dose status per prescription"
  - "Stock displayed as pill count (formatPillCount for fractional, plain number for whole)"

patterns-established:
  - "Compound-first display: genericName as primary heading, brand as sub-label"
  - "formatPillCount for all fractional pill display across phase"
  - "hapticTake/hapticSkip for dose action feedback"

requirements-completed: [MEDX-01, MEDX-04, MEDX-05]

duration: 8min
completed: 2026-03-11
---

# Phase 6 Plan 01: Tab Restructure and Compound List Summary

**3-tab medication layout with compound-first list showing generic names, stock levels, dose status, and shared utility helpers for fractions and haptics**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-11T13:37:19Z
- **Completed:** 2026-03-11T13:45:37Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Restructured medications page from 5 tabs to 3 tabs (Schedule, Medications, Settings)
- Built compound-first medication list with CompoundCard showing generic name, dose, brand, stock, next dose status
- Created shared medication-ui-utils module with formatPillCount (Unicode fractions), haptic feedback, and progress computation
- Added empty schedule component with cat icon and optional add-medication CTA

## Task Commits

Each task was committed atomically:

1. **Task 1: Tab restructure + shared utilities** - `226836e` (feat)
2. **Task 2: Compound list and compound card** - `3241e3f` (feat)

## Files Created/Modified
- `src/lib/medication-ui-utils.ts` - formatPillCount, hapticTake, hapticSkip, computeProgress utilities
- `src/components/medications/compound-card.tsx` - Collapsed compound card with pill icon, dose info, stock badges
- `src/components/medications/compound-list.tsx` - Sorted compound list with empty state and FAB
- `src/components/medications/empty-schedule.tsx` - Cat icon empty state for schedule
- `src/components/ui/badge.tsx` - shadcn Badge component
- `src/components/medications/med-footer.tsx` - Reduced to 3 tabs
- `src/app/medications/page.tsx` - Removed old tab cases, wired CompoundList

## Decisions Made
- MedTab reduced from 5 to 3 values -- status and prescriptions tabs removed, their functionality consolidated into compound cards
- CompoundCard derives next dose status from useDailyDoseSchedule rather than separate queries
- Stock display uses formatPillCount for fractional amounts, plain number + "pills" for whole numbers
- Old component files (prescriptions-list, medications-list, status-view) preserved for Plan 02 cleanup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing shadcn Badge component**
- **Found during:** Task 2 (Compound card implementation)
- **Issue:** CompoundCard uses Badge for low/negative stock indicators but Badge component did not exist
- **Fix:** Installed shadcn Badge component via `npx shadcn@latest add badge`
- **Files modified:** src/components/ui/badge.tsx
- **Verification:** Build passes with Badge imported and used
- **Committed in:** 3241e3f (Task 2 commit)

**2. [Rule 1 - Bug] Fixed array access on possibly-undefined useLiveQuery result**
- **Found during:** Task 2 (Compound card implementation)
- **Issue:** `useDailyDoseSchedule` returns `DoseSlot[] | undefined`; direct `[0]` access caused TypeScript error
- **Fix:** Used optional chaining with intermediate variable for first element access
- **Files modified:** src/components/medications/compound-card.tsx
- **Verification:** TypeScript strict mode passes, build succeeds
- **Committed in:** 3241e3f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for build. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CompoundCard has local expand state wired but no expanded content yet -- Plan 02 will add expanded view
- Old tab components (StatusView, PrescriptionsList, MedicationsList) still exist for Plan 02 cleanup
- medication-ui-utils available for all subsequent Phase 6 plans

---
*Phase: 06-medication-ux-core*
*Completed: 2026-03-11*

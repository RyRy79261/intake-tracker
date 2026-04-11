---
phase: 40-settings-accordion-restructure
plan: 03
subsystem: ui
tags: [react, animation, storage-api, indexeddb, dexie]

requires:
  - phase: 40-01
    provides: accordion layout structure
  - phase: 40-02
    provides: decomposed CustomizationPanel sections
provides:
  - AnimationTimingSection standalone component (scroll speed, auto-hide delay, bar transition)
  - StorageInfoSection with IndexedDB usage estimate, record counts, "Local only" sync badge
  - useStorageInfo hook for navigator.storage.estimate() and Dexie record counts
  - Fully wired 6-group accordion with all sections populated
affects: [41-neon-auth, 42-sync-engine]

tech-stack:
  added: []
  patterns: [useStorageInfo hook wraps navigator.storage + Dexie counts to respect no-restricted-imports lint rule]

key-files:
  created:
    - src/components/settings/animation-timing-section.tsx
    - src/components/settings/storage-info-section.tsx
    - src/hooks/use-storage-info.ts
  modified:
    - src/components/settings/quick-nav-section.tsx
    - src/app/settings/page.tsx

key-decisions:
  - "Created useStorageInfo hook instead of importing db directly in component, respecting project lint rule (no-restricted-imports)"

patterns-established:
  - "Storage/database queries in components go through hooks in src/hooks/, never direct db imports"

requirements-completed: [SET-03, SET-04, SET-05]

duration: 12min
completed: 2026-04-12
---

# Plan 03: Animation Timing, Storage Info, and Final Wiring Summary

**AnimationTimingSection extracted from QuickNavSection, StorageInfoSection with IndexedDB usage and "Local only" badge, all 6 accordion groups fully populated**

## Performance

- **Duration:** 12 min
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Extracted animation timing controls (scroll speed, auto-hide delay, bar transition) from QuickNavSection into standalone AnimationTimingSection
- Created StorageInfoSection displaying estimated IndexedDB usage, storage quota, total record count, and "Local only" sync badge
- Created useStorageInfo hook to comply with no-restricted-imports lint rule
- Wired AnimationTimingSection into Customization group and StorageInfoSection into Data & Storage group

## Task Commits

1. **Task 1: Extract AnimationTimingSection** - `8174818` (feat)
2. **Task 2: Create StorageInfoSection + wire all** - included in `8174818`

## Files Created/Modified
- `src/components/settings/animation-timing-section.tsx` - Standalone animation timing controls
- `src/components/settings/storage-info-section.tsx` - Storage usage, record counts, sync badge
- `src/hooks/use-storage-info.ts` - Hook for navigator.storage.estimate() and Dexie record counts
- `src/components/settings/quick-nav-section.tsx` - Removed animation timing controls and unused imports
- `src/app/settings/page.tsx` - Added AnimationTimingSection and StorageInfoSection imports and rendering

## Decisions Made
- Created useStorageInfo hook rather than importing db directly in the component, to comply with existing no-restricted-imports ESLint rule

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule - Blocking] ESLint no-restricted-imports for @/lib/db**
- **Found during:** Task 2 (StorageInfoSection creation)
- **Issue:** Direct `import { db } from "@/lib/db"` in component violates project lint rule
- **Fix:** Created `src/hooks/use-storage-info.ts` hook encapsulating db queries, imported hook in component instead
- **Files modified:** src/hooks/use-storage-info.ts (new), src/components/settings/storage-info-section.tsx
- **Verification:** `pnpm lint` passes with no new errors
- **Committed in:** `8174818`

---

**Total deviations:** 1 auto-fixed (1 blocking lint rule)
**Impact on plan:** Architecture improvement -- hook pattern is cleaner and follows project conventions. No scope creep.

## Issues Encountered
None beyond the lint rule auto-fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 40 complete -- all 6 requirements (SET-01 through SET-06) delivered
- Settings page fully restructured with accordion groups
- Storage info section ready for cloud sync integration in Phase 42

---
*Phase: 40-settings-accordion-restructure*
*Completed: 2026-04-12*

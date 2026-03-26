---
phase: 17-timezone-aware-dose-logging
plan: 02
subsystem: medication
tags: [timezone, react-hook, alertdialog, visibilitychange, providers, shadcn-ui]

# Dependency graph
requires:
  - phase: 17-timezone-aware-dose-logging
    plan: 01
    provides: "clearTimezoneCache(), recalculateScheduleTimezones(), timezone_adjusted audit action"
provides:
  - "useTimezoneDetection hook with mount/resume detection and session dismissal"
  - "TimezoneChangeDialog AlertDialog component with Globe icon and loading state"
  - "TimezoneGuard provider wrapper wired into both Privy/non-Privy branches"
affects: [medication-schedules, push-notification-sync]

# Tech tracking
tech-stack:
  added: []
  patterns: ["visibilitychange listener for app-resume detection", "module-level session flag for dismiss-once-per-session"]

key-files:
  created:
    - src/hooks/use-timezone-detection.ts
    - src/hooks/use-timezone-detection.test.ts
    - src/components/medications/timezone-change-dialog.tsx
  modified:
    - src/app/providers.tsx

key-decisions:
  - "Module-level _dismissedThisSession flag resets on page reload (D-07) -- no localStorage needed"
  - "TimezoneGuard placed inside PinGateProvider so dialog only shows after auth/PIN"
  - "Detection reads db.phaseSchedules directly via Dexie (hooks ARE the service boundary)"
  - "formatTimezoneCityName co-located in both hook and dialog for simplicity"

patterns-established:
  - "App-resume detection: visibilitychange listener in useEffect with cleanup"
  - "Controlled AlertDialog pattern: open prop driven by hook state, no trigger element"

requirements-completed: [TMZN-01]

# Metrics
duration: 5min
completed: 2026-03-26
---

# Phase 17 Plan 02: Timezone UI Layer Summary

**Timezone change detection hook with visibilitychange listener, confirmation AlertDialog with Globe icon and wall-clock explanation, and TimezoneGuard wired into both provider branches -- backed by 7 unit tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-26T01:29:00Z
- **Completed:** 2026-03-26T01:34:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- useTimezoneDetection hook detects IANA timezone mismatches on app mount and visibilitychange (app resume from background)
- TimezoneChangeDialog shows travel context (old/new city names), wall-clock preservation info box, loading spinner during recalculation, and "Adjust Schedules" / "Not Now" actions
- TimezoneGuard wired into both Privy and non-Privy branches of providers.tsx, inside PinGateProvider
- 7 unit tests covering detection trigger, no-dialog-on-match, empty schedules, session dismissal, multi-schedule mismatch, and recalculation integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useTimezoneDetection hook, TimezoneChangeDialog component, and hook unit tests** - `6653cff` (feat)
2. **Task 2: Wire TimezoneGuard into providers.tsx** - `ff6bd51` (feat)

## Files Created/Modified
- `src/hooks/use-timezone-detection.ts` - Hook with mount/resume detection, session dismissal flag, confirm/dismiss handlers
- `src/hooks/use-timezone-detection.test.ts` - 7 vitest tests for detection logic and recalculation flow
- `src/components/medications/timezone-change-dialog.tsx` - Controlled AlertDialog with Globe icon, city names, wall-clock info, loading state
- `src/app/providers.tsx` - TimezoneGuard component added, wrapping children in both provider branches

## Decisions Made
- Module-level `_dismissedThisSession` flag chosen over localStorage per D-07 -- resets naturally on page reload/restart, no cleanup needed
- TimezoneGuard placed inside PinGateProvider (wrapping children) so timezone dialog only appears after user authenticates
- Hook reads `db.phaseSchedules` directly via Dexie import -- hooks ARE the service boundary layer (same pattern as use-medication-queries.ts)
- `formatTimezoneCityName` helper duplicated in both hook (for toast) and dialog (for display) to avoid cross-file coupling for a 1-line utility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing build failure in src/components/analytics/insights-tab.tsx (Property 'dismissInsight' does not exist on Settings) -- not caused by our changes, out of scope per deviation rules. Logged to deferred items.

## Known Stubs
None -- all functions are fully implemented with real logic.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete timezone-aware dose logging flow is now wired end-to-end: detection -> dialog -> recalculation -> toast feedback
- Push notification re-sync happens automatically via usePushScheduleSync hash-based debounce (no code changes needed)
- Phase 17 is fully complete

## Self-Check: PASSED

All created files verified present. All commit hashes found in git history.

---
*Phase: 17-timezone-aware-dose-logging*
*Completed: 2026-03-26*

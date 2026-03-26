---
phase: 17-timezone-aware-dose-logging
plan: 01
subsystem: medication
tags: [timezone, dexie, vitest, audit, schedule-recalculation]

# Dependency graph
requires:
  - phase: 11-testing
    provides: "PhaseSchedule interface with scheduleTimeUTC/anchorTimezone, timezone.ts utilities"
provides:
  - "clearTimezoneCache() for app-resume timezone detection"
  - "recalculateScheduleTimezones() for bulk schedule timezone conversion"
  - "timezone_adjusted AuditAction for audit trail"
affects: [17-02-PLAN, medication-schedule-service, dose-schedule-service]

# Tech tracking
tech-stack:
  added: []
  patterns: ["bulk schedule recalculation via Dexie transaction on phaseSchedules + auditLogs"]

key-files:
  created:
    - src/lib/timezone-recalculation-service.ts
    - src/lib/timezone-recalculation-service.test.ts
    - src/lib/timezone.test.ts
  modified:
    - src/lib/timezone.ts
    - src/lib/db.ts
    - src/lib/dose-schedule-service.test.ts

key-decisions:
  - "Wall-clock time preservation: recalculation converts UTC offset while keeping HH:MM identical"
  - "D-03 invariant enforced: recalculation never modifies doseLogs table"
  - "Audit log only written when at least one schedule is updated (no-op skips audit)"

patterns-established:
  - "Timezone recalculation pattern: read old UTC -> convert to local via old tz -> convert back to UTC via new tz"
  - "clearTimezoneCache() for SSR-safe cache invalidation on app resume"

requirements-completed: [TMZN-01]

# Metrics
duration: 7min
completed: 2026-03-26
---

# Phase 17 Plan 01: Timezone Service Layer Summary

**Timezone cache-busting with clearTimezoneCache(), bulk schedule recalculation preserving wall-clock dose times across SA/Germany travel, and timezone_adjusted audit action -- backed by 14 new tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-26T00:12:01Z
- **Completed:** 2026-03-26T00:19:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- clearTimezoneCache() exported from timezone.ts to reset cached IANA timezone on app resume
- recalculateScheduleTimezones() atomically converts all enabled PhaseSchedule records to preserve wall-clock dose times when user travels between timezones
- timezone_adjusted AuditAction added for complete audit trail of timezone adjustments
- 14 new tests: 3 for clearTimezoneCache, 10 for recalculation (including D-03 doseLogs invariant), 1 integration test with getDailyDoseSchedule

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend timezone.ts with clearTimezoneCache, add timezone_adjusted AuditAction, and write clearTimezoneCache tests** - `44dc80b` (feat)
2. **Task 2: Create timezone-recalculation-service with recalculateScheduleTimezones and comprehensive tests** - `81bdc5d` (feat)

_Note: TDD tasks committed test+implementation together after GREEN phase._

## Files Created/Modified
- `src/lib/timezone.ts` - Added clearTimezoneCache() export for cache invalidation
- `src/lib/timezone.test.ts` - 3 unit tests for clearTimezoneCache behavior
- `src/lib/db.ts` - Added "timezone_adjusted" to AuditAction union type
- `src/lib/timezone-recalculation-service.ts` - Bulk schedule recalculation function
- `src/lib/timezone-recalculation-service.test.ts` - 10 tests covering all recalculation behaviors
- `src/lib/dose-schedule-service.test.ts` - 1 integration test for recalculation + getDailyDoseSchedule

## Decisions Made
- Wall-clock time preservation approach: convert stored UTC minutes back to local HH:MM using old timezone, then re-convert to UTC minutes using new timezone
- D-03 invariant: recalculateScheduleTimezones explicitly only touches phaseSchedules and auditLogs tables -- doseLogs are verified untouched by test
- Audit log only written when updatedCount > 0 to avoid noise from no-op recalculations
- Test strategy for DST-variable timezones: assert wall-clock preservation using utcMinutesToLocalTime rather than hardcoded UTC values for Europe/Berlin

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test environment window mock for clearTimezoneCache**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** vitest runs in Node environment where typeof window === "undefined", causing getDeviceTimezone() to return "UTC" instead of reading Intl API
- **Fix:** Added globalThis.window shim in beforeEach/afterEach to allow Intl.DateTimeFormat mock to work
- **Files modified:** src/lib/timezone.test.ts
- **Verification:** All 3 clearTimezoneCache tests pass
- **Committed in:** 44dc80b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor test environment fix. No scope creep.

## Issues Encountered
- Pre-existing build failure in src/components/analytics/insights-tab.tsx (Property 'dismissInsight' does not exist) -- not caused by our changes, out of scope per deviation rules

## Known Stubs
None -- all functions are fully implemented with real logic.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- clearTimezoneCache() and recalculateScheduleTimezones() are ready for Plan 02 to wire into the detection hook and confirmation dialog
- Plan 02 will call clearTimezoneCache() on app resume and recalculateScheduleTimezones() when user confirms timezone adjustment

---
*Phase: 17-timezone-aware-dose-logging*
*Completed: 2026-03-26*

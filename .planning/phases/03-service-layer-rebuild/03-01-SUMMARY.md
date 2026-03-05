---
phase: 03-service-layer-rebuild
plan: 01
subsystem: database
tags: [dexie, timezone, migration, audit, indexeddb]

# Dependency graph
requires:
  - phase: 01-schema-foundation
    provides: "Dexie v10 consolidated schema with sync fields"
provides:
  - "Dexie v11 schema with timezone fields on all record types"
  - "PhaseSchedule scheduleTimeUTC (UTC minutes) and anchorTimezone fields"
  - "timezone.ts utility module for local/UTC time conversion"
  - "audit-service.ts with buildAuditEntry and writeAuditLog"
  - "syncFields() now includes timezone field"
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07]

# Tech tracking
tech-stack:
  added: []
  patterns: ["UTC minutes storage for schedule times", "IANA timezone on every record", "timezone backfill via date-based rules"]

key-files:
  created:
    - src/lib/timezone.ts
    - src/lib/audit-service.ts
  modified:
    - src/lib/db.ts
    - src/lib/utils.ts
    - src/lib/medication-service.ts
    - src/lib/audit.ts
    - src/hooks/use-daily-notes-queries.ts

key-decisions:
  - "UTC offset calculation uses locale-string diff trick (most reliable cross-browser without external libs)"
  - "Migration backfill uses hardcoded timezone rules (not device timezone) per plan spec"
  - "PhaseSchedule keeps deprecated time field for v10 DB record compatibility"

patterns-established:
  - "timezone.ts: getDeviceTimezone() cached with SSR fallback to UTC"
  - "audit-service.ts: buildAuditEntry for in-transaction use, writeAuditLog for standalone"
  - "syncFields() includes timezone -- all new records automatically get device timezone"

requirements-completed: [SRVC-02]

# Metrics
duration: 7min
completed: 2026-03-05
---

# Phase 3 Plan 1: Schema Foundation Summary

**Dexie v11 migration with timezone fields on all record types, UTC schedule time conversion, and audit service for transaction-safe logging**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-05T21:36:10Z
- **Completed:** 2026-03-05T21:43:20Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created timezone.ts with bidirectional local/UTC time conversion using Intl.DateTimeFormat
- Added Dexie v11 schema migration that backfills timezone on all record tables and converts PhaseSchedule time strings to UTC minutes
- Created audit-service.ts with buildAuditEntry (for in-transaction use) and writeAuditLog (standalone)
- Updated syncFields() to include timezone, ensuring all new records carry device timezone

## Task Commits

Each task was committed atomically:

1. **Task 1: Timezone utility module + syncFields update** - `6d14970` (feat)
2. **Task 2: Dexie v11 schema migration + audit service** - `98714c1` (feat)

## Files Created/Modified
- `src/lib/timezone.ts` - Timezone detection, local/UTC conversion, migration backfill helpers
- `src/lib/audit-service.ts` - Append-only audit log writer with buildAuditEntry and writeAuditLog
- `src/lib/db.ts` - Dexie v11 schema, timezone on all interfaces, new AuditAction values, upgrade migration
- `src/lib/utils.ts` - syncFields() includes timezone via getDeviceTimezone()
- `src/lib/medication-service.ts` - buildInventory, buildSchedules, buildTransaction include timezone/scheduleTimeUTC
- `src/lib/audit.ts` - Legacy audit logger updated with timezone field
- `src/hooks/use-daily-notes-queries.ts` - Uses syncFields() instead of manual field construction

## Decisions Made
- Used locale-string diff approach for UTC offset calculation (cross-browser reliable without external deps)
- PhaseSchedule keeps deprecated `time` field alongside new `scheduleTimeUTC` for backward compatibility with v10 DB records
- Migration uses hardcoded timezone rules (Africa/Johannesburg before 2026-02-12, Europe/Berlin after) per plan spec -- never relies on device timezone during migration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS errors in existing code after interface changes**
- **Found during:** Task 2
- **Issue:** Adding required timezone field to interfaces broke existing code in medication-service.ts, audit.ts, and use-daily-notes-queries.ts
- **Fix:** Added timezone to buildInventory, buildSchedules, buildTransaction; added scheduleTimeUTC/anchorTimezone to buildSchedules; updated audit.ts and use-daily-notes-queries.ts to include timezone
- **Files modified:** src/lib/medication-service.ts, src/lib/audit.ts, src/hooks/use-daily-notes-queries.ts
- **Verification:** pnpm build and pnpm lint both pass
- **Committed in:** 98714c1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary fix for type safety after interface changes. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All subsequent plans can import from timezone.ts and audit-service.ts
- v11 migration ready for production (timezone backfill + schedule time conversion)
- syncFields() automatically includes timezone for all new record creation

---
*Phase: 03-service-layer-rebuild*
*Completed: 2026-03-05*

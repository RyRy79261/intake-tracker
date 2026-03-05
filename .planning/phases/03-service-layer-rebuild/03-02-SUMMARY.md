---
phase: 03-service-layer-rebuild
plan: 02
subsystem: services
tags: [dexie, transactions, atomicity, audit-logging, fractional-math, medication]

# Dependency graph
requires:
  - phase: 03-service-layer-rebuild
    plan: 01
    provides: "v11 schema with timezone, audit-service buildAuditEntry, timezone utilities"
provides:
  - "Atomic dose operations (take/untake/skip/reschedule) with single-transaction safety"
  - "Fractional pill math (dosageMg / pillStrength) with 4-decimal rounding"
  - "Audit logging inside every medication mutation transaction"
  - "All medication read functions return T directly (no ServiceResult)"
  - "calculatePillsConsumed and isCleanFraction exported helpers"
affects: [03-03, 03-04, 03-05]

# Tech tracking
tech-stack:
  added: []
  patterns: ["inline stock math in transactions (no nested transactions)", "conditional spread for exactOptionalPropertyTypes", "individual transactions per dose in batch operations"]

key-files:
  created: []
  modified:
    - src/lib/dose-log-service.ts
    - src/lib/medication-service.ts
    - src/lib/medication-schedule-service.ts
    - src/hooks/use-medication-queries.ts
    - src/components/medications/dose-detail-dialog.tsx
    - src/components/medications/mark-all-modal.tsx
    - src/lib/medication-notification-service.ts

key-decisions:
  - "Stock math inlined into dose transactions to avoid nested transaction pitfall (Dexie Pitfall 4)"
  - "Negative stock allowed with no blocking per user decision"
  - "Individual transactions per dose in takeAll/skipAll (one failure does not block others)"
  - "Components pass dosageMg (mg) not pill count -- service handles pill math internally"

patterns-established:
  - "Atomic dose pattern: db.transaction('rw', [doseLogs, inventoryItems, inventoryTransactions, auditLogs], ...)"
  - "Read functions return T directly; mutations keep ServiceResult"
  - "buildAuditEntry called inside every mutation transaction"
  - "Odd fraction warning in audit details when pillsConsumed is not a clean fraction"

requirements-completed: [SRVC-01, SRVC-06]

# Metrics
duration: 14min
completed: 2026-03-05
---

# Phase 3 Plan 2: Medication Services Rebuild Summary

**Atomic dose transactions with fractional pill math, audit logging in every medication mutation, and read functions returning T directly**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-05T21:45:49Z
- **Completed:** 2026-03-05T21:59:37Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Rebuilt dose-log-service with single-transaction atomicity for take/untake/skip/reschedule (dose log + stock + audit in one transaction)
- Implemented fractional pill math: `dosageMg / pillStrength` with 4-decimal rounding via `calculatePillsConsumed()`
- Added audit logging inside every medication mutation transaction across all three service files
- Converted all medication read functions to return T directly (dropped ServiceResult wrappers)
- Replaced `.toArray().filter()` anti-patterns with `.where()` indexed queries in schedule and inventory lookups
- Removed `Math.max(0, ...)` stock clamp -- negative stock now allowed per user decision

## Task Commits

Each task was committed atomically:

1. **Task 1: Rebuild dose-log-service with atomic transactions and fractional math** - `0227038` (feat)
2. **Task 2: Rebuild medication-service and medication-schedule-service** - `0fecaed` (feat)

## Files Created/Modified
- `src/lib/dose-log-service.ts` - Complete rewrite with atomic transactions, fractional pill math, TakeDoseInput/etc. input types
- `src/lib/medication-service.ts` - Read functions return T directly, all mutations include audit logging, adjustStock allows negative
- `src/lib/medication-schedule-service.ts` - Read functions return T directly, mutations include audit logging, scheduleTimeUTC computed
- `src/hooks/use-medication-queries.ts` - Removed unwrap() from read hooks, updated dose mutation hooks to use input object types
- `src/components/medications/dose-detail-dialog.tsx` - Updated to pass dosageMg (mg) instead of pill count
- `src/components/medications/mark-all-modal.tsx` - Updated to pass dosageMg (mg) instead of pill count
- `src/lib/medication-notification-service.ts` - Updated for getSchedulesForPhase returning T directly

## Decisions Made
- Stock math inlined into dose transactions to avoid Dexie nested transaction pitfall (calling adjustStock from inside a transaction would nest transactions, which fails silently in some browsers)
- Components now pass `dosageMg` (the mg dose amount) to service functions, not pill count -- the service calculates pills consumed internally using inventory strength
- Individual transactions per dose in takeAll/skipAll batch operations -- one failure does not block others per user decision
- `isCleanFraction()` checks against common pill fraction values (0.25, 0.333, 0.5, 0.667, 0.75) with 0.01 tolerance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated components passing dosageAmount to use dosageMg**
- **Found during:** Task 1
- **Issue:** Components (dose-detail-dialog, mark-all-modal) were passing `dosageAmount: pillsToTake` (a pill count) but new API expects `dosageMg` (milligrams). The service now calculates pill count internally.
- **Fix:** Changed components to pass `dosageMg: schedule.dosage` (the mg amount from the schedule)
- **Files modified:** src/components/medications/dose-detail-dialog.tsx, src/components/medications/mark-all-modal.tsx
- **Verification:** pnpm build passes, TS check passes
- **Committed in:** 0227038

**2. [Rule 3 - Blocking] Updated medication-notification-service for new return type**
- **Found during:** Task 2
- **Issue:** `getSchedulesForPhase` no longer returns ServiceResult but the notification service was checking `.success` and `.data`
- **Fix:** Changed to try/catch pattern with direct return value
- **Files modified:** src/lib/medication-notification-service.ts
- **Verification:** pnpm build passes
- **Committed in:** 0fecaed

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary to maintain type safety after API signature changes. No scope creep.

## Issues Encountered
- Task 1 changes were partially captured in a pre-existing commit (0227038) from a previous execution attempt that combined dose-log-service changes with unrelated service refactoring. The dose-log-service rewrite was verified correct in that commit.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All medication services now have atomic transactions with audit logging
- Read functions return T directly across all three medication service files
- Plan 03-03 (non-medication services) and Plan 03-04 (daily schedule) can proceed
- `calculatePillsConsumed` and `isCleanFraction` are exported for reuse in future plans

---
*Phase: 03-service-layer-rebuild*
*Completed: 2026-03-05*

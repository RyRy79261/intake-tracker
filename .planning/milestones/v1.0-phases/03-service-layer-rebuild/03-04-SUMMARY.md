---
phase: 03-service-layer-rebuild
plan: 04
subsystem: medication-hooks
tags: [useLiveQuery, dose-schedule, derive-at-read, dexie-react-hooks]

# Dependency graph
requires:
  - phase: 03-service-layer-rebuild
    plan: 02
    provides: "Rebuilt medication/dose-log services with atomic transactions"
  - phase: 03-service-layer-rebuild
    plan: 03
    provides: "useLiveQuery pattern established for non-medication hooks"
provides:
  - "Derive-at-read dose schedule service (getDailyDoseSchedule)"
  - "DoseSlot type with status, local time, pill math, inventory warnings"
  - "All medication hooks use useLiveQuery for reads"
  - "All medication mutation hooks have zero invalidation"
  - "History hooks use useLiveQuery for reactive data"
affects:
  - "src/components/medications/* — updated for direct useLiveQuery return shape"
  - "src/app/history/page.tsx — uses reactive history data instead of manual fetch"
  - "src/components/history-drawer.tsx — same reactive data pattern"

# Tech stack
tech-stack:
  added: []
  patterns: [derive-at-read-schedule, useLiveQuery-medication-hooks]

# Key files
key-files:
  created:
    - src/lib/dose-schedule-service.ts
  modified:
    - src/hooks/use-medication-queries.ts
    - src/hooks/use-history-queries.ts
    - src/app/history/page.tsx
    - src/components/history-drawer.tsx
    - src/components/medications/prescriptions-list.tsx
    - src/components/medications/medications-list.tsx
    - src/components/medications/schedule-view.tsx
    - src/components/medications/status-view.tsx
    - src/components/medications/add-medication-wizard.tsx
    - src/components/medications/edit-medication-drawer.tsx
    - src/components/medications/inventory-item-view-drawer.tsx

# Decisions
decisions:
  - "useLiveQuery default values eliminate loading states for array-returning medication hooks"
  - "History hook returns reactive data object instead of async fetch callback"
  - "Rescheduled dose slots map to skipped status in DoseSlot derivation"
  - "Inventory warnings prioritize negative_stock over odd_fraction"

# Metrics
metrics:
  duration: "11 min"
  completed: "2026-03-05"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 12
---

# Phase 3 Plan 04: Dose Schedule Service and Medication Hook Migration Summary

Derive-at-read dose schedule service with useLiveQuery migration for all medication and history hooks, eliminating invalidation and pre-created pending records

## What Changed

### Task 1: Create Derive-at-Read Dose Schedule Service

Created `src/lib/dose-schedule-service.ts` with:
- `getDailyDoseSchedule(dateStr, timezone?)` -- reads from 5 tables (prescriptions, medicationPhases, phaseSchedules, doseLogs, inventoryItems) to derive DoseSlot[] at read time
- `DoseSlot` type with schedule info, status derivation, local time display, pill math, and inventory warnings
- Status derivation: existing log status takes priority, then pending for today, missed for past dates
- UTC-to-local time conversion using `formatLocalTime` from timezone.ts
- Fractional pill calculation reuses `calculatePillsConsumed` and `isCleanFraction` from dose-log-service
- Inventory warnings: `no_inventory`, `negative_stock`, `odd_fraction`
- `getDoseScheduleForDateRange` helper for calendar/history views

### Task 2: Migrate Medication and History Hooks to useLiveQuery

**use-medication-queries.ts -- complete rewrite:**
- Replaced all 10 `useQuery` read hooks with `useLiveQuery` (with `[]` default values)
- Added `useDailyDoseSchedule(dateStr)` wrapping the new service
- Removed `useInvalidateMeds()` helper entirely (was the central invalidation hub)
- Removed all `onSuccess: invalidate` callbacks from 19 mutation hooks
- Removed `useQueryClient` import
- Re-exported both `DoseLogWithDetails` (backward compat) and `DoseSlot` (new primary type)

**use-history-queries.ts -- reactive rewrite:**
- Replaced `loadAllRecords` async callback with `useLiveQuery` that returns reactive `HistoryDataResult`
- Hook now returns `{ data, deleteWeight, deleteBP }` instead of `{ loadAllRecords, deleteWeight, deleteBP }`
- Data automatically refreshes when any underlying table changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated 9 consumer components for useLiveQuery return shape**
- **Found during:** Task 2
- **Issue:** Components destructured `{ data, isLoading }` from hooks, but useLiveQuery returns `T` directly (with default value)
- **Fix:** Changed all consumers to use direct return value, removed loading state checks (default `[]` renders instantly)
- **Files modified:** prescriptions-list.tsx, medications-list.tsx, schedule-view.tsx, status-view.tsx, add-medication-wizard.tsx, edit-medication-drawer.tsx, inventory-item-view-drawer.tsx
- **Commit:** 6d00d02

**2. [Rule 3 - Blocking] Updated history page and drawer for reactive data API**
- **Found during:** Task 2
- **Issue:** History page/drawer called `fetchHistoryRecords(100)` as async function, but hook now returns reactive data
- **Fix:** Changed to useEffect that derives unified records from reactive `historyData`, pagination via `setPage` instead of re-fetching
- **Files modified:** src/app/history/page.tsx, src/components/history-drawer.tsx
- **Commit:** 6d00d02

## Commits

| Commit | Description |
|--------|-------------|
| 3fa3638 | feat(03-04): create derive-at-read dose schedule service |
| 6d00d02 | feat(03-04): migrate medication and history hooks to useLiveQuery |

## Verification

- `pnpm build` passes
- `pnpm lint` passes (0 warnings/errors)
- `grep -r "invalidateQueries" src/hooks/use-medication-queries.ts` returns no matches
- `grep -rw "useQuery" src/hooks/use-medication-queries.ts` returns no matches (only useLiveQuery and useMutation)
- `grep -r "generatePendingDoseLogs" src/` returns no matches
- dose-schedule-service.ts getDailyDoseSchedule correctly derives status from existing logs

## Self-Check: PASSED

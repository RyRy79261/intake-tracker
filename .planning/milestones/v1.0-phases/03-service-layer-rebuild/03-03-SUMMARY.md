---
phase: 03-service-layer-rebuild
plan: 03
subsystem: hooks
tags: [useLiveQuery, dexie-react-hooks, reactivity, service-layer]

# Dependency graph
requires:
  - phase: 03-service-layer-rebuild
    plan: 01
    provides: "syncFields() with timezone via getDeviceTimezone()"
provides:
  - "All non-medication service reads return T directly (no ServiceResult)"
  - "All non-medication hooks use useLiveQuery for reactive reads"
  - "No invalidation calls in non-medication mutation hooks"
  - "Graph data hook with useLiveQuery reactivity"
  - "Rolling 24h window timer via tick state dep pattern"
affects:
  - "src/components/* — consumer components updated for useLiveQuery return shape"
  - "src/hooks/use-history-queries.ts — removed unwrap from direct service read calls"

# Tech stack
tech-stack:
  added: [dexie-react-hooks]
  patterns: [useLiveQuery-for-reads, tick-state-timer, direct-return-services]

# Key files
key-files:
  created: []
  modified:
    - src/lib/intake-service.ts
    - src/lib/health-service.ts
    - src/lib/eating-service.ts
    - src/lib/urination-service.ts
    - src/lib/defecation-service.ts
    - src/lib/backup-service.ts
    - src/hooks/use-intake-queries.ts
    - src/hooks/use-health-queries.ts
    - src/hooks/use-eating-queries.ts
    - src/hooks/use-urination-queries.ts
    - src/hooks/use-defecation-queries.ts
    - src/hooks/use-daily-notes-queries.ts
    - src/hooks/use-graph-data.ts
    - src/hooks/use-history-queries.ts
    - src/components/historical-graph.tsx
    - src/components/weight-card.tsx
    - src/components/blood-pressure-card.tsx
    - src/components/eating-card.tsx
    - src/components/urination-card.tsx
    - src/components/defecation-card.tsx
    - src/components/intake-card.tsx
    - src/components/medications/daily-notes-drawer.tsx

# Decisions
decisions:
  - "useLiveQuery default values eliminate loading states for array-returning hooks (instant render with [])"
  - "graphKeys export removed entirely since no invalidation needed"
  - "Optimistic updates removed from weight/BP add mutations (useLiveQuery provides fast enough reactivity)"
  - "Error state handling removed from cards (useLiveQuery errors propagate to error boundaries)"

# Metrics
metrics:
  duration: "9 min"
  completed: "2026-03-05"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 22
---

# Phase 3 Plan 03: Non-Medication Service and Hook Migration Summary

useLiveQuery migration for all non-medication domains with service reads returning T directly and zero invalidation logic

## What Changed

### Task 1: Service Read Functions Return T Directly

Updated 6 service files to remove ServiceResult wrapper from all read functions:
- `intake-service.ts`: 8 read functions simplified (getRecordsInLast24Hours, getTotalInLast24Hours, getDailyTotal, getRecentRecords, getAllRecords, getRecordsPaginated, getRecordsByCursor, getRecordsByDateRange, exportAllData)
- `health-service.ts`: 6 read functions (getWeightRecords, getWeightRecordsByDateRange, getLatestWeightRecord, getBloodPressureRecords, getBloodPressureRecordsByDateRange, getLatestBloodPressureRecord, plus 2 paginated)
- `eating-service.ts`: 2 read functions
- `urination-service.ts`: 2 read functions
- `defecation-service.ts`: 2 read functions
- `backup-service.ts`: exportBackup returns Blob directly, getBackupStats returns stats object directly

All mutation functions (add, update, delete, import, clear) retain ServiceResult wrapper.

### Task 2: Hook Migration to useLiveQuery

Migrated 9 hook files from React Query useQuery to Dexie useLiveQuery:
- Replaced all `useQuery` read hooks with `useLiveQuery`
- Removed all `invalidateQueries` calls from mutation `onSuccess` handlers
- Removed all query key factories (intakeKeys, healthKeys, eatingKeys, urinationKeys, defecationKeys, dailyNotesKeys, graphKeys)
- Removed `useQueryClient` imports from all non-medication hooks
- Rolling 24h timer uses `useState` tick counter as `useLiveQuery` dependency (re-queries every 60s)
- `useIntake` combined hook simplified: removed `refresh` callback, derives `isLoading` from `undefined` check

Updated 7 consumer components to work with new return shape:
- Cards (weight, blood-pressure, eating, urination, defecation, intake) now use direct array return instead of `{ data, isLoading }`
- historical-graph.tsx uses `data === undefined` for loading state
- Removed error state rendering from weight-card and blood-pressure-card

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated use-history-queries.ts for direct service returns**
- **Found during:** Task 1
- **Issue:** use-history-queries.ts called service reads with unwrap() but services now return T directly
- **Fix:** Removed unwrap() calls from all read function calls, kept unwrap() for mutation calls (deleteWeight, deleteBP)
- **Files modified:** src/hooks/use-history-queries.ts
- **Commit:** 0227038

**2. [Rule 3 - Blocking] Updated 7 consumer components for useLiveQuery return shape**
- **Found during:** Task 2
- **Issue:** Components destructured `{ data, isLoading, error }` from hooks, but useLiveQuery returns T | undefined
- **Fix:** Changed all consumers to use direct return value, derive isLoading from falsy check
- **Files modified:** historical-graph.tsx, weight-card.tsx, blood-pressure-card.tsx, eating-card.tsx, urination-card.tsx, defecation-card.tsx, intake-card.tsx, daily-notes-drawer.tsx
- **Commit:** 505c913

**3. [Rule 3 - Blocking] Removed optimistic update logic from health hooks**
- **Found during:** Task 2
- **Issue:** useAddWeight and useAddBloodPressure had optimistic update logic using queryClient.setQueryData/cancelQueries, which is incompatible with useLiveQuery
- **Fix:** Removed onMutate/onError/onSettled handlers entirely; useLiveQuery auto-detects DB changes fast enough
- **Commit:** 505c913

## Commits

| Commit | Description |
|--------|-------------|
| 0227038 | feat(03-03): update non-medication service reads to return T directly |
| 505c913 | feat(03-03): migrate all non-medication hooks to useLiveQuery |

## Verification

- `pnpm build` passes
- `pnpm lint` passes (0 warnings/errors)
- `grep -r "invalidateQueries" src/hooks/` returns only medication-queries (expected)
- `grep -r "useQuery" src/hooks/ | grep -v useLiveQuery | grep -v useMutation` returns only medication-queries (expected)
- ServiceResult in service files only on mutation functions

## Self-Check: PASSED

# Plan 34-02 Summary: Merged History & Entry Display

**Status:** Complete
**Duration:** ~4 min

## What was built

Replaced two separate history lists (eating-only and salt-only) with a single merged chronological list in food-section.tsx. Food descriptions appear as primary entry labels (FOOD-02). Edit/delete correctly routes to the appropriate mutation via a discriminated union `kind` field on `MergedHistoryItem`.

## Key changes

- `src/components/food-salt/food-section.tsx`:
  - Added `MergedHistoryItem` interface with `kind: "eating" | "salt"` discriminator
  - Added salt data hooks: `useRecentIntakeRecords("salt")`, `useDeleteIntake()`, `useUpdateIntake()`
  - Added salt edit state and handlers (`openSaltEdit`, `closeSaltEdit`, `handleSaltEditSubmit`, `handleSaltDelete`)
  - Computed `mergedHistory` via `useMemo` combining eating + salt records sorted by timestamp
  - Replaced eating-only `RecentEntriesList` with merged version using discriminated routing
  - Added `EditIntakeDialog` for salt record editing

## Self-Check: PASSED

- [x] Single merged history list with both eating and salt records
- [x] Eating descriptions used as primary labels
- [x] Salt amounts shown as "Xmg Na"
- [x] Edit routes correctly: eating -> EditEatingDialog, salt -> EditIntakeDialog
- [x] Delete routes correctly: eating -> useDeleteEating, salt -> useDeleteIntake
- [x] `pnpm build` passes

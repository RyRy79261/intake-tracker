# Plan 38-01 Summary

**Phase:** 38-weight-input-default-value-bug
**Plan:** 01
**Status:** Complete
**Duration:** ~3 min

## What Was Built

Fixed the weight input defaulting to 70 instead of the user's last recorded value. The root cause was a race condition between `useLiveQuery`'s synchronous `[]` default and a 200ms `setTimeout` fallback in the weight card's `useEffect`.

## Changes

### Task 1: Add shadcn Skeleton component
- Created `src/components/ui/skeleton.tsx` — standard shadcn animated placeholder div
- Already committed as part of phase 35 execution (concurrent work)

### Task 2: Change useWeightRecords default
- Removed the third argument (`[]`) from `useLiveQuery` in `useWeightRecords`
- Return type changed from `WeightRecord[]` to `WeightRecord[] | undefined`
- Enables distinguishing "loading" (`undefined`) from "no records" (`[]`)

### Task 3: Fix weight-card.tsx
- Changed `isLoading` from buggy `!recentRecords || recentRecords.length === 0 && pendingWeight === null` to `recentRecords === undefined`
- Removed `setTimeout` / `clearTimeout` race condition entirely
- Added Skeleton placeholders for input area during loading (matching button and input dimensions)
- Changed first-time user default from 70 to 69 kg
- Preserved existing `pendingWeight` on record deletion (D-14)

## Key Files

<key-files>
created:
  - src/components/ui/skeleton.tsx
modified:
  - src/hooks/use-health-queries.ts
  - src/components/weight-card.tsx
</key-files>

## Decisions Made

- Used `recentRecords === undefined` as the sole loading signal (simpler than a separate flag)
- Skeleton dimensions match the actual button (h-14 w-14 rounded-full) and input (h-10 w-32) sizes
- Comment in useEffect references CONTEXT.md decision IDs (D-03, D-04, D-12, D-14) for traceability

## Self-Check

- [x] No `setTimeout` in weight-card.tsx
- [x] No `clearTimeout` in weight-card.tsx
- [x] `isLoading = recentRecords === undefined` present
- [x] `setPendingWeight(69)` as first-time fallback
- [x] Skeleton import and 4 Skeleton elements in JSX
- [x] `pnpm build` passes
- [x] All 393 tests pass

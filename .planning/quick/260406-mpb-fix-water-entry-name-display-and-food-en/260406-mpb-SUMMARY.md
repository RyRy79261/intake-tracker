---
phase: quick
plan: 260406-mpb
subsystem: food-intake-display
tags: [display, water-label, sodium, food-section, recent-entries]
dependency_graph:
  requires: []
  provides: [food-name-on-water-entries, sodium-in-food-recent-entries]
  affects: [water-tab-display, food-section-display, history-record-display]
tech_stack:
  added: []
  patterns: [useLiveQuery-for-cross-table-lookup, conditional-spread-for-exactOptionalPropertyTypes]
key_files:
  created: []
  modified:
    - src/components/food-salt/food-section.tsx
    - src/lib/utils.ts
decisions:
  - Used options?.note for food:* source display instead of parsing source sub-string (cleaner, leverages existing note field)
  - Used useLiveQuery with groupId join for sodium lookup (reactive, efficient with Dexie indexing)
  - Orange color for sodium badge matches eating/salt theme for visual consistency
metrics:
  duration: 10m
  completed: "2026-04-06T14:34:16Z"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 260406-mpb: Fix Water Entry Name Display and Food Entry Sodium Summary

Food name now appears as a label badge on water entries logged from the food screen, and food recent entries show sodium mg alongside date/weight/name.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Fix water entry name display from food screen | 919c321 | Pass foodText as note on water intakes; add manual:* and update food:* handlers in getLiquidTypeLabel |
| 2 | Add sodium display to food recent entries | cbdfd41 | Add useLiveQuery for groupId-based salt lookup; render orange sodium badge in renderEntry |

## Implementation Details

### Task 1: Water Entry Name Display

**Problem:** Water entries created via the food screen's `handleDetailSubmit` (with source `manual:food_water_content`) had no `note` field, so `getLiquidTypeLabel` had nothing to display. Similarly, AI-parsed entries with source `food:ai_parse` were showing "Food (ai_parse)" instead of the food name.

**Fix (food-section.tsx):** Added `note: foodText.trim()` on the water intake object pushed in `handleDetailSubmit`, using the conditional spread pattern `...(trimmedFood && { note: trimmedFood })` to satisfy `exactOptionalPropertyTypes`.

**Fix (utils.ts):** 
- Added `manual:*` source handler: returns `options?.note || "Food"`
- Updated `food:*` handler: returns `options?.note || "Food"` instead of parsing the source sub-string (e.g., "ai_parse" is not a useful display label)

The water-tab and history record-row already passed `{ note: record.note }` to `getLiquidTypeLabel`, so no changes needed there.

### Task 2: Sodium Display in Food Recent Entries

**Problem:** Food recent entries showed `{date} {weight}g {name}` but omitted sodium, requiring users to open edit dialogs to see nutritional details.

**Fix:** Added a `useLiveQuery` that fetches salt IntakeRecords linked by `groupId` to the displayed eating records, building a `Map<string, number>` of groupId-to-sodium. The `renderEntry` callback now renders an orange badge (`text-orange-600`) showing `{sodium}mg` between the date and weight for entries with linked salt records.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated food:* handler to use note instead of sub-string parsing**
- **Found during:** Task 1
- **Issue:** The existing `food:` handler extracted the sub-string after "food:" (e.g., "ai_parse") and displayed it as `Food (ai_parse)` -- not useful
- **Fix:** Changed to use `options?.note || "Food"`, consistent with the new `manual:*` handler
- **Files modified:** src/lib/utils.ts
- **Commit:** 919c321

## Verification

- `pnpm build` passes (compilation + type checking)
- `pnpm tsc --noEmit` passes (0 errors)
- All 417 unit tests pass
- ESLint plugin conflict is pre-existing worktree path issue, unrelated to changes

## Self-Check: PASSED

- food-section.tsx: FOUND
- utils.ts: FOUND
- Commit 919c321: FOUND
- Commit cbdfd41: FOUND

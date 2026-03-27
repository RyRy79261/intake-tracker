---
phase: 18-build-stability-and-dead-code-cleanup
plan: 01
title: "Restore Missing Settings Store Fields and Fix Import Boundaries"
subsystem: settings-store, import-boundaries
tags: [settings, zustand, eslint, type-safety]
dependency_graph:
  requires: []
  provides:
    - "Settings store: dismissedInsights, dismissInsight, isDismissed"
    - "Settings store: primaryRegion, secondaryRegion"
    - "Settings store: timeFormat"
    - "Settings store: doseRemindersEnabled, reminderFollowUpCount, reminderFollowUpInterval"
    - "Settings store: substanceConfig, setSubstanceConfig"
    - "Hooks layer: ComposableEntryInput re-export"
  affects:
    - src/stores/settings-store.ts
    - src/hooks/use-composable-entry.ts
    - src/components/food-salt/food-section.tsx
    - src/components/liquids/preset-tab.tsx
tech_stack:
  added: []
  patterns:
    - "Zustand getter function for isDismissed (uses get() not set)"
    - "Type re-export from hooks layer for ESLint import boundary compliance"
key_files:
  created: []
  modified:
    - src/stores/settings-store.ts
    - src/hooks/use-composable-entry.ts
    - src/components/food-salt/food-section.tsx
    - src/components/liquids/preset-tab.tsx
decisions:
  - "Persist version stays at 3 -- Zustand handles missing keys via defaultSettings spread"
  - "SubstanceConfig exported as named interface for consumer type access"
metrics:
  duration: "6min"
  completed: "2026-03-27"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 18 Plan 01: Restore Missing Settings Store Fields and Fix Import Boundaries Summary

Restored 5 missing field groups (insight dismissal, medication regions, time format, dose reminders, substance config) to settings-store.ts and fixed ESLint no-restricted-imports violations in food-section.tsx and preset-tab.tsx by re-exporting ComposableEntryInput through the hooks layer.

## What Changed

### Task 1: Settings Store Fields and Actions (b7064ce)

Added all fields and actions that consumer components reference but were lost during v1.1 cleanup phases:

1. **Insight dismissal** -- `dismissedInsights: Record<string, string | number>`, `dismissInsight()`, `isDismissed()` -- consumed by InsightBadge and InsightsTab
2. **Medication regions** -- `primaryRegion`, `secondaryRegion` with setters -- consumed by MedicationSettingsView, MedicationSettingsSection, and use-medicine-search
3. **Time format** -- `timeFormat: "12h" | "24h"` with setter -- consumed by MedicationSettingsView
4. **Dose reminders** -- `doseRemindersEnabled`, `reminderFollowUpCount`, `reminderFollowUpInterval` with setters -- consumed by MedicationSettingsView and use-push-schedule-sync
5. **Substance config** -- `SubstanceConfig` interface with caffeine/alcohol type arrays, consumed by SubstanceSettingsSection, SubstanceRow, SubstanceTypePicker

Persist version kept at 3. New fields are undefined in existing persisted state and fall back to defaults via `...defaultSettings` spread. Zustand's persist merge handles this gracefully.

### Task 2: ESLint Import Boundary Fixes (d17d006)

- Added `export type { ComposableEntryInput, ComposableEntryResult, EntryGroup, RecordTable }` to `src/hooks/use-composable-entry.ts`
- Changed `food-section.tsx` import from `@/lib/composable-entry-service` to `@/hooks/use-composable-entry`
- Changed `preset-tab.tsx` import from `@/lib/composable-entry-service` to `@/hooks/use-composable-entry`

ESLint no-restricted-imports now passes on both files.

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Persist version stays at 3** -- New fields added to Settings interface without bumping version. Zustand's persist middleware merges persisted state with defaults, so missing keys naturally fall back to defaultSettings values.
2. **SubstanceConfig exported as named interface** -- Exported from settings-store.ts so consumers like substance-settings-section.tsx can derive types from it (e.g., `Settings["substanceConfig"]["caffeine"]["types"][number]`).

## Verification Results

- TypeScript: 0 errors in all target files (pre-existing test file errors are unrelated)
- ESLint: food-section.tsx and preset-tab.tsx pass with no no-restricted-imports violations
- grep confirms: dismissInsight/isDismissed appear 4 times; primaryRegion/secondaryRegion appear 6 times in settings-store.ts

## Known Stubs

None -- all fields have real defaults and all actions have real implementations.

## Self-Check: PASSED

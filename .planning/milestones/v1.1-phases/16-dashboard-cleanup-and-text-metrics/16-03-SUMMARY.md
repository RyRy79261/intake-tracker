---
phase: 16-dashboard-cleanup-and-text-metrics
plan: 03
subsystem: ui
tags: [cleanup, dead-code, components, settings, zustand]

# Dependency graph
requires:
  - phase: 16-dashboard-cleanup-and-text-metrics/02
    provides: "TextMetrics, LiquidsCard tabs, dashboard reorder (made old components fully unreferenced)"
provides:
  - "13 dead component/hook files deleted (food-calculator, eating-card, voice-input, parsed-intake-display, historical-graph, 5 chart files, intake-card, use-graph-data, use-now)"
  - "Cleaned constants.ts (no COFFEE_PRESETS, LIQUID_TYPE_OPTIONS)"
  - "Cleaned card-themes.ts (no UTILITY_THEMES)"
  - "Cleaned settings-store.ts (no coffeeDefaultType, utilityOrder)"
  - "Cleaned QuickNavFooter (section nav only, no utility row)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Persist migration cleans up removed fields (utilityOrder added to v3 migration)"

key-files:
  created: []
  modified:
    - src/lib/constants.ts
    - src/lib/card-themes.ts
    - src/stores/settings-store.ts
    - src/components/quick-nav-footer.tsx
    - src/app/page.tsx
    - src/components/settings/quick-nav-section.tsx

key-decisions:
  - "LIQUID_TYPE_OPTIONS removed alongside COFFEE_PRESETS (zero consumers after intake-card.tsx deletion)"
  - "utilityOrder cleanup added to existing v3 persist migration rather than bumping to v4"

patterns-established: []

requirements-completed: [DASH-07]

# Metrics
duration: 7min
completed: 2026-03-24
---

# Phase 16 Plan 03: Dead Code Cleanup Summary

**Deleted 13 replaced UI component/hook files and removed dead constants, themes, and settings fields from 6 supporting files**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T21:36:07Z
- **Completed:** 2026-03-24T21:43:37Z
- **Tasks:** 2
- **Files modified:** 19 (13 deleted + 6 modified)

## Accomplishments
- Deleted 13 fully-replaced component and hook files: food-calculator, eating-card, voice-input, parsed-intake-display, historical-graph, 5 chart sub-components, intake-card, use-graph-data, use-now
- Removed empty charts/ directory
- Removed COFFEE_PRESETS, CoffeePreset, LIQUID_TYPE_OPTIONS from constants.ts
- Removed UTILITY_THEMES, UtilityThemeKey from card-themes.ts
- Removed coffeeDefaultType/setCoffeeDefaultType and utilityOrder/setUtilityOrder from settings store
- Cleaned QuickNavFooter: removed utility row (FOOD_ITEM, AI_ITEM, onOpenFoodCalculator, onOpenVoiceInput props, UtilityButton component)
- Cleaned settings UI: removed Utility Row Order dropdown from quick-nav-section.tsx
- Added utilityOrder cleanup to v3 persist migration

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete replaced component files** - `1f39293` (chore)
2. **Task 2: Clean up dead constants, themes, settings fields, and QuickNavFooter props** - `81b6047` (refactor)

## Files Created/Modified
- `src/components/food-calculator.tsx` - DELETED (replaced by FoodSection in food-salt-card)
- `src/components/eating-card.tsx` - DELETED (replaced by FoodSection in food-salt-card)
- `src/components/voice-input.tsx` - DELETED (replaced by AI FAB in LiquidsCard)
- `src/components/parsed-intake-display.tsx` - DELETED (only used by voice-input)
- `src/components/historical-graph.tsx` - DELETED (replaced by TextMetrics)
- `src/components/charts/intake-chart.tsx` - DELETED (only used by historical-graph)
- `src/components/charts/weight-chart.tsx` - DELETED (only used by historical-graph)
- `src/components/charts/bp-chart.tsx` - DELETED (only used by historical-graph)
- `src/components/charts/metrics-section.tsx` - DELETED (only used by historical-graph)
- `src/components/charts/chart-utils.ts` - DELETED (only used by chart components)
- `src/components/intake-card.tsx` - DELETED (replaced by LiquidsCard)
- `src/hooks/use-graph-data.ts` - DELETED (only used by chart components)
- `src/hooks/use-now.ts` - DELETED (only used by historical-graph)
- `src/lib/constants.ts` - Removed COFFEE_PRESETS, CoffeePreset, LIQUID_TYPE_OPTIONS
- `src/lib/card-themes.ts` - Removed UTILITY_THEMES, UtilityThemeKey, Apple icon import
- `src/stores/settings-store.ts` - Removed coffeeDefaultType, setCoffeeDefaultType, utilityOrder, setUtilityOrder; added utilityOrder to v3 migration cleanup
- `src/components/quick-nav-footer.tsx` - Removed utility row: FOOD_ITEM, AI_ITEM, UtilityButton, all utility-related props and logic
- `src/app/page.tsx` - Removed utilityOrder prop from QuickNavFooter usage
- `src/components/settings/quick-nav-section.tsx` - Removed Utility Row Order dropdown

## Decisions Made
- Removed LIQUID_TYPE_OPTIONS alongside COFFEE_PRESETS since both had zero consumers after intake-card.tsx deletion
- Added utilityOrder cleanup to existing v3 persist migration rather than bumping version to v4 (utilityOrder was only introduced in the current codebase, same migration window handles it)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Build fails with pre-existing errors (dismissInsight missing from Settings type in insights-tab.tsx, obfuscateApiKey/deobfuscateApiKey missing from security module). These errors exist on the base commit before any plan changes and are not related to the cleanup work. Zero new errors introduced by the deletions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 16 is now fully complete (all 3 plans executed)
- Zero dead code from old intake UI remains
- Dashboard uses exclusively the new component set: LiquidsCard, FoodSaltCard, TextMetrics
- QuickNavFooter is a clean section-only navigator
- Pre-existing build errors (insights-tab, security module) remain for future phases to address

## Self-Check: PASSED

- All 13 deleted files confirmed absent
- All 6 modified files confirmed present
- Both task commits (1f39293, 81b6047) confirmed in git log

---
*Phase: 16-dashboard-cleanup-and-text-metrics*
*Completed: 2026-03-24*

---
phase: 16-dashboard-cleanup-and-text-metrics
plan: 02
subsystem: ui
tags: [react, text-metrics, progress-bar, preset-tab, multi-substance, dashboard-layout, blood-pressure, zustand]

# Dependency graph
requires:
  - phase: 16-dashboard-cleanup-and-text-metrics
    plan: 01
    provides: "LiquidPreset multi-substance model, Zustand v3 migration, composable-entry-service substances[] path"
  - phase: 14-liquids-card
    provides: "PresetTab, LiquidsCard, WaterTab, BeverageTab, CARD_THEMES caffeine/alcohol entries"
  - phase: 12-composable-entries
    provides: "ComposableEntryInput, addComposableEntry with intakes[] and substances[] fields"
provides:
  - "TextMetrics component with today's water/salt progress + caffeine/alcohol totals + weekly Mon-Sun grid"
  - "useIntakeRecordsByDateRange hook for date-range intake queries with reactive updates"
  - "PresetTab updated for multi-substance model (tab prop, waterContentPercent, per-100ml fields)"
  - "BP heart rate promoted to primary input area (always visible)"
  - "Liquid Presets manager in CustomizationPanel with full CRUD"
  - "Dashboard card reordering: TextMetrics -> Liquids -> FoodSalt -> BP -> Weight -> Urination -> Defecation"
affects: [16-03, history-page, settings-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TextMetrics uses hooks-only data access pattern (no direct service imports in components)"
    - "Weekly grid uses dayStartHour-aware bucketing with Monday-start week boundaries"
    - "PresetTab builds ComposableEntryInput with intakes[] for water/salt and substance/substances for caffeine/alcohol"

key-files:
  created:
    - src/components/text-metrics.tsx
  modified:
    - src/hooks/use-intake-queries.ts
    - src/components/liquids/preset-tab.tsx
    - src/components/liquids-card.tsx
    - src/components/blood-pressure-card.tsx
    - src/components/customization-panel.tsx
    - src/app/page.tsx

key-decisions:
  - "TextMetrics uses CARD_THEMES domain colors for consistent visual language across all metric displays"
  - "PresetTab uses singular substance field for backward compat when only 1 substance, substances[] array for multi"
  - "Weekly grid computes dayOffset from weekStart using dayStartHour boundaries for correct bucketing"
  - "Liquid Presets manager in CustomizationPanel uses inline edit forms (not separate dialog) for lightweight editing"

patterns-established:
  - "useIntakeRecordsByDateRange hook with 60s tick refresh for date-range queries"
  - "Weekly Monday-start grid with dayStartHour boundary adjustment"
  - "Multi-substance preset logging: intakes[] for water/salt, substance/substances for caffeine/alcohol"

requirements-completed: [DASH-06, DASH-08, DASH-09, DASH-10]

# Metrics
duration: 9min
completed: 2026-03-24
---

# Phase 16 Plan 02: Dashboard UI Summary

**TextMetrics dashboard overview with progress bars and weekly grid, BP heart rate promoted to primary area, Coffee tab replaced with Liquid Presets CRUD manager, PresetTab multi-substance logging, dashboard cards reordered**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-24T21:20:49Z
- **Completed:** 2026-03-24T21:30:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created TextMetrics component showing today's water/salt with progress bars and limits, caffeine total in mg, alcohol total in std drinks, and weekly Mon-Sun summary grid
- Added useIntakeRecordsByDateRange hook for date-range intake queries with 60s reactive refresh
- Updated PresetTab to use multi-substance preset model (tab prop, waterContentPercent, caffeinePer100ml, alcoholPer100ml, saltPer100ml) with ComposableEntryInput building
- Promoted BP heart rate input to primary area (always visible without expanding More Options)
- Replaced Coffee tab in CustomizationPanel with Liquid Presets manager showing all presets with edit/delete/add
- Reordered dashboard: TextMetrics at top, BP before Weight, HistoricalGraph removed

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useIntakeRecordsByDateRange hook, TextMetrics component, and update PresetTab** - `f98de3b` (feat)
2. **Task 2: Promote BP heart rate, replace Coffee tab with Liquid Presets, reorder dashboard** - `d8c0cb5` (feat)

## Files Created/Modified
- `src/components/text-metrics.tsx` - New TextMetrics component with today's metrics and weekly summary
- `src/hooks/use-intake-queries.ts` - Added useIntakeRecordsByDateRange hook and getRecordsByDateRange import
- `src/components/liquids/preset-tab.tsx` - Updated for multi-substance model: tab prop, per-100ml fields, ComposableEntryInput builder
- `src/components/liquids-card.tsx` - Changed PresetTab type prop to tab prop
- `src/components/blood-pressure-card.tsx` - Heart rate moved from collapsible to primary input area
- `src/components/customization-panel.tsx` - Coffee tab replaced with Liquid Presets manager with full CRUD
- `src/app/page.tsx` - HistoricalGraph replaced with TextMetrics, BP/Weight order swapped

## Decisions Made
- TextMetrics uses hooks-only data access (useDailyIntakeTotal, useIntakeRecordsByDateRange, useSubstanceRecordsByDateRange) with no direct service imports
- PresetTab uses singular `substance` field for backward compatibility when only 1 substance present, `substances[]` array for multi-substance presets
- Liquid Presets manager uses inline edit forms rather than separate dialogs for lightweight editing
- Weekly grid uses dayStartHour-aware Monday boundary calculation for correct day bucketing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes compliance in PresetTab**
- **Found during:** Task 1 (PresetTab multi-substance update)
- **Issue:** `substances[0]` could be undefined, assigning to `entry.substance` (exact optional type) would fail
- **Fix:** Added truthiness check `substances[0]` before assignment
- **Files modified:** src/components/liquids/preset-tab.tsx
- **Committed in:** f98de3b (Task 1 commit)

**2. [Rule 1 - Bug] Fixed noUncheckedIndexedAccess in TextMetrics weekly bucketing**
- **Found during:** Task 1 (TextMetrics component)
- **Issue:** `buckets[dayOffset] += record.amount` could be undefined under strict index access
- **Fix:** Used `(buckets[dayOffset] ?? 0) + record.amount` pattern
- **Files modified:** src/components/text-metrics.tsx
- **Committed in:** f98de3b (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs - TypeScript strict mode compliance)
**Impact on plan:** Both auto-fixes necessary for TypeScript strict mode compliance. No scope creep.

## Issues Encountered
- ESLint has a plugin resolution conflict in worktrees (finding both worktree and root .eslintrc.json). This is a pre-existing worktree infrastructure issue, not caused by plan changes. TypeScript type checking confirms no type errors in modified files.
- Pre-existing type error in insights-tab.tsx (dismissInsight property missing from Settings) -- out of scope for this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- TextMetrics, Liquid Presets manager, and BP improvements complete
- Plan 03 can proceed with component deletion (FoodCalculator, EatingCard, VoiceInput, ParsedIntakeDisplay, HistoricalGraph, charts/) and dead code cleanup
- All section IDs preserved for E2E test compatibility

## Self-Check: PASSED

All 7 created/modified files verified present. Both task commits (f98de3b, d8c0cb5) verified in git log.

---
*Phase: 16-dashboard-cleanup-and-text-metrics*
*Completed: 2026-03-24*

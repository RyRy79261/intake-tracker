# Quick Task 260410-ho9: Fix GitHub Issues #31-#35

**Date:** 2026-04-10
**Branch:** fix/small-tickets-31-35
**Tasks:** 5/5 complete

## Commits

| # | Commit | Description |
|---|--------|-------------|
| 1 | 287e9ef | feat(quick-260410-ho9): display heart rate and BP delta in quick view header (GH-31) |
| 2 | 7491f97 | fix(quick-260410-ho9): remove default auto-generated insights (GH-32) |
| 3 | 761a320 | feat(quick-260410-ho9): ai parse returns explicit salt vs sodium indicator (GH-33) |
| 4 | 08bdf96 | feat(quick-260410-ho9): inline editing replaces modal dialogs in card components (GH-34) |
| 5 | c3386d5 | feat(quick-260410-ho9): add caffeine and alcohol rows to weekly summary grid (GH-35) |

## Changes by Issue

### GH-31: BP Quick View Heart Rate & Delta
- **File:** `src/components/blood-pressure-card.tsx`
- Added heart rate display below BP reading (shows BPM when present)
- Added systolic/diastolic delta vs previous reading with color coding (green=decreasing, red=increasing)

### GH-32: Remove Default Insights
- **Files:** `src/hooks/use-analytics-queries.ts`, `src/components/analytics/insights-tab.tsx`
- Cleared `useInsights` hook to return empty array (removes all auto-generated insights)
- Updated empty state messaging for future custom insights support
- `InsightBadge` naturally hides when no insights exist

### GH-33: AI Salt vs Sodium Indicator
- **Files:** `src/app/api/ai/parse/route.ts`, `src/lib/ai-client.ts`, `src/components/food-salt/food-section.tsx`
- Added `measurement_type` field (enum: "sodium" | "salt") to AI parse tool schema
- Updated system prompt to require explicit salt/sodium distinction
- Client `ParsedIntake` interface includes `measurementType`
- Food section auto-selects sodium source dropdown based on AI response

### GH-34: Inline Editing Replaces Modal Dialogs
- **Files:** `src/components/recent-entries-list.tsx`, plus all 6 card components
- Added `editingId` and `renderEditForm` props to `RecentEntriesList`
- Each card now renders inline edit form instead of opening dialog
- Dialog component files preserved (still used by history drawer)
- Cards affected: blood-pressure, liquids, food-section, weight, urination, defecation

### GH-35: Caffeine & Alcohol in Weekly Summary
- **File:** `src/components/text-metrics.tsx`
- Added weekly caffeine and alcohol queries with day bucketing
- New `Caf` row showing daily caffeine in mg
- New `Alc` row showing daily alcohol in standard drinks (1 decimal)

## Files Modified (12)

- `src/app/api/ai/parse/route.ts`
- `src/components/analytics/insights-tab.tsx`
- `src/components/blood-pressure-card.tsx`
- `src/components/defecation-card.tsx`
- `src/components/food-salt/food-section.tsx`
- `src/components/liquids-card.tsx`
- `src/components/recent-entries-list.tsx`
- `src/components/text-metrics.tsx`
- `src/components/urination-card.tsx`
- `src/components/weight-card.tsx`
- `src/hooks/use-analytics-queries.ts`
- `src/lib/ai-client.ts`

# Roadmap: Intake Tracker

## Overview

This project is a personal health tracking PWA. v1.0 rebuilt the medication management subsystem, hardened the data model, and established test infrastructure. v1.1 redesigns the intake tracking UI with composable data entries (single input creates linked records across domains), unified input cards (Liquids with tabs, Food+Salt merged), AI-powered substance lookup with saved presets, and dashboard modernization (text metrics, card reordering, cleanup).

## Milestones

- ✅ **v1.0 Engineering Overhaul** — Phases 1–11 (shipped 2026-03-23) — [archived](./milestones/v1.0-ROADMAP.md)
- **v1.1 UI Overhaul** — Phases 12–19 (in progress)

### v1.1 UI Overhaul (In Progress)

**Milestone Goal:** Redesign the intake tracking UI with composable data entries, unified input cards, AI-powered substance lookup, and dashboard modernization

- [x] **Phase 12: Composable Data Foundation** - Dexie v15 schema migration with groupId, composable entry service for atomic cross-table writes, and soft-delete standardization (completed 2026-03-23)
- [x] **Phase 13: Liquid Presets and AI Lookup** - Zustand preset store for beverages and AI-powered caffeine/alcohol per-100ml lookup route (completed 2026-03-24)
- [x] **Phase 14: Unified Liquids Card** - Tabbed water/coffee/alcohol card with preset-based logging and substance auto-calculation (completed 2026-03-24)
- [x] **Phase 15: Unified Food+Salt Card** - Merged food and salt input with AI parsing that creates composable linked entries (completed 2026-03-24)
- [x] **Phase 16: Dashboard Cleanup and Text Metrics** - BP heart rate visible, food calculator removed, text metrics, coffee settings migrated, card reordering (completed 2026-03-24)
- [x] **Phase 17: Timezone-Aware Dose Logging** - Correct day-of-week schedule generation for SA/Germany timezones with device timezone stored per dose log (completed 2026-03-26)
- [x] **Phase 18: Build Stability and Dead Code Cleanup** - Fix pnpm build failures, remove dead Settings store references, resolve missing store methods (gap closure) (completed 2026-03-27)
- [x] **Phase 19: AI Substance Lookup Enhancement** - Add waterContentPercent to substance-lookup API response for accurate hydration tracking from AI-sourced presets (gap closure) (completed 2026-03-27)

## Phase Details

### Phase 12: Composable Data Foundation
**Goal**: A composable entry service can atomically create, read, and soft-delete linked records across multiple tables, backed by a tested Dexie v15 schema migration
**Depends on**: Phase 11 (continues from v1.0)
**Requirements**: COMP-01, COMP-02, COMP-03, COMP-04
**Success Criteria** (what must be TRUE):
  1. Creating a composable entry with food, water, and salt data produces records in eatingRecords, intakeRecords, and substanceRecords that all share the same groupId
  2. Dexie v15 migration adds groupId index to intakeRecords, eatingRecords, and substanceRecords without corrupting any existing records (verified by migration test with fake-indexeddb)
  3. Deleting a composable entry group sets deletedAt on all linked records in a single transaction -- no orphaned records survive if any individual delete fails
  4. Querying by groupId via useLiveQuery returns all linked records across tables in a single reactive callback
**Plans**: 2 plans

Plans:
- [x] 12-01-PLAN.md -- Dexie v15 schema migration + soft-delete standardization (COMP-02, COMP-03)
- [x] 12-02-PLAN.md -- Composable entry service + hooks (COMP-01, COMP-03, COMP-04)

### Phase 13: Liquid Presets and AI Lookup
**Goal**: Users can save beverage presets with substance content and look up caffeine/alcohol concentrations via AI, ready for the Liquids card to consume
**Depends on**: Phase 12
**Requirements**: LIQD-02, LIQD-03
**Success Criteria** (what must be TRUE):
  1. User can create, edit, and delete beverage presets (name, type, default volume, substance-per-100ml) that persist across app restarts
  2. Hitting the AI lookup for a beverage name returns a caffeine-per-100ml or alcohol-per-100ml estimate with Zod-validated bounds, and the user can edit the value before saving as a preset
  3. Existing coffee presets are available as built-in defaults in the new preset system (seeded from current COFFEE_PRESETS constant)
**Plans**: 3 plans

Plans:
- [x] 13-01-PLAN.md -- Preset system in Zustand + shared Claude client + DEFAULT_LIQUID_PRESETS (LIQD-02)
- [x] 13-02-PLAN.md -- Migrate all 5 Perplexity AI routes to Claude + new substance-lookup route (LIQD-03)
- [x] 13-03-PLAN.md -- Perplexity cleanup: rename client lib, update imports, env, docs, CSP, bundle test (LIQD-02, LIQD-03)

### Phase 14: Unified Liquids Card
**Goal**: Users can track water, coffee, and alcohol from a single tabbed Liquids card, with water preserving its existing zero-friction UX and coffee/alcohol using presets with auto-calculated substance amounts
**Depends on**: Phase 12, Phase 13
**Requirements**: LIQD-01, LIQD-04
**Success Criteria** (what must be TRUE):
  1. The Liquids card shows water, coffee, and alcohol as tabs -- the water tab preserves the existing increment/decrement buttons and daily total exactly as they work today
  2. Selecting a coffee or alcohol preset and confirming a volume logs an intake record and a linked substance record with the correct calculated amount (volume * per-100ml / 100)
  3. The user can switch between tabs without losing in-progress input on any tab
**Plans**: 2 plans

Plans:
- [x] 14-01-PLAN.md -- LiquidsCard shell + WaterTab + BeverageTab (LIQD-01)
- [x] 14-02-PLAN.md -- PresetTab for Coffee/Alcohol + dashboard swap (LIQD-01, LIQD-04)

### Phase 15: Unified Food+Salt Card
**Goal**: Users can log food and salt from a single card, with AI food parsing automatically creating composable linked entries across eating, water, and salt domains
**Depends on**: Phase 12, Phase 13
**Requirements**: FOOD-01, FOOD-02, FOOD-03
**Success Criteria** (what must be TRUE):
  1. The Food+Salt card provides both AI food input and manual salt input (salt tablets, seasoning) in a single unified card
  2. Typing a food description and triggering AI parse shows a preview of all linked records (eating, water, salt) that will be created, with the ability to edit or remove individual entries before confirming
  3. Confirming an AI food parse atomically creates all linked records via the composable entry service -- all records share a groupId and appear as a unit in the UI
**Plans**: 2 plans

Plans:
- [x] 15-01-PLAN.md -- SaltSection + ComposablePreview + FoodSection components (FOOD-01, FOOD-02, FOOD-03)
- [x] 15-02-PLAN.md -- FoodSaltCard shell + dashboard integration (FOOD-01, FOOD-02, FOOD-03)

### Phase 16: Dashboard Cleanup and Text Metrics
**Goal**: The intake dashboard is reorganized with text metrics replacing graphs, cleaned-up cards in the correct order, and quick UI wins applied
**Depends on**: Phase 14, Phase 15
**Requirements**: DASH-06, DASH-07, DASH-08, DASH-09, DASH-10
**Success Criteria** (what must be TRUE):
  1. Heart rate input is always visible on the blood pressure card without needing to expand "more options"
  2. The food calculator feature is fully removed from the codebase (no dead code, no route, no UI entry point)
  3. The intake page shows text-based metrics -- today's water/salt limits with progress, caffeine and alcohol totals, and a weekly summary starting Monday -- instead of inline graphs
  4. Coffee settings have been migrated to serve as liquid tab defaults in the unified Liquids card
  5. Cards on the intake page appear in order: Liquids, Food+Salt, then remaining health metric cards (BP, weight, urination, defecation)
**Plans**: 3 plans

Plans:
- [x] 16-01-PLAN.md -- LiquidPreset multi-substance model + composable entry service extension + Zustand v3 migration (DASH-09)
- [x] 16-02-PLAN.md -- TextMetrics component + BP heart rate promotion + Liquid Presets tab + PresetTab update + dashboard reorder (DASH-06, DASH-08, DASH-09, DASH-10)
- [x] 16-03-PLAN.md -- Dead code deletion: 13 replaced files + constants/themes/settings cleanup (DASH-07)
**UI hint**: yes



### Phase 17: Timezone-Aware Dose Logging
**Goal**: Dose log generation produces correct schedules when the user travels between South Africa and Germany, with each dose log recording the device timezone at time of logging
**Depends on**: Phase 11
**Requirements**: TMZN-01
**Success Criteria** (what must be TRUE):
  1. Dose schedule generation produces correct day-of-week slots for UTC+2 (SA) and UTC+1/UTC+2 DST (Germany) without manual user intervention
  2. Each dose log record stores the device timezone at the time of logging, enabling retrospective analysis of when doses were taken relative to local time
  3. Switching device timezone (simulating travel) does not duplicate or drop scheduled dose slots for the transition day
**Plans**: 2 plans

Plans:
- [x] 17-01-PLAN.md -- Timezone cache-busting + recalculateScheduleTimezones service + audit action + tests (TMZN-01)
- [x] 17-02-PLAN.md -- Timezone detection hook + confirmation dialog + provider wiring (TMZN-01)

### Phase 18: Build Stability and Dead Code Cleanup
**Goal**: pnpm build passes with zero TypeScript/ESLint errors, and all Settings store references resolve to real methods
**Depends on**: Phase 16 (dashboard cleanup)
**Requirements**: Gap closure — no new REQ-IDs
**Gap Closure**: Closes gaps from v1.1-MILESTONE-AUDIT.md
**Success Criteria** (what must be TRUE):
  1. `pnpm build` completes successfully with zero errors
  2. `dismissInsight` and `isDismissed` either exist in the Settings store or their references are removed from InsightBadge and InsightsTab
  3. No TypeScript errors in `medication-settings-view.tsx`, `medication-settings-section.tsx`, or `substance-settings-section.tsx`
  4. Dashboard renders without runtime crashes when insights are active
**Plans**: 1 plan

Plans:
- [x] 18-01-PLAN.md -- Restore missing Settings store fields + fix ESLint import boundary violations

### Phase 19: AI Substance Lookup Enhancement
**Goal**: The substance-lookup API returns waterContentPercent so AI-sourced beverage presets produce accurate hydration records
**Depends on**: Phase 13 (substance-lookup route)
**Requirements**: Gap closure — improves LIQD-03, LIQD-04 data quality
**Gap Closure**: Closes gaps from v1.1-MILESTONE-AUDIT.md
**Success Criteria** (what must be TRUE):
  1. `/api/ai/substance-lookup` response includes `waterContentPercent` (0-100) in both the Zod schema and Claude tool definition
  2. PresetTab uses the API-returned `waterContentPercent` instead of defaulting to 100%
  3. Looking up "beer" via AI returns waterContentPercent ~93, not 100
**Plans**: 1 plan

Plans:
- [x] 19-01-PLAN.md -- Add waterContentPercent to Zod schema, tool definition, and system prompts + unit tests (LIQD-03, LIQD-04)

## Progress

**Execution Order:**
v1.0: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 6.1 -> 7 -> 8 -> 9 -> 10 -> 11
v1.1: 12 -> 13 -> 14 -> 15 -> 16 -> 17 -> 18 -> 19

Note: Phase 14 and Phase 15 both depend on Phase 12 and 13 but are independent of each other -- they can execute in either order. Phase 17 depends only on Phase 11 and can execute in parallel with earlier v1.1 phases if needed.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Schema Foundation | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2. TypeScript and Service Contracts | v1.0 | 4/4 | Complete | - |
| 3. Service Layer Rebuild | v1.0 | 5/5 | Complete | - |
| 4. Analytics Service | v1.0 | 8/8 | Complete | - |
| 5. Security Hardening | v1.0 | 3/3 | Complete | 2026-03-10 |
| 6. Medication UX Core | v1.0 | 7/7 | Complete | 2026-03-20 |
| 6.1. Dashboard Input Redesign | v1.0 | 2/2 | Complete | 2026-03-20 |
| 7. Schedule Visualization | v1.0 | 1/1 | Complete | 2026-03-20 |
| 8. Drug Interactions | v1.0 | 3/3 | Complete | 2026-03-20 |
| 9. Data Integrity and Backup | v1.0 | 2/2 | Complete | - |
| 10. Test Coverage | v1.0 | 3/3 | Complete | 2026-03-23 |
| 11. Push Notifications | v1.0 | 3/3 | Complete | 2026-03-23 |
| 12. Composable Data Foundation | v1.1 | 2/2 | Complete    | 2026-03-23 |
| 13. Liquid Presets and AI Lookup | v1.1 | 3/3 | Complete    | 2026-03-24 |
| 14. Unified Liquids Card | v1.1 | 2/2 | Complete    | 2026-03-24 |
| 15. Unified Food+Salt Card | v1.1 | 2/2 | Complete    | 2026-03-24 |
| 16. Dashboard Cleanup and Text Metrics | v1.1 | 3/3 | Complete    | 2026-03-24 |
| 17. Timezone-Aware Dose Logging | v1.1 | 2/2 | Complete    | 2026-03-26 |
| 18. Build Stability and Dead Code Cleanup | v1.1 | 1/1 | Complete    | 2026-03-27 |
| 19. AI Substance Lookup Enhancement | v1.1 | 1/1 | Complete    | 2026-03-27 |

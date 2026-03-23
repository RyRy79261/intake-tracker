# Project Research Summary

**Project:** v1.1 UI Overhaul — Composable Entries, Unified Input Cards, AI Substance Lookup
**Domain:** Offline-first health tracking PWA — composable data entry system
**Researched:** 2026-03-23
**Confidence:** HIGH

## Executive Summary

This milestone adds a composable data entry layer to an existing offline-first health tracking PWA built on Next.js 14, Dexie.js, and Zustand. The core concept is a `groupId` foreign key on existing records (`IntakeRecord`, `EatingRecord`, `SubstanceRecord`) that links records created atomically from a single user action — for example, "a bowl of ramen" creating an eating record, a water intake record (from broth), and a salt intake record, all in one Dexie transaction. No new npm dependencies are required; the existing stack fully supports all milestone features. The primary architectural decision is to use `groupId` on child records rather than a parent entity table, matching proven patterns already in the codebase (`sourceRecordId`, `doseLogId`).

The recommended build order is data layer first, then presets and AI, then UI components, then dashboard integration. This sequence means every phase can be tested in isolation before the next layer depends on it. The water tab must preserve its existing zero-friction increment UX exactly — coffee and alcohol tabs are new, and the water tab change is purely structural (wrapped in a `LiquidsCard` with tabs). Text metrics (replacing intake page graphs) are architecturally independent and can be built in parallel with card work.

The most critical risks are in the multi-table transaction layer: forgetting to declare all tables in a Dexie transaction causes orphaned records that survive rollbacks, and calling any external API (Perplexity, `fetch`) inside a transaction silently closes the IndexedDB transaction and splits the write. Both pitfalls are preventable by a single `composable-entry-service.ts` that owns all cross-table writes and only calls AI before the transaction opens. A second key risk is inconsistency between soft delete (substance records) and hard delete (intake records) in the existing codebase — this must be standardized to soft delete before building cascading deletes on top of it.

## Key Findings

### Recommended Stack

The entire milestone requires zero new npm dependencies. All capabilities exist in the current stack. Dexie.js `db.transaction('rw', [...tables], async () => {...})` handles multi-table atomic writes — this pattern is already used in 25+ places in the codebase. The existing `@radix-ui/react-tabs` (already installed via shadcn/ui) covers the unified tabbed card UI. The existing Perplexity `sonar-pro` integration handles AI substance lookup via a new `/api/ai/substance-lookup` route following the pattern of the existing `/api/ai/substance-enrich` route. Zustand persists liquid presets alongside existing settings — no Dexie table needed for preference data.

**Core technologies:**
- Dexie.js `^4.0.8`: Multi-table atomic transactions, groupId index queries — no upgrade needed; 4.3.0 has no breaking changes
- `@radix-ui/react-tabs` `^1.1.1`: Already installed; powers the unified LiquidsCard tabbed layout
- Perplexity `sonar-pro` (existing): Extended to return `caffeinePer100ml` and `alcoholPercent` for preset creation
- Zustand `^5.0.0`: Liquid presets stored as settings (not health data), alongside existing `waterIncrement`, `coffeeDefaultType`
- Zod (existing): Extended schemas for new AI endpoint response validation

**What NOT to add:** dexie-relationships (unmaintained since 2019, Dexie 4.x incompatible), USDA FoodData Central API (food-item-oriented not beverage-name-oriented, rate-limited), react-tabs (duplicate of installed @radix-ui/react-tabs).

See `.planning/research/STACK.md` for full stack analysis.

### Expected Features

**Must have (table stakes):**
- Unified LiquidsCard with water/coffee/alcohol tabs — water tab preserves existing +/- increment UX exactly
- Beverage presets with one-tap logging — extend existing `COFFEE_PRESETS` pattern to a generic `LiquidPreset` in Zustand
- AI substance lookup for caffeine/alcohol content — FAB in coffee/alcohol tabs, shows estimate with confirm/edit before save
- Composable entry data model — `groupId` on 3 tables (Dexie v15 migration), `composable-entry-service.ts`
- Cascading delete for linked records — single transaction soft-deletes all records sharing a `groupId`
- Text metrics replacing intake page graphs — daily limits, substance totals, weekly summary as computed text
- BP heart rate always visible — remove expand/collapse, show HR input inline (pure UI, no data model change)
- Food calculator removal — explicit requirement, eliminates dead code

**Should have (differentiators):**
- Composable entries from food AI parse — "scrambled eggs on toast" creates eating + water + salt records atomically, with editable preview before confirm
- Volume-based substance calculation — `(volumeMl / 100) * preset.caffeinePer100ml`, auto-displayed before confirm
- Weekly Monday-start summary — ISO week aggregation respecting `dayStartHour`; display as text block not chart

**Defer to v1.1.x (post-validation):**
- Smart preset suggestions sorted by usage frequency — needs usage data
- Coffee settings migration/cleanup — after unified card is stable
- Cross-domain correlation insights — needs v1.1 data model in production

**Defer to v2+:**
- Natural language multi-entry parsing into multiple composable groups
- Barcode scanning for beverages
- Real-time caffeine metabolism decay tracking

See `.planning/research/FEATURES.md` for full feature analysis and dependency graph.

### Architecture Approach

The composable entry system is an additive layer on top of the existing service architecture. A new `composable-entry-service.ts` sits alongside existing services, uses `db` directly, and wraps multi-table writes in a single transaction. Each child record (`IntakeRecord`, `EatingRecord`, `SubstanceRecord`) gains an optional `groupId?: string` field — existing records simply have `undefined` here, which IndexedDB excludes from index entries, requiring zero backfill. The Dexie v15 schema adds a `groupId` index to 3 tables; all other tables are repeated unchanged (Dexie requirement). Liquid presets live in Zustand (settings, not health data), migrating from the existing `COFFEE_PRESETS` constant.

**Major components:**
1. `composable-entry-service.ts` (NEW) — Atomic cross-table writes (`addComposableEntry`), cascading soft-delete (`deleteEntryGroup`), group reads (`getEntryGroup`)
2. `use-composable-entry.ts` (NEW) — React hooks wrapping service; single `useLiveQuery` per composable entry to avoid reactivity gaps
3. `LiquidsCard` (NEW) — Tabbed water/coffee/alcohol input; water tab reuses existing `useIntake("water")` hook unchanged
4. `FoodSaltCard` (NEW) — Unified food+salt with AI parsing; calls existing `/api/ai/parse`, routes response through composable entry service
5. `TextMetrics` (NEW) — Pure read component aggregating existing intake and substance query hooks
6. `/api/ai/substance-lookup` (NEW) — Returns `per100ml` and `defaultVolumeMl` for preset creation; follows exact pattern of `/api/ai/substance-enrich`
7. Liquid presets in Zustand (NEW state slice) — `liquidPresets: LiquidPreset[]` with CRUD actions; `isDefault: true` for built-in presets

**Files removed:** `intake-card.tsx`, `food-calculator.tsx` (replaced by LiquidsCard and FoodSaltCard).

See `.planning/research/ARCHITECTURE.md` for full patterns including service code samples, data flow diagrams, and Dexie v15 schema.

### Critical Pitfalls

1. **Forgetting tables in Dexie transaction declarations** — If composable entry service writes to a table not declared in `db.transaction('rw', [tables], ...)`, that write runs outside the transaction and survives rollback as an orphaned record. Prevention: define a `COMPOSABLE_TABLES` constant and use it in every transaction; write a test that verifies zero records exist after a mid-transaction failure.

2. **Calling external APIs inside a Dexie transaction** — Any `fetch()` or non-Dexie `await` inside a transaction closes the IndexedDB transaction silently (Safari is especially aggressive). Subsequent writes start a new implicit transaction. Prevention: gather all AI data outside the transaction, then write everything atomically in a single pass.

3. **Soft delete vs hard delete inconsistency** — `deleteSubstanceRecord` uses soft delete (`deletedAt`), but `deleteIntakeRecord` uses hard delete (`db.intakeRecords.delete(id)`). Building cascading delete on top of mixed behavior creates irrecoverable partial deletes. Prevention: standardize intake records to soft delete before building composable entry service.

4. **useLiveQuery split queries create reactivity gaps** — Fetching composable entry data across 3 tables in separate `useLiveQuery` hooks means each hook re-fires independently. After an atomic transaction, the UI briefly shows stale data from one table while another has already updated. Prevention: single `useLiveQuery` callback that queries all 3 tables in one pass.

5. **AI substance estimates are medically relevant but LLMs have ~35% MAPE** — This user tracks caffeine with heart conditions and titration plans. An estimate that is off 2x could influence medical decisions. Prevention: AI estimates are suggestions only, always shown with an edit affordance before saving; per-100ml bounds enforced via Zod (0-200mg caffeine per 100ml); presets (confirmed user values) override AI on repeat entries.

See `.planning/research/PITFALLS.md` for full pitfall analysis including moderate/minor pitfalls and phase-specific warnings.

## Implications for Roadmap

Based on combined research, the architecture research's suggested build order provides the clearest phase structure. Dependencies flow strictly from data layer to service layer to UI layer to integration, with text metrics and quick UI wins parallelizable at multiple points.

### Phase 1: Data Foundation
**Rationale:** Every subsequent phase depends on the schema migration and composable entry service being correct and tested. Building UI on a broken data layer wastes effort and risks hard-to-detect orphaned records. This phase has zero UI risk and all work is testable with `fake-indexeddb`.
**Delivers:** Dexie v15 schema (`groupId` on 3 tables), `composable-entry-service.ts` (`addComposableEntry`, `deleteEntryGroup`, `getEntryGroup`), `use-composable-entry.ts` hooks, soft-delete standardization for `deleteIntakeRecord`.
**Addresses:** Composable entry data model (FEATURES.md P1), cascading delete (FEATURES.md P1)
**Avoids:** Pitfall 1 (transaction table omission), Pitfall 4 (migration corruption), Pitfall 6 (soft/hard delete inconsistency)
**Research flag:** SKIP — Dexie patterns are well-documented; ARCHITECTURE.md contains complete service implementation.

### Phase 2: Presets and AI Lookup
**Rationale:** Coffee and alcohol tabs need preset data to be useful. The AI lookup route is independently testable via curl before any UI exists. Separating this from UI means preset CRUD is stable before UI binds to it.
**Delivers:** `liquidPresets` Zustand state slice (migrated from `COFFEE_PRESETS`), default preset seeding from existing coffee presets, `/api/ai/substance-lookup` route with Zod validation and per-100ml response schema.
**Addresses:** Beverage presets (FEATURES.md P1), AI substance lookup (FEATURES.md P1), volume-based substance calculation (FEATURES.md P2)
**Avoids:** Pitfall 5 (AI inaccuracy — per-100ml Zod bounds, confirmation UX), Pitfall 7 (no fetch inside transactions)
**Research flag:** SKIP — follows existing API route pattern exactly; Zustand pattern established in `settings-store.ts`.

### Phase 3: Unified Input Cards
**Rationale:** With data layer and presets stable, new card components can be built and tested independently before swapping into the dashboard. LiquidsCard water tab is a pure structural refactor; coffee/alcohol tabs are net new. FoodSaltCard replaces two existing cards and introduces the composable entry confirmation UX.
**Delivers:** `LiquidsCard` (water/coffee/alcohol tabs), `FoodSaltCard` (food+salt with AI-linked composable entries and preview before confirm), `TextMetrics` (daily/weekly text summary replacing intake page graphs).
**Addresses:** Unified Liquids card (FEATURES.md P1), Unified Food+Salt card (FEATURES.md P1), Text metrics (FEATURES.md P1), food AI linked entries (FEATURES.md P2)
**Avoids:** Pitfall 3 (single `useLiveQuery` per composable display), Pitfall 8 (`undefined` default value for loading state), Pitfall 11 (consider unified AI parse endpoint to avoid inconsistent multi-call estimates)
**Research flag:** NEEDS RESEARCH — the composable entry preview/confirmation UX has no existing pattern in the codebase; also evaluate whether food card should make one unified Perplexity call (returning water + salt + caffeine + alcohol) vs two sequential calls.

### Phase 4: Dashboard Integration and Cleanup
**Rationale:** Component swap — old cards out, new cards in. BP heart rate visibility fix is trivially small and unrelated to composable entries; bundle it here to close all remaining UI items in one phase. Coffee settings migration is cleanup that only makes sense after LiquidsCard is stable.
**Delivers:** Updated `page.tsx` (LiquidsCard, FoodSaltCard, TextMetrics, health cards in new order), BP heart rate always visible, removal of `intake-card.tsx` and `food-calculator.tsx`, `COFFEE_PRESETS` constant deprecated.
**Addresses:** BP heart rate visible (FEATURES.md P1), food calculator removal (FEATURES.md P1), coffee settings migration (FEATURES.md P2)
**Avoids:** Water tab regression (zero-friction UX preserved exactly), Pitfall 9 (source field naming conventions for composable-created records)
**Research flag:** SKIP — dashboard wiring is straightforward; BP card change is a pure UI simplification.

### Phase Ordering Rationale

- Data layer before UI is non-negotiable: FEATURES.md states "Composable Entry Data Model is the foundation" and "must be the first thing built." Three of the five critical pitfall categories trace back to service layer correctness.
- Presets before UI: coffee/alcohol tabs render nothing useful without presets. Building the Zustand slice and AI route first means UI binds to stable data, not in-progress mutation logic.
- Text metrics built in Phase 3 alongside cards because they are architecturally independent — FEATURES.md confirms "Text Metrics are independent — can be built in parallel." They query existing records via existing hooks, no dependency on composable entries.
- Dashboard integration last minimizes the window where the app is in a broken state. The swap happens once all new components are tested.

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Unified Input Cards):** The composable entry preview/confirmation UX (showing user all linked records before committing) has no existing pattern in the codebase — needs design decision (bottom sheet drawer via existing `vaul`, or inline expandable within the card). Also, Pitfall 11 raises whether the food card AI should make one unified Perplexity call vs two sequential calls — this affects API surface area.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Data Foundation):** ARCHITECTURE.md provides complete service implementation; Dexie patterns are verified with 25+ existing examples in codebase.
- **Phase 2 (Presets and AI):** New API route follows existing `/api/ai/substance-enrich` pattern exactly; Zustand slice follows existing `settings-store.ts` pattern.
- **Phase 4 (Dashboard Integration):** Component wiring and BP card simplification are straightforward; no novel patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies; all recommendations verified against installed packages and existing codebase patterns. Dexie 4.x compatibility confirmed. |
| Features | MEDIUM | Competitor analysis from App Store listings and community forums. Feature set is clear; exact UX flows for composable entry confirmation need validation during Phase 3 planning. |
| Architecture | HIGH | Based primarily on existing codebase inspection (25+ transaction examples, 4 existing linking patterns). IndexedDB undefined-in-index behavior confirmed against spec. Complete service implementation provided in ARCHITECTURE.md. |
| Pitfalls | HIGH | Pitfalls 1, 3, 7 verified against Dexie GitHub issues and IndexedDB spec. Pitfall 6 (soft/hard delete) directly verified from `substance-service.ts` vs `intake-service.ts` source code. AI accuracy (Pitfall 5) backed by two peer-reviewed studies. |

**Overall confidence:** HIGH

### Gaps to Address

- **Unified AI parse endpoint design (Phase 3):** PITFALLS.md identifies that using two sequential AI calls (parse for water/salt, substance-enrich for caffeine/alcohol) risks inconsistent volume estimates and double latency. Evaluate a unified endpoint during Phase 3 planning. If unified, requires a new Zod schema combining water + salt + caffeine + alcohol response fields.
- **Composable entry preview/confirmation UX (Phase 3):** No existing UI pattern in the codebase for "here are 3 records about to be created, edit or toggle each one before confirming." Needs a design decision during Phase 3 planning — bottom sheet drawer (existing `vaul`) or inline expandable within the card.
- **`parentEntryId` vs `groupId` naming (Phase 1):** PITFALLS.md recommends `parentEntryId` for unambiguous parent-child direction; STACK.md and ARCHITECTURE.md use `groupId`. Reconcile during Phase 1 planning. The functional difference: `parentEntryId` implies a parent entity exists (would require a parent table), while `groupId` is a shared key with no required parent record. Research files lean toward `groupId` (no parent table), which is the correct choice — confirm at plan time.
- **Backup/restore integrity for groupId links (future):** PITFALLS.md notes that backup format exports tables independently. GroupId links break if composable entry records are split across tables during restore. Not blocking for v1.1 (single-user, no cross-device sync), but flag for any future backup/sync milestone.

## Sources

### Primary (HIGH confidence)
- Existing codebase — `substance-service.ts`, `intake-service.ts`, `settings-store.ts`, `db.ts`, `constants.ts`, `use-substance-queries.ts`, `use-intake-queries.ts`, `/api/ai/substance-enrich/route.ts`, `/api/ai/parse/route.ts`
- [Dexie.js transaction() documentation](https://dexie.org/docs/Dexie/Dexie.transaction()) — multi-table transaction API and auto-close behavior
- [Dexie.js cascade on delete discussion #1932](https://github.com/dexie/Dexie.js/issues/1932) — confirms no built-in cascade, recommends transaction pattern
- [Dexie.js useLiveQuery multi-table observation #2090](https://github.com/dexie/Dexie.js/issues/2090) — single callback observes all tables touched
- [IndexedDB specification — transaction auto-commit](https://javascript.info/indexeddb) — fetch() closes transactions
- [DietAI24 LLM nutrition accuracy study](https://www.nature.com/articles/s43856-025-01159-0) — ~35% MAPE for LLM nutritional estimates
- [LLM nutritional estimation MAPE evaluation](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/) — second independent study confirming LLM nutrition accuracy range
- [Dexie.js releases](https://github.com/dexie/Dexie.js/releases) — v4.3.0 confirmed, no breaking changes from v4.0.8

### Secondary (MEDIUM confidence)
- [FoodNoms 2 feature overview](https://foodnoms.com/news/foodnoms-2) — preset and one-tap logging patterns
- [WaterMinder caffeine tracking](https://9to5mac.com/2021/04/07/waterminder-app-adds-support-for-tracking-caffeine-intake-with-apple-health-integration/) — competitor feature set
- [Cronometer water tracking docs](https://support.cronometer.com/hc/en-us/articles/18020279636628-Water-Tracking) — how competitors handle linked water from food
- [MacStories FoodNoms review](https://www.macstories.net/reviews/foodnoms-a-privacy-focused-food-tracker-with-innovative-new-ways-to-log-meals/) — competitor UX patterns

### Tertiary (LOW confidence)
- [Caffeine Informer](https://www.caffeineinformer.com/) — caffeine content reference data (used for static fallback table values, not architectural decisions)
- App Store listings (HiCoffee, Caffeine++) — feature enumeration only

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*

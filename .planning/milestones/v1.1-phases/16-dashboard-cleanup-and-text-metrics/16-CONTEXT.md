# Phase 16: Dashboard Cleanup and Text Metrics - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Dashboard reorganization: BP heart rate always visible, food calculator fully removed, text metrics replacing inline graphs, coffee settings migrated to liquid presets manager, card reordering, dead code cleanup. Also: extend LiquidPreset model to support multi-substance presets (caffeine + alcohol + salt + water content percentage — all optional, composable).

</domain>

<decisions>
## Implementation Decisions

### Text Metrics Display
- **D-01:** Text metrics section sits at the top of the intake page, above all cards. Acts as a dashboard overview visible without scrolling.
- **D-02:** Format: value / limit with thin colored progress bars. E.g., "Water: 1,200 / 2,000 ml" with a progress bar. Similar to Apple Health summary style.
- **D-03:** Metrics shown: today's water progress (vs limit), today's salt progress (vs limit), today's caffeine total, today's alcohol total, weekly summary (Monday-start) for water and salt.
- **D-04:** Replaces the `HistoricalGraph` component currently on page.tsx. Graphs move to the insights/analytics page in a future milestone.

### Dead Code Cleanup
- **D-05:** Full removal — delete all replaced/unused UI components and their references:
  - `food-calculator.tsx` + all references (quick-nav-footer callbacks, etc.)
  - `eating-card.tsx` (replaced by FoodSaltCard food section)
  - `voice-input.tsx` (replaced by inline AI text inputs in LiquidsCard and FoodSaltCard)
  - `parsed-intake-display.tsx` (replaced by ComposablePreview)
  - `historical-graph.tsx` + sub-charts (IntakeChart, WeightChart, BPChart, MetricsSection) — replaced by text metrics; graphs move to insights page later
  - Old `intake-card.tsx` if no longer used (check if salt still references it — SaltSection replaced it)
  - `customization-panel.tsx` Coffee Tab → replaced by Liquid Presets manager

### Coffee Settings Migration
- **D-06:** CustomizationPanel Coffee Tab becomes a "Liquid Presets" tab. Shows all presets (coffee + alcohol + beverage) with add/edit/delete. Replaces the old `coffeeDefaultType` single-value setting.
- **D-07:** The `coffeeDefaultType` field in settings store can be deprecated/removed. Default preset selection is handled by the `liquidPresets` array with `isDefault` flag.

### BP Heart Rate
- **D-08:** Heart rate input moves from the collapsible "More options" section to the primary input area alongside Systolic/Diastolic. The collapsible remains for optional fields (position, arm, irregular heartbeat).

### Card Ordering
- **D-09:** Cards on the intake page appear in order: Text Metrics (top) → Liquids → Food+Salt → BP → Weight → Urination → Defecation.

### Multi-Substance Preset Model
- **D-10:** LiquidPreset interface extended with composable substance fields — ALL optional, any combination valid:
  - `caffeinePer100ml?: number` — mg caffeine per 100ml
  - `alcoholPer100ml?: number` — standard drinks per 100ml
  - `saltPer100ml?: number` — mg sodium per 100ml
  - `waterContentPercent: number` — percentage of volume that is water (default 100, e.g., espresso=98, Don Pedro=40)
  - `tab: "coffee" | "alcohol" | "beverage"` — which Liquids card tab the preset appears in
- **D-11:** When logging a multi-substance preset, the composable entry service creates linked records for ALL present substances (caffeine + alcohol + salt + water), calculated from volume * per-100ml values. Water amount = volume * waterContentPercent / 100.
- **D-12:** The old `substancePer100ml` single field on `LiquidPreset` is replaced by the individual per-100ml fields. Zustand persist migration handles the conversion.

### Claude's Discretion
- Text metrics component name and internal structure
- Progress bar styling (thin, colored per metric domain)
- Weekly summary format (table, stacked rows, etc.)
- Which sub-chart files to delete vs keep for insights page migration
- InsightBadge placement (keep at top or move into text metrics)
- Zustand persist migration version bump (v2 → v3)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Components to Modify
- `src/components/blood-pressure-card.tsx` — Heart rate in collapsible (lines 282-303), needs to move to primary area (lines 210-243)
- `src/app/page.tsx` — Dashboard layout, card ordering, HistoricalGraph removal
- `src/components/customization-panel.tsx` — Coffee Tab (lines 100-131) → Liquid Presets manager
- `src/stores/settings-store.ts` — `coffeeDefaultType` deprecation, `liquidPresets` LiquidPreset interface update, persist migration

### Components to Delete
- `src/components/food-calculator.tsx` — Unused after Phase 15
- `src/components/eating-card.tsx` — Replaced by FoodSaltCard
- `src/components/voice-input.tsx` — Replaced by inline AI inputs
- `src/components/parsed-intake-display.tsx` — Replaced by ComposablePreview
- `src/components/historical-graph.tsx` + sub-charts — Replaced by text metrics
- `src/components/quick-nav-footer.tsx` — FoodCalculator/VoiceInput callback references to clean

### Data Layer
- `src/lib/constants.ts` — `LiquidPreset` interface (needs multi-substance fields)
- `src/hooks/use-intake-queries.ts` — `useDailyIntakeTotal("water")`, `useDailyIntakeTotal("salt")` for text metrics
- `src/hooks/use-substance-queries.ts` — `useSubstanceRecords("caffeine")`, `useSubstanceRecords("alcohol")` for text metrics
- `src/lib/composable-entry-service.ts` — Multi-substance logging when preset has caffeine + alcohol + salt

### Phase 14 Pattern
- `src/components/liquids/preset-tab.tsx` — Current preset logging flow, needs update for multi-substance model

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useDailyIntakeTotal("water")` / `useDailyIntakeTotal("salt")` — reactive daily totals from existing hooks
- `useSubstanceRecords("caffeine")` / `useSubstanceRecords("alcohol")` — reactive substance records
- `Progress` component from shadcn/ui — thin progress bar for metrics
- `useSettingsStore` — waterLimit, saltLimit for progress calculation

### Established Patterns
- `useLiveQuery` for all reads (no manual refresh needed for text metrics)
- Card ordering via JSX element order in page.tsx
- Zustand persist migration pattern (v1→v2 done in Phase 13)

### Integration Points
- Text metrics component reads from existing hooks (no new services needed)
- Multi-substance preset logging flows through existing `addComposableEntry()` — just needs richer input
- PresetTab in LiquidsCard needs update to handle multi-substance presets

</code_context>

<specifics>
## Specific Ideas

- User said "I just want simple written metrics" — not charts, not complex visualizations
- Don Pedro example: espresso + coffee liqueur + cream = caffeine + alcohol + reduced water content. Presets must handle this composably.
- User preference: "lean towards flexible, composable more than explicit" — all substance fields optional on presets, any combination valid
- Salt per 100ml also relevant (margarita rim salt, salty beverages, bouillon)

</specifics>

<deferred>
## Deferred Ideas

- Move HistoricalGraph to insights/analytics page — separate milestone per original discussion
- Smart preset suggestions sorted by usage frequency — needs usage data accumulation

</deferred>

---

*Phase: 16-dashboard-cleanup-and-text-metrics*
*Context gathered: 2026-03-24*

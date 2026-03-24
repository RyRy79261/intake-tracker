# Phase 14: Unified Liquids Card - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current `IntakeCard` (water type) with a new `LiquidsCard` component featuring 4 tabs: Water, Beverage, Coffee, Alcohol. Water tab preserves existing +/- increment UX with minor polish allowed. Beverage tab is water-style volume input + name field. Coffee and Alcohol tabs use preset grid + inline text input with AI lookup + volume/substance fields + Log/Save&Log buttons. Substance amounts auto-calculated from volume * per-100ml preset data.

</domain>

<decisions>
## Implementation Decisions

### Tab Structure
- **D-01:** 4 tabs: Water / Beverage / Coffee / Alcohol. Radix Tabs component from shadcn/ui.
- **D-02:** Water tab is always the default on card mount — no tab persistence across navigations.
- **D-03:** Juice and food liquid types removed from this card. Food input moves to Food+Salt card (Phase 15). Juice-like drinks use the Beverage tab.

### Beverage Tab
- **D-04:** Beverage tab has water-style +/- increment buttons for volume, plus a text field for drink name. Logged as a water intake record with a source tag (e.g., `beverage:{name}`). No substance tracking.

### Coffee/Alcohol Tab Layout
- **D-05:** Preset grid (2-column) at the top of the tab. Tapping a preset fills the volume/substance fields below.
- **D-06:** Below the grid: an inline text input with an AI icon button at the right end. Type a beverage name, tap the AI icon — it disables the input and shows a spinner in the button while looking up. Result populates the volume/substance fields.
- **D-07:** The text input is dual-purpose: type a name + tap AI for lookup, OR type a name + manually fill per-100ml/volume fields without AI. Both paths available.
- **D-08:** Below the text input: volume field (editable, pre-filled from preset or AI), calculated substance amount display (caffeine mg or alcohol standard drinks), and per-100ml field (editable for manual entry or AI correction).
- **D-09:** Two action buttons: "Log" (logs intake + substance record this time only) and "Save & Log" (saves as a new preset for future one-tap use, then logs). Per Phase 13 D-10, explicit confirmation required before saving as preset.

### Water Tab
- **D-10:** Water tab is a lift of the current IntakeCard water UX with minor polish allowed from the new card structure. Core elements preserved: +/- increment buttons, pending amount display, center-tap manual input dialog, daily total with limit warning, rolling 24h total.

### Substance Calculation
- **D-11:** When logging coffee or alcohol, auto-calculate substance amount: `(volumeMl / 100) * preset.substancePer100ml`. Display the calculated amount before confirming. Creates an intake record + linked substance record atomically (existing substance-service pattern).

### Claude's Discretion
- Exact component decomposition (LiquidsCard → WaterTab, BeverageTab, CoffeeTab, AlcoholTab or shared PresetTab)
- Whether CoffeeTab and AlcoholTab share a common PresetTab component with type prop
- Tab switching animation (if any)
- Grid button visual design (how to show preset name + volume compactly)
- How the calculated substance amount is displayed (inline text, badge, etc.)
- Loading/error states for AI lookup
- Whether to show the per-100ml field always or only after AI lookup / manual entry

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Components to Replace
- `src/components/intake-card.tsx` — Current intake card with water/juice/coffee/food liquid types. This is being replaced by LiquidsCard. Study the water UX to preserve it.

### Data Layer (Phase 12-13 outputs)
- `src/lib/composable-entry-service.ts` — Atomic cross-table writes with groupId linking
- `src/hooks/use-composable-entry.ts` — Reactive hooks for composable groups
- `src/stores/settings-store.ts` — `liquidPresets` CRUD actions, `LiquidPreset` interface
- `src/lib/constants.ts` — `DEFAULT_LIQUID_PRESETS`, `LiquidPreset` type definition

### AI Route
- `src/app/api/ai/substance-lookup/route.ts` — Returns caffeinePer100ml or alcoholPer100ml for a beverage name

### Substance Layer
- `src/lib/substance-service.ts` — `addSubstanceRecord()` creates substance + linked intake atomically
- `src/hooks/use-substance-queries.ts` — Mutation hooks for substance operations

### UI Components
- `src/components/ui/tabs.tsx` — Radix Tabs (TabsList, TabsTrigger, TabsContent)
- `src/components/medications/undo-toast.tsx` — `showUndoToast()` for delete undo

### Dashboard
- `src/app/page.tsx` — Dashboard layout, where IntakeCard is rendered (will swap to LiquidsCard)

### Milestone Research
- `.planning/research/FEATURES.md` — Beverage preset UX patterns, competitor analysis
- `.planning/research/ARCHITECTURE.md` — LiquidsCard component architecture, integration points

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `IntakeCard` water UX — +/- buttons, pending amount, manual input dialog, limit warnings. Lift into WaterTab.
- `CARD_THEMES` — existing theme entries for caffeine (yellow) and alcohol (fuchsia) card colors
- `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` — Radix tabs already installed and styled
- `showUndoToast()` — 5-second undo pattern, already wired to intake/eating deletes
- `useSettingsStore` — liquidPresets array with CRUD, coffeeDefaultType, waterIncrement, waterLimit
- `addSubstanceRecord()` — creates substance + linked intake atomically when volumeMl provided

### Established Patterns
- `useLiveQuery` for all reads, `useMutation`/`useCallback` for writes
- `source` field format: `"coffee:{type}"`, `"substance:{id}"`, `"beverage:{name}"`
- `formatAmount()` for volume display, `formatPillCount()` for fractional displays
- Cards use `max-w-lg` container, touch-friendly button sizing

### Integration Points
- Replace `<IntakeCard type="water" ... />` in dashboard page.tsx with `<LiquidsCard />`
- Remove separate `<SubstanceRow type="caffeine" />` and `<SubstanceRow type="alcohol" />` — substance logging moves into LiquidsCard coffee/alcohol tabs
- `useIntake("water")` hook feeds the water tab
- `useSettingsStore(s => s.liquidPresets)` feeds the preset grids

</code_context>

<specifics>
## Specific Ideas

- AI icon next to text input, not a floating button — inline search-bar style with sparkle/AI icon that shows spinner on tap
- Text input is dual-purpose: AI lookup OR manual entry with self-filled fields
- "Save & Log" vs just "Log" — two distinct buttons, user chooses whether to persist as preset
- User said "I like the water one" — water tab UX is the gold standard, preserve it
- Beverage tab is intentionally simple: water-style volume + name, no substance tracking

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-unified-liquids-card*
*Context gathered: 2026-03-24*

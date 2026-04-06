# Phase 37: Water Entry Label Formatting Bug - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix water entry labels displaying raw internal source strings (`"preset:manual"`, `"substance:{id}"`) instead of clean human-readable text. The bug is in `getLiquidTypeLabel()` which doesn't handle `preset:*` and `substance:*` source prefixes.

</domain>

<decisions>
## Implementation Decisions

### Label text for preset-sourced entries
- **D-01:** Look up the preset by ID from the settings store and display the preset's beverage name (e.g., "Flat White", "Orange Juice")
- **D-02:** If the preset has been deleted or is not found, fall back to displaying "Beverage"
- **D-03:** `preset:manual` (no specific preset selected) should return null (same as plain water — no label annotation)

### Label text for substance-sourced entries
- **D-04:** Look up the parent substance record by ID from Dexie and display its `description` field (e.g., "Coca-Cola", "Green Tea")
- **D-05:** If the substance record is not found, fall back to displaying "Drink"

### Fallback for unknown source formats
- **D-06:** Change the default fallback in `getLiquidTypeLabel()` from `return source` to `return null` — prevents any raw internal strings from ever reaching the UI

### Claude's Discretion
- Whether `getLiquidTypeLabel` becomes async (for substance DB lookup) or whether the description is passed through the record itself
- How to thread the preset name from settings store into the label function
- Whether to add unit tests for the new source format handling

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Key source files
- `src/lib/utils.ts` lines 47-64 — `getLiquidTypeLabel()` function (the bug location)
- `src/components/history/record-row.tsx` line 31 — history drawer usage
- `src/components/liquids/water-tab.tsx` line 224 — water card recent entries usage
- `src/components/liquids/preset-tab.tsx` lines 160-172 — where `preset:*` source values are written
- `src/lib/composable-entry-service.ts` line 133 — where `substance:*` source values are written
- `src/lib/substance-service.ts` line 46 — where `substance:*` source values are written
- `src/stores/settings-store.ts` — LiquidPreset definitions (preset name lookup)
- `src/lib/db.ts` — substanceRecords table (substance description lookup)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getLiquidTypeLabel()` in `src/lib/utils.ts` — already handles `coffee:*`, `juice:*`, `food:*` prefixes; needs extension for `preset:*` and `substance:*`
- `useSettings()` hook — provides access to liquid presets in the settings store
- Dexie `db.substanceRecords` — table for substance lookups by ID

### Established Patterns
- `getLiquidTypeLabel` is a synchronous function returning `string | null`
- Water-tab and record-row both call it the same way — fix in the function fixes both call sites
- Source strings follow `prefix:value` convention throughout

### Integration Points
- `getLiquidTypeLabel` is called from two components; both pass `record.source`
- Settings store presets are accessible synchronously via Zustand
- Substance records require Dexie async lookup (may need approach change or pre-resolution)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 37-water-entry-label-formatting-bug*
*Context gathered: 2026-04-06*

# Phase 37: Water Entry Label Formatting Bug - Research

**Researched:** 2026-04-06
**Phase:** 37-water-entry-label-formatting-bug
**Focus:** How `getLiquidTypeLabel()` should handle `preset:*` and `substance:*` source prefixes

## Bug Analysis

### Root Cause

`getLiquidTypeLabel()` in `src/lib/utils.ts` (lines 47-64) handles `coffee:*`, `juice:*`, and `food:*` prefixes but has no handling for `preset:*` or `substance:*` prefixes. The final fallback is `return source`, which passes raw internal strings like `"preset:manual"` or `"substance:abc123"` directly to the UI.

### Source Value Formats Encountered

| Source Value | Origin | Current Output | Expected Output |
|---|---|---|---|
| `"manual"` | Plain water entry | `null` (correct) | `null` |
| `"coffee:latte"` | Coffee preset (legacy) | `"Latte"` (correct) | `"Latte"` |
| `"juice:orange"` | Juice entry | `"Orange"` (correct) | `"Orange"` |
| `"food:apple"` | Food entry | `"Food (apple)"` (correct) | `"Food (apple)"` |
| `"preset:manual"` | Preset tab, no specific preset | `"preset:manual"` (BUG) | `null` |
| `"preset:{uuid}"` | Preset tab, specific preset | `"preset:abc-123"` (BUG) | `"Flat White"` etc. |
| `"substance:{uuid}"` | Substance service | `"substance:abc-123"` (BUG) | `"Coca-Cola"` etc. |

### Call Sites

1. **`src/components/liquids/water-tab.tsx` line 224** — renders recent water entries in the water tab card
2. **`src/components/history/record-row.tsx` line 31** — renders water entries in the history drawer

Both call `getLiquidTypeLabel(record.source)` and display the result as a badge/annotation beside the amount.

## Technical Findings

### Substance Records: `note` Field Already Contains Description

When a substance-linked water record is created (in both `composable-entry-service.ts:134` and `substance-service.ts:47`), the `note` field is populated with `input.description` (e.g., "Coca-Cola", "Green Tea"). This means:

- **No async Dexie lookup is needed** for substance labels
- The description is already available on the IntakeRecord itself
- `getLiquidTypeLabel` can accept the record's `note` field as a fallback parameter

### Preset Records: Name Available from Settings Store

Preset water records are created with `source: preset:{selectedPresetId}` in `preset-tab.tsx:172`. The preset name (e.g., "Flat White") is available from `useSettings().liquidPresets` — a synchronous Zustand store.

However, `getLiquidTypeLabel` is a pure utility function with no store access. Options:

1. **Pass presets array as parameter** — `getLiquidTypeLabel(source, presets?, note?)` keeps the function pure and testable
2. **Pass note as fallback** — For preset entries, also write the beverage name to `record.note` at creation time (already done for substance records)
3. **Read store inside function** — Breaks purity, harder to test

**Recommended: Option 1** — Extend the function signature with optional parameters. Both call sites already have access to the settings store (water-tab imports `useSettings`, record-row can thread it through). The function stays synchronous and pure.

### Preset `note` Field

Checking whether preset water records already populate the `note` field:

In `preset-tab.tsx`, the `buildComposableEntry()` function (line 153) creates intakes with `source: preset:{id}` but does NOT set a `note` field on the water intake. So we cannot rely on `note` for preset-sourced records without also fixing the creation path.

**Two-pronged approach recommended:**
- Fix `getLiquidTypeLabel` to accept optional `presets` and `note` parameters for display
- Also fix preset record creation to write `beverageName` to `note` field (future-proofing for any path that reads `note`)

## Approach Recommendation

### Minimal Change (Display-Only Fix)

Extend `getLiquidTypeLabel` signature:

```typescript
export function getLiquidTypeLabel(
  source?: string,
  options?: { presets?: LiquidPreset[]; note?: string }
): string | null
```

Logic additions:
1. `preset:manual` → return `null`
2. `preset:{id}` → look up `id` in `options.presets`, return preset `name` or `"Beverage"` fallback
3. `substance:{id}` → return `options.note` (already the description) or `"Drink"` fallback
4. Default fallback → `return null` (D-06: never leak raw strings)

### Call Site Updates

- **water-tab.tsx**: Already has `useSettings()` — pass `settings.liquidPresets` and `record.note`
- **record-row.tsx**: Needs presets threaded in. The `RecordRow` component receives `UnifiedRecord` — can add presets via prop or context.

## Risk Assessment

- **Low risk**: Change is scoped to one utility function and two call sites
- **No async changes needed**: All data is available synchronously
- **No DB migration**: No schema changes
- **Backward compatible**: New parameters are optional, existing calls still work

## Validation Architecture

### Dimension 1: Functional Correctness
- `getLiquidTypeLabel("preset:manual")` returns `null`
- `getLiquidTypeLabel("preset:abc", { presets: [{ id: "abc", name: "Flat White", ... }] })` returns `"Flat White"`
- `getLiquidTypeLabel("preset:missing", { presets: [] })` returns `"Beverage"`
- `getLiquidTypeLabel("substance:xyz", { note: "Coca-Cola" })` returns `"Coca-Cola"`
- `getLiquidTypeLabel("substance:xyz")` returns `"Drink"`
- `getLiquidTypeLabel("unknown:foo")` returns `null`
- All existing prefixes (`coffee:*`, `juice:*`, `food:*`) still work unchanged

### Dimension 2: Integration
- Water tab recent entries show preset names instead of raw strings
- History drawer shows preset/substance names instead of raw strings

### Dimension 3: Regression
- Existing source formats (`manual`, `coffee:*`, `juice:*`, `food:*`) produce identical output
- The default fallback change from `return source` to `return null` prevents any future unknown source formats from leaking

---

## RESEARCH COMPLETE

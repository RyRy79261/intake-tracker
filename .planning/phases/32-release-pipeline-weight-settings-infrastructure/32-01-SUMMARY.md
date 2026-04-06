# Plan 32-01 Summary: Decimal Precision Pipeline + Weight Settings UI

**Status:** Complete
**Duration:** ~5 min
**Commits:** 4

## What Was Built

Fixed the entire decimal precision pipeline for weight tracking and created a new weight settings UI section.

### Changes

1. **`src/lib/security.ts`** — `sanitizeNumericInput` now uses `parseFloat` instead of `parseInt`, with an optional `precision` parameter for decimal rounding. Backward-compatible: all existing integer callers produce identical results.

2. **`src/lib/settings-helpers.ts`** — `validateAndSave` now uses `parseFloat` instead of `parseInt` so decimal input strings like "0.05" are preserved.

3. **`src/stores/settings-store.ts`** — Default `weightIncrement` changed from 0.1 to 0.05. `setWeightIncrement` uses `sanitizeNumericInput(value, 0.05, 1, 2)` for proper decimal sanitization.

4. **`src/components/weight-card.tsx`** — Rounding changed from `*10/10` to `*100/100` for 2-decimal precision. Display changed from `.toFixed(1)` to `.toFixed(2)` in all 4 locations (toast, center display, latest weight, history entries).

5. **`src/components/settings/weight-settings-section.tsx`** — New component with Scale icon (emerald color), single increment control (0.05-1.00 kg, step 0.05), following water/salt settings pattern.

6. **`src/app/settings/page.tsx`** — Added WeightSettingsSection import and rendered between SaltSettingsSection and SubstanceSettingsSection.

## Key Files

### Created
- `src/components/settings/weight-settings-section.tsx`

### Modified
- `src/lib/security.ts`
- `src/lib/settings-helpers.ts`
- `src/stores/settings-store.ts`
- `src/components/weight-card.tsx`
- `src/app/settings/page.tsx`

## Deviations

None — all changes matched the plan exactly.

## Self-Check: PASSED

- `pnpm build` exits 0
- All 393 tests pass
- `parseFloat` in security.ts and settings-helpers.ts
- `weightIncrement: 0.05` in settings store defaults
- `* 100) / 100` rounding in weight-card.tsx
- `.toFixed(2)` in all weight display locations
- WeightSettingsSection between Salt and Substance in settings page

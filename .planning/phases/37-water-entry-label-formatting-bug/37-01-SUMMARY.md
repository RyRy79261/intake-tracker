# Plan 37-01 Summary: Water Entry Label Formatting Fix

**Status:** Complete
**Duration:** ~5 min
**Commits:** 3

## What was built

Extended `getLiquidTypeLabel()` in `src/lib/utils.ts` to handle `preset:*` and `substance:*` source prefixes that previously leaked raw internal strings (e.g., "preset:manual", "substance:abc123") to the UI.

### Changes

1. **`src/lib/utils.ts`** — Added `preset:*` and `substance:*` handlers to `getLiquidTypeLabel()`. Function now accepts optional `{ presets, note }` parameter. `preset:manual` returns null, `preset:{id}` looks up preset name (falls back to "Beverage"), `substance:{id}` uses note field (falls back to "Drink"). Default fallback changed from `return source` to `return null`.

2. **`src/components/liquids/water-tab.tsx`** — Passes `liquidPresets` from settings store and `record.note` to `getLiquidTypeLabel`.

3. **`src/components/history/record-row.tsx`** — Added `liquidPresets` prop, passes it with `record.note` to `getLiquidTypeLabel`.

4. **`src/components/history-drawer.tsx`** — Added `useSettings()` hook, passes `settings.liquidPresets` to RecordRow.

5. **`src/components/analytics/records-tab.tsx`** — Added `useSettings()` hook, passes `settings.liquidPresets` to RecordRow.

## Key decisions

- Kept `getLiquidTypeLabel` synchronous — no async DB lookups needed since substance descriptions are already stored in `record.note`
- Used optional parameter object pattern to maintain backward compatibility
- Added `| undefined` to option types for `exactOptionalPropertyTypes` TS strict mode compatibility

## Verification

- `pnpm build` passes (TypeScript + Next.js)
- All 393 vitest tests pass
- All context decisions (D-01 through D-06) implemented

## Self-Check: PASSED

- [x] All tasks executed
- [x] Each task committed individually (3 commits)
- [x] SUMMARY.md created
- [x] Build passes
- [x] Tests pass

## key-files

### created
(none)

### modified
- `src/lib/utils.ts`
- `src/components/liquids/water-tab.tsx`
- `src/components/history/record-row.tsx`
- `src/components/history-drawer.tsx`
- `src/components/analytics/records-tab.tsx`

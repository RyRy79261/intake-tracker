# Phase 32: Release Pipeline + Weight Settings Infrastructure - Research

**Researched:** 2026-04-06
**Goal:** Understand what needs to change and the safest path to implement decimal precision for weight settings + fix release-please permissions

## Domain 1: Weight Decimal Precision Pipeline

### Current State Analysis

The weight precision bug flows through 4 files in a chain:

1. **`src/lib/security.ts` line 54-58** — `sanitizeNumericInput` uses `parseInt` which truncates decimals:
   ```typescript
   const num = typeof value === 'string' ? parseInt(value, 10) : value;
   return Math.max(min, Math.min(max, Math.round(num)));
   ```
   - `parseInt("0.05", 10)` returns `0` — completely destroying the decimal
   - `Math.round` also rounds to nearest integer, so even if value arrives as `0.05` (number type), it becomes `0`
   - 11 callers in settings-store.ts — all existing callers use integer values EXCEPT `setWeightIncrement` which uses `min=0.1, max=10`

2. **`src/lib/settings-helpers.ts` line 14** — `validateAndSave` uses `parseInt`:
   ```typescript
   const parsed = parseInt(inputValue, 10);
   ```
   - `parseInt("0.05", 10)` returns `0`, failing the `>= min` check (0 < 0.05), reverting to default
   - Used by water-settings-section and salt-settings-section (both integer callers)

3. **`src/stores/settings-store.ts` line 159** — Default `weightIncrement: 0.1`:
   - Line 258: `set({ weightIncrement: sanitizeNumericInput(value, 0.1, 10) })`
   - Due to the `sanitizeNumericInput` bug, `sanitizeNumericInput(0.05, 0.1, 10)` returns `Math.max(0.1, Math.min(10, Math.round(0)))` = `0.1` (clamped to min)
   - The store persist version is currently 4; changing defaults may need version 5 migration

4. **`src/components/weight-card.tsx` lines 94-106** — Rounding uses `*10/10`:
   ```typescript
   const next = Math.round((prev - settings.weightIncrement) * 10) / 10;
   ```
   - With 0.05 increments: `Math.round((70.10 - 0.05) * 10) / 10` = `Math.round(700.5) / 10` = `70.1` (should be 70.05)
   - Need `*100/100` for 2-decimal precision

### Backward Compatibility Analysis

**`sanitizeNumericInput` callers (all in settings-store.ts):**

| Setter | Min | Max | Value Type | Impact of parseFloat |
|--------|-----|-----|------------|---------------------|
| setWaterIncrement | 10 | 1000 | integer | None — integers parse same |
| setSaltIncrement | 10 | 1000 | integer | None |
| setWaterLimit | 100 | 10000 | integer | None |
| setSaltLimit | 100 | 10000 | integer | None |
| setDataRetentionDays | 0 | 365 | integer | None |
| setDayStartHour | 0 | 23 | integer | None |
| setScrollDurationMs | 100 | 1000 | integer | None |
| setAutoHideDelayMs | 0 | 2000 | integer | None |
| setBarTransitionDurationMs | 50 | 500 | integer | None |
| setWeightIncrement | 0.1 | 10 | **decimal** | **FIXES the bug** |

Conclusion: Changing `parseInt` to `parseFloat` is safe — all integer callers produce identical results with `parseFloat`. The `Math.round` needs to become optional (or use a precision parameter) so decimals like 0.05 are not rounded to 0.

### Recommended Fix for sanitizeNumericInput

Add an optional `precision` parameter. When provided, round to that many decimal places instead of integer rounding:

```typescript
export function sanitizeNumericInput(
  value: string | number,
  min = 0,
  max = 100000,
  precision?: number
): number {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || !isFinite(num)) return min;
  const clamped = Math.max(min, Math.min(max, num));
  if (precision !== undefined) {
    const factor = Math.pow(10, precision);
    return Math.round(clamped * factor) / factor;
  }
  return Math.round(clamped);
}
```

This preserves exact backward compatibility: no `precision` arg = `Math.round` = integer. With `precision=2`, `0.05` survives.

### Store Migration Consideration

The settings store is at version 4. Changing the default from 0.1 to 0.05 only affects new users. Existing users with persisted `weightIncrement: 0.1` keep their value — Zustand's persist middleware only applies defaults when the key is missing. No version bump needed just for the default change.

However, users who previously tried to set 0.05 and got silently reverted to 0.1 (due to the parseInt bug) are stuck at 0.1 — this is acceptable since 0.1 is a valid value and they can re-set after the fix.

## Domain 2: Weight Settings UI Component

### Pattern Analysis

`water-settings-section.tsx` and `salt-settings-section.tsx` are identical in structure:
- Import: `useState`, `useEffect`, `Label`, icon, `NumericInput`, `useSettings`, settings-helpers
- Two local state strings for input values (increment + limit)
- useEffect syncs state from settings
- JSX: colored icon+header, indented space-y-3, two NumericInput groups with Labels and helper text

Weight settings needs only ONE control (increment), not two (no "daily limit" for weight). This makes the component simpler.

### NumericInput Component

`src/components/ui/numeric-input.tsx` accepts `step` as a prop and passes it to `<Input type="number" step={step}>`. With `step={0.05}`, the browser's built-in stepper will work correctly. The `onIncrement`/`onDecrement` callbacks are separate from the HTML step — they call settings-helpers which handle the actual value changes.

### Placement on Settings Page

Current settings page order: Account, Day, Water, Salt, Substance, Appearance, QuickNav, DataManagement, PrivacySecurity, Permissions, AppUpdates, Customization, Debug, Reset/About.

Weight belongs near Water and Salt since they're all intake-related. Placing after Salt and before Substance keeps intake sections grouped.

## Domain 3: Release-Please Fix

### Current Workflow

`.github/workflows/release-please.yml` is minimal and correct:
- Triggers on push to main
- Sets `permissions: contents: write` and `pull-requests: write`
- Uses `googleapis/release-please-action@v4` with `release-type: node`

### Known Issue

The YAML permissions are correct but GitHub repo-level settings override them. The fix is:
1. Go to repo Settings > Actions > General > Workflow permissions
2. Set to "Read and write permissions"
3. Check "Allow GitHub Actions to create and approve pull requests"

This is a manual GitHub settings change, not a code change. The plan should document it as a manual step and add a troubleshooting comment in the YAML file.

### Documentation

No existing CI/deployment docs exist in the repo (no docs/ directory). A comment in the YAML file itself is the most discoverable location. Adding a `# Troubleshooting` comment block at the top of the workflow file is minimal and directly findable.

## Domain 4: Weight Card Display Precision

### Current Display Issue

`weight-card.tsx` line 129: `${pendingWeight.toFixed(1)} kg` — always shows 1 decimal place. With 0.05 increments, this truncates: 70.05 displays as "70.1", 70.15 displays as "70.2".

Need to change to `.toFixed(2)` to show 2 decimal places, matching the precision of the 0.05 increment.

Line 191: `{pendingWeight?.toFixed(1) ?? "--"}` — same fix needed for the center display.

Lines 165: `{latestWeight.weight} kg` and 250: `{record.weight} kg` — these use raw numbers without `.toFixed()`. With Dexie storing floats, `70.05` might display as "70.05" or "70.05000000000001" depending on floating point. Should use `.toFixed(2)` for consistency.

## Validation Architecture

### Test Strategy

1. **sanitizeNumericInput**: Verify `parseFloat` + precision parameter works for both integer and decimal cases
2. **validateAndSave**: Verify `parseFloat` preserves "0.05" input
3. **Weight card rounding**: Verify `*100/100` produces correct 0.05-step values
4. **Settings store**: Verify default is 0.05, verify `setWeightIncrement(0.05)` persists correctly
5. **E2E**: Navigate to Settings, verify weight increment control appears, adjust value, verify persistence

### Risk Assessment

- **Low risk**: All changes are backward-compatible for integer callers
- **Low risk**: Store migration not needed (default change only affects new users)
- **Low risk**: Release-please fix is a GitHub settings toggle, no code risk
- **Medium risk**: Float precision in display — need consistent `.toFixed(2)` everywhere weight values appear

## Summary

This is a straightforward bug-fix phase with well-understood changes:
1. Fix `sanitizeNumericInput` to use `parseFloat` + optional precision (backward-compatible)
2. Fix `validateAndSave` to use `parseFloat` (backward-compatible for integer callers)
3. Fix weight-card rounding from `*10/10` to `*100/100`
4. Fix weight-card display from `.toFixed(1)` to `.toFixed(2)`
5. Change default `weightIncrement` from 0.1 to 0.05
6. Update `setWeightIncrement` to pass precision parameter
7. Create `weight-settings-section.tsx` following water/salt pattern
8. Add weight settings to settings page
9. Document release-please GitHub permissions fix in workflow YAML comments

## RESEARCH COMPLETE

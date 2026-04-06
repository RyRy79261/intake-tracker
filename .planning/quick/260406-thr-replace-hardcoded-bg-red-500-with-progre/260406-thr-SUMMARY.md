# Quick Task 260406-thr: Replace hardcoded bg-red-500 with progressOverLimit theme token

**Date:** 2026-04-06
**Commit:** ab03cc7

## Changes

### 1. Added `progressOverLimit` to theme system (`src/lib/card-themes.ts`)
- Added `progressOverLimit: string` to `CardTheme` interface
- Added `progressOverLimit: "bg-red-500"` to all 9 theme objects (water, salt, weight, bp, eating, urination, defecation, caffeine, alcohol)

### 2. Replaced hardcoded `bg-red-500` in 4 component files
- `src/components/liquids/beverage-tab.tsx` — `theme.progressOverLimit`
- `src/components/liquids/preset-tab.tsx` — `theme.progressOverLimit`
- `src/components/liquids/water-tab.tsx` — `theme.progressOverLimit`
- `src/components/food-salt-card.tsx` — `CARD_THEMES.salt.progressOverLimit`

## Verification
- All 417 unit tests pass
- Lint clean (no new warnings)
- No remaining `bg-red-500` in any progress bar indicator

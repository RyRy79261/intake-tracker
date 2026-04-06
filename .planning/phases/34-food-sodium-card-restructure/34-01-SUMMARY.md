# Plan 34-01 Summary: Card Structure & Sodium Header

**Status:** Complete
**Duration:** ~3 min

## What was built

Restructured the food-salt card to display sodium daily total/limit in the card header top-right, matching the pattern used by the liquids card. Added a sodium progress bar below the header with amber-to-orange gradient that turns red when over limit. Removed the standalone SaltSection rendering and section divider. Fixed the quick nav section ID so "Eating" scrolls to the unified card.

## Key changes

- `src/components/food-salt-card.tsx`: Replaced SaltSection + divider with sodium header metric + progress bar using `useIntake("salt")` and `useSettings()`
- `src/lib/card-themes.ts`: Changed `eating.sectionId` from `"section-eating"` to `"section-food-salt"`

## Self-Check: PASSED

- [x] Sodium daily total / limit displayed in header top-right
- [x] Progress bar renders with salt theme gradient
- [x] Progress bar turns red when over limit
- [x] SaltSection removed from card
- [x] Section divider removed
- [x] eating.sectionId matches page.tsx section ID
- [x] `pnpm build` passes

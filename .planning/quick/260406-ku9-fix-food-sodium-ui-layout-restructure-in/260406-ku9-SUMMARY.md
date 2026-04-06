# Quick Task 260406-ku9: Fix Food & Sodium UI Layout

**Status:** Complete
**Date:** 2026-04-06
**Commit:** ecd9912

## Changes

### src/components/food-salt/food-section.tsx
- Removed Collapsible pattern — all form fields always visible
- Removed ComposablePreview component usage — AI parse now populates form fields directly
- Changed AI input placeholder to "What I ate..." (serves as primary food description)
- Added sodium source selector (Select dropdown): Sodium (1.0x), Salt (0.39x), MSG (0.12x)
- Added milligram input field for sodium amount with conversion display
- Added optional water content (ml) field
- "Record with details" button always visible (not in any collapsible)
- Removed "When" datetime-local input (uses submit-time timestamp)
- Removed unused imports: Collapsible, ChevronDown/Up, ComposablePreview, Textarea
- Added Select component imports from shadcn/ui

## Verification
- TypeScript compilation: passed
- ESLint: passed
- Unit tests (391): all passed

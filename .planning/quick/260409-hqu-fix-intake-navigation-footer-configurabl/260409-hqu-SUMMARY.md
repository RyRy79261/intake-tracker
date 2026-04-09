---
quick_id: 260409-hqu
type: summary
one_liner: "Narrowed intake footer to 6 root-card items and added drag-reorder + enable/disable list in Quick Nav settings"
tags: [ui, settings, footer, quick-nav, drag-drop]
dependency_graph:
  requires:
    - src/lib/card-themes.ts
    - src/stores/settings-store.ts
    - motion/react (Reorder primitives)
  provides:
    - src/lib/quick-nav-defaults.ts
    - settings.quickNavItems (persisted)
    - settings.setQuickNavItems
  affects:
    - src/components/quick-nav-footer.tsx
    - src/app/page.tsx
    - src/components/settings/quick-nav-section.tsx
tech_stack:
  added: []
  patterns:
    - motion/react Reorder.Group for drag-reorder lists
    - zustand persist v5 migration seeding new field for existing users
key_files:
  created:
    - src/lib/quick-nav-defaults.ts
  modified:
    - src/stores/settings-store.ts
    - src/components/quick-nav-footer.tsx
    - src/app/page.tsx
    - src/components/settings/quick-nav-section.tsx
decisions:
  - "Used motion/react Reorder primitives instead of shadcn sortable (not in registry) or @dnd-kit (avoids new dep)"
  - "Kept label overrides (water->Liquids, eating->Food & Salt) in quick-nav-defaults.ts so footer and settings row share the same source of truth"
  - "RTL reversal applied after enabled filtering so the user's configured order is preserved on both axes"
  - "CARD_THEMES left untouched — caffeine/alcohol entries are still consumed by LiquidsCard tabs"
metrics:
  completed_date: "2026-04-09"
  tasks_completed: 3
  human_verify_pending: true
---

# Quick Task 260409-hqu: Fix Intake Navigation Footer (Configurable) Summary

## One-liner

Narrowed the intake footer to the 6 root-card items (Liquids, Food & Salt, BP, Weight, Urination, Defecation), removed caffeine/alcohol entries, and added a drag-reorder + enable/disable list in Settings > Quick Navigation.

## What Was Built

**Tasks completed:** 3 of 4 (task 4 is a human-verify checkpoint pending manual UAT).

### Task 1 — Settings store + defaults (commit `838c181`)

- Created `src/lib/quick-nav-defaults.ts`:
  - `QuickNavItem` interface (`id: CardThemeKey`, `enabled: boolean`)
  - `DEFAULT_QUICK_NAV_ITEMS` constant (6 root cards in visual order, all enabled)
  - `QUICK_NAV_LABEL_OVERRIDES` map (water→"Liquids", eating→"Food & Salt") — shared by footer and settings
- Updated `src/stores/settings-store.ts`:
  - Added `quickNavItems: QuickNavItem[]` to `Settings` interface (immediately after `quickNavOrder`)
  - Added `setQuickNavItems` to `SettingsActions` and to the `create` body
  - Seeded `defaultSettings.quickNavItems = DEFAULT_QUICK_NAV_ITEMS`
  - Bumped persist version `4 → 5` with migration seeding `quickNavItems` for pre-v5 users (D-07)
  - Re-exported `QuickNavItem` for convenience

### Task 2 — Rewrite footer to read from settings (commit `5ec7f83`)

- Rewrote `src/components/quick-nav-footer.tsx`:
  - Removed `buildSectionItems()` + `SECTION_ITEMS` constant (no longer iterates `CARD_THEMES`)
  - Added `quickNavItems: QuickNavItem[]` prop
  - New `useMemo` builds render list: filter `enabled`, map to `{theme = CARD_THEMES[id]}`, apply `QUICK_NAV_LABEL_OVERRIDES`, then RTL reverse
  - Returns `null` when filtered list is empty (D-06)
  - All existing styling, `motion.footer` wrapper, `hidden` behavior, and click handling preserved
- Updated `src/app/page.tsx`:
  - Passes `quickNavItems={settings.quickNavItems}` to `<QuickNavFooter>` alongside existing props
  - `settings.showQuickNav` master toggle retained as an outer guard

### Task 3 — Settings drag-reorder + toggle list (commit `7b95395`)

- Extended `src/components/settings/quick-nav-section.tsx`:
  - New "Footer Items" subsection inserted above "Icon Order" (inside the `showQuickNav` conditional)
  - Uses `motion/react` `Reorder.Group` / `Reorder.Item` with `axis="y"`
  - Each row: `GripVertical` handle, themed icon (from `CARD_THEMES[id]`), label (with overrides), `Switch`
  - Dragging calls `settings.setQuickNavItems(newOrder)`
  - Toggling calls `setQuickNavItems` with updated `enabled` flag
  - `Switch` uses `onClick` and `onPointerDown` stopPropagation so clicking the toggle doesn't start a drag
  - Disabled rows visually dim via `opacity-50` (conditional through `cn()`)
  - `touch-none` on `Reorder.Item` enables mobile drag
  - Animation timings and "Icon Order" select untouched

## Verification Run

- `pnpm lint` — passes (only pre-existing warning in `src/components/medications/schedule-view.tsx` which is out of scope)
- `pnpm tsc --noEmit` — clean, no new type errors
- Manual UAT deferred to Task 4 (human-verify checkpoint)

## Deviations from Plan

None — plan executed exactly as written. No Rule 1/2/3 auto-fixes required.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary changes. All state is client-side localStorage, scoped to the existing `intake-tracker-settings` store.

## Pending

- **Task 4 (human-verify):** Manual UAT per the 11 steps in `260409-hqu-PLAN.md`. Confirm footer shows 6 icons (no caffeine/alcohol), drag-reorder works, Switch toggle hides items, all-disabled returns null, v5 migration seeds defaults for pre-existing storage, CARD_THEMES-dependent LiquidsCard tabs still function.

## Commits

| Task | Commit    | Message                                                          |
| ---- | --------- | ---------------------------------------------------------------- |
| 1    | `838c181` | feat(260409-hqu): add quickNavItems to settings store             |
| 2    | `5ec7f83` | fix(260409-hqu): narrow quick-nav footer to 6 root-card items    |
| 3    | `7b95395` | feat(260409-hqu): add Footer Items drag-reorder list to Quick Nav settings |

## Self-Check: PASSED

- `src/lib/quick-nav-defaults.ts` — FOUND
- `src/stores/settings-store.ts` — FOUND (modified)
- `src/components/quick-nav-footer.tsx` — FOUND (modified)
- `src/app/page.tsx` — FOUND (modified)
- `src/components/settings/quick-nav-section.tsx` — FOUND (modified)
- commit `838c181` — FOUND in git log
- commit `5ec7f83` — FOUND in git log
- commit `7b95395` — FOUND in git log

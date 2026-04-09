---
name: Quick Task 260409-hqu Context
description: Decisions for fixing the intake navigation footer with configurable disable/reorder
type: project
---

# Quick Task 260409-hqu: Fix intake navigation footer - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Task Boundary

Fix the intake navigation footer:
1. Remove alcohol & caffeine entries from the footer
2. Footer should only show entries for root cards on the main intake screen
3. Make footer items configurable in Settings page under a new "Quick Navigation" section
4. Allow disabling individual items
5. Allow click-and-drag reordering of items
</domain>

<decisions>
## Implementation Decisions

### Default footer items: 6 root cards
The footer should show ONE item per root card visible on the main page (`src/app/page.tsx`):
1. Liquids (`section-water` — scrolls to LiquidsCard)
2. Food & Salt (`section-food-salt` — scrolls to FoodSaltCard)
3. Blood Pressure (`section-bp`)
4. Weight (`section-weight`)
5. Urination (`section-urination`)
6. Defecation (`section-defecation`)

**Removed:** caffeine, alcohol, separate water/salt/eating items (currently 9 items → 6 items).

**Implementation note:** The current `quick-nav-footer.tsx` builds items by iterating ALL `CARD_THEMES` keys. The fix is to introduce a separate `ROOT_NAV_ITEMS` constant (6 items, each referencing the matching CARD_THEMES key for icon/color/label) rather than iterating CARD_THEMES wholesale. Keep `CARD_THEMES` untouched (caffeine/alcohol themes are still used inside LiquidsCard tabs).

### Drag-and-drop library: shadcn if available, fallback to motion
**Preferred:** shadcn `Sortable` component if it exists in the shadcn registry. The shadcn skill (`/home/ryan/.claude/skills/shadcn/`) is installed — planner should use it to check the registry for `sortable` and add it via `npx shadcn@latest add sortable` if available.

**Fallback:** `motion/react` `Reorder.Group` + `Reorder.Item` (motion v12 already installed, no new dep).

**Rejected:** Up/down buttons only (insufficient UX), `@dnd-kit/sortable` directly (use shadcn's wrapper if available instead).

### Persistence: single array in settings-store
Add to `src/stores/settings-store.ts`:
```typescript
quickNavItems: Array<{ id: CardThemeKey; enabled: boolean }>
```
- Order is implicit in array order
- `enabled: false` hides item from footer but keeps it in settings list
- Persisted via existing zustand persist middleware (localStorage)
- Default value: 6 root items, all enabled, in the order matching `page.tsx` (Liquids, Food&Salt, BP, Weight, Urination, Defecation)
- Migration: existing users get the default array on first load (no migration needed since it's a new field)

### Settings UI: new "Quick Navigation" section
- Add a new section in `src/app/settings/page.tsx` titled "Quick Navigation"
- List shows each item in current order
- Each row has: drag handle, icon, label, enable/disable Switch
- Drag-to-reorder updates the settings-store array
- Reuses existing `Switch` component (already in `src/components/ui/switch.tsx`)

### Claude's Discretion
- Exact visual style of the settings list (drag handle position, spacing) — match existing settings sections
- Whether to show a "Reset to default" button in the Quick Nav settings section (nice-to-have, not required)
- Whether the footer should hide entirely when zero items are enabled (yes — return null)

</decisions>

<specifics>
## Specific Ideas

### Files likely touched
- `src/components/quick-nav-footer.tsx` — read from settings-store, filter by enabled, sort by stored order
- `src/stores/settings-store.ts` — add `quickNavItems` field with default
- `src/app/settings/page.tsx` — add "Quick Navigation" section
- `src/components/settings/quick-nav-settings.tsx` — NEW component for the drag/disable list
- `src/lib/quick-nav-defaults.ts` — NEW (or inline in store) — DEFAULT_QUICK_NAV_ITEMS constant
- Possibly: `src/components/ui/sortable.tsx` (NEW, if shadcn sortable available)

### Existing infrastructure to reuse
- `CARD_THEMES` for icon/color/label per item
- `Switch` component for enable/disable toggle
- `motion` library already installed (fallback drag library)
- Zustand persist middleware in settings-store

</specifics>

<canonical_refs>
## Canonical References

- shadcn skill: `/home/ryan/.claude/skills/shadcn/SKILL.md` — use to check for `sortable` component in registry
- Current footer: `src/components/quick-nav-footer.tsx`
- Current themes: `src/lib/card-themes.ts`
- Current page composition: `src/app/page.tsx`
- Settings store: `src/stores/settings-store.ts`

</canonical_refs>

# Phase 34: Food/Sodium Card Restructure - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Restructure the food/sodium card so sodium is treated as a derivative of food (like caffeine is to coffee in the liquids card), not a separate section. Move sodium total to card header top-right for consistency. Merge food and sodium history into a single chronological list. Fix broken quick nav section IDs. This phase does NOT change the AI parsing logic, composable entry system, or any other cards.

</domain>

<decisions>
## Implementation Decisions

### Unified Input Model
- **D-01:** Salt is a derivative of food, not a separate entry type — same relationship as caffeine to coffee in the liquids card
- **D-02:** Remove the separate `SaltSection` component with its own +/- stepper, confirm button, and manual salt-only input flow
- **D-03:** All food/sodium entry goes through the unified food input: AI text input for parsing, or manual "Add details" flow
- **D-04:** AI parse already extracts sodium from food descriptions (via composable entries) — this continues unchanged

### Sodium Presets in Manual Flow
- **D-05:** Sodium presets (MSG, table salt, etc. from `sodiumPresets` in settings store) remain available but move into the manual "Add details" section of the food input flow
- **D-06:** When manually entering food, user can select a sodium preset to specify the source/amount — e.g., "Cooked with MSG" → pick MSG preset → sodium amount calculated from preset's sodiumPercent
- **D-07:** AI auto-population replaces the need for manual sodium entry when the AI parses successfully (e.g., "2 minute noodles" → AI returns sodium content)

### Sodium Display in Header
- **D-08:** Move sodium daily total / limit display to the card header top-right position, matching the pattern used by liquids card (water total), weight card (latest weight), and BP card (latest reading)
- **D-09:** Show: daily total / limit, "today (sodium)" label, 24h rolling total — same info currently in SaltSection sub-header

### Entry Display Format
- **D-10:** Merged history entries show: date first, then sodium amount, then description/name (truncated)
- **D-11:** Format: `2:30 PM · 500mg Na · Chicken sandwich`

### Single Merged History
- **D-12:** One `RecentEntriesList` replacing the current two separate lists (food entries + salt entries)
- **D-13:** All food and sodium entries displayed chronologically in a single list
- **D-14:** Edit/delete routes to the correct mutation under the hood (eating record → `useDeleteEating`/`useUpdateEating`, intake record → `useDeleteIntake`/`useUpdateIntake`) — user doesn't need to think about record types

### Quick Nav Fix
- **D-15:** Fix sectionId mismatch: dashboard uses `id="section-food-salt"` but CARD_THEMES has `sectionId: "section-eating"` (eating) and `sectionId: "section-salt"` (salt) — neither matches
- **D-16:** Update either the dashboard section ID or the CARD_THEMES sectionId entries so quick nav scrolling works for this card
- **D-17:** Since the card is now unified (not two sections), it should have a single sectionId that the quick nav scrolls to

### Claude's Discretion
- Whether to update the CARD_THEMES entry (rename eating/salt) or the dashboard section ID — whatever is cleanest
- How sodium presets integrate into the manual details collapsible (dropdown, radio buttons, or pills like current preset grid)
- Whether the sodium progress bar stays (currently in SaltSection) or gets simplified
- Exact truncation length for description in history entries

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Card structure (primary modification targets)
- `src/components/food-salt-card.tsx` — Parent card wrapping FoodSection + SaltSection; will be restructured
- `src/components/food-salt/food-section.tsx` — AI input, manual details, composable preview, food history list
- `src/components/food-salt/salt-section.tsx` — Separate salt stepper/presets/history to be removed; sodium presets to be relocated into food flow
- `src/components/food-salt/composable-preview.tsx` — Preview UI for AI-parsed composable entries

### Quick nav (broken section IDs)
- `src/app/page.tsx` lines 65-66 — Dashboard uses `id="section-food-salt"` for the card wrapper
- `src/components/quick-nav-footer.tsx` — Builds nav items from CARD_THEMES, scrolls to `theme.sectionId`
- `src/lib/card-themes.ts` lines 112-129 — `eating.sectionId: "section-eating"`, lines 54-71 — `salt.sectionId: "section-salt"` — neither matches `"section-food-salt"`

### Patterns to follow
- `src/components/liquids-card.tsx` — Reference for how a unified card with derivative substances works (water → coffee with caffeine)
- `src/components/recent-entries-list.tsx` — Reusable history list component used by all cards

### Data layer
- `src/hooks/use-eating-queries.ts` — CRUD hooks for eating records
- `src/hooks/use-intake-queries.ts` — CRUD hooks for intake records (salt type)
- `src/hooks/use-composable-entry.ts` — Atomic multi-table writes for linked food+sodium entries
- `src/stores/settings-store.ts` — `sodiumPresets` array with name and sodiumPercent per preset

### Requirements
- `.planning/REQUIREMENTS.md` — FOOD-01 (sodium top-right), FOOD-02 (description as title), FOOD-03 (single merged history)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RecentEntriesList`: Generic history list component with edit/delete — can render mixed record types via the `renderEntry` callback
- `ComposablePreview`: Already handles multi-record preview (eating + water + salt) — no changes needed
- `useAddComposableEntry`: Atomic writes for linked records — already works correctly
- `sodiumPresets` in settings store: Array of `{ id, name, sodiumPercent }` — can be used in manual details flow
- `ManualInputDialog`: Dialog pattern for manual numeric entry — may be useful for sodium amount override

### Established Patterns
- Liquids card: Unified card with tabs for water/coffee/alcohol where caffeine/alcohol are derivative substances — same model food/sodium should follow
- Card header: All cards show icon+label left, key metric right — sodium total should follow this
- History lists: All use `RecentEntriesList` with `renderEntry` callback for customization

### Integration Points
- `food-salt-card.tsx`: Remove SaltSection import, restructure to unified layout
- `food-section.tsx`: Absorb sodium preset selection into manual details flow
- `salt-section.tsx`: Remove entirely (relocate sodium presets into food flow)
- `card-themes.ts`: Fix sectionId for the unified card
- `page.tsx`: Ensure section ID matches the theme sectionId

</code_context>

<specifics>
## Specific Ideas

- User explicitly described the food→salt relationship as analogous to water→coffee: "Food is a root type of salt, like Water is a root type of Coffee"
- Sodium presets should be available during manual food entry (e.g., "cooked with MSG"), while AI handles automatic extraction for described foods (e.g., "2 minute noodles")
- The separate salt stepper with its own confirm button is the wrong mental model — sodium comes from food, not from a separate tracking action

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 34-food-sodium-card-restructure*
*Context gathered: 2026-04-06*

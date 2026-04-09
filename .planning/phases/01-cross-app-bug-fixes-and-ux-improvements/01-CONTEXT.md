# Phase 1: Cross-app bug fixes and UX improvements - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix bugs and improve UX across Dashboard, Medications (Schedule + Rx), Analytics, and Settings. Includes inventory deduction fix, dose formatting corrections, medication adherence calculation fix, Settings restructure from modal to accordion, Rx compound details persistence, and dead code cleanup. Creates a new branch for all changes.

</domain>

<decisions>
## Implementation Decisions

### Dashboard
- **D-01:** Remove Alcohol and Caffeine from the quick-nav footer shortcuts

### Medications — Navigation
- **D-02:** Make the top navigation tabs wrap so Titrations and Settings flow to a second row instead of being cramped

### Medications — Schedule Bugs
- **D-03:** When creating a new Rx item, do NOT create dose alerts for times earlier than the current time on the creation day. Only create alerts for future times.
- **D-04:** "Mark All" dialog should auto-populate the time field with the time slot that the "Mark All" button appeared next to, not default to 8 AM.
- **D-05:** Fix inventory deduction — marking a dose as taken must create a `consumed` inventory transaction. Undoing a dose must reverse the transaction. Debug panel currently shows PillsConsumed: 0 for everything.
- **D-06:** Fix the progress bar at top — currently always says "0x0 Taken". Should show actual doses taken / total doses scheduled.
- **D-07:** Fix dose formatting. Current: "1/2 of 6.25mg" (reads as 3.125mg). Correct: "1/2 tablet (6.25mg)" where 6.25mg is the actual dose amount (pill strength × fraction). The parenthetical shows the computed dose, not the pill strength.
- **D-08:** Show the active brand name next to the compound name in schedule items. Brand info comes from the active InventoryItem for that prescription.

### Medications — Rx View
- **D-09:** Collapsed Rx card should show "{pillAmount} {numberOfTimes} per day" instead of "{dose} Next: {time}". This helps when refilling a weekly pill organizer — user can see at a glance how many pills to take out, which slot (morning/evening), and whether to split.
- **D-10:** Same dose formatting fix as D-07: "1/2 tablet (6.25mg)" throughout Rx sub-cards.
- **D-11:** When expanded, the indication/purpose text should be expandable (truncated by default, tap to read full text).
- **D-12:** Rename "Edit" button to "Compound Details". Opens a read-only drawer showing all AI-fetched compound data. Includes a "Refresh from AI" button that re-runs medicine-search and shows a diff for user to accept/reject updates.

### Medications — Rx Data Model
- **D-13:** Add compound-level fields to Prescription table (Dexie version bump required):
  - `drugClass?: string`
  - `mechanismOfAction?: string` (new — plain-English explanation of biological mechanism)
  - `commonIndications?: string[]`
  - `dosageStrengths?: string[]`
  - `foodInstruction?: "before" | "after" | "none"`
  - `foodNote?: string`
  These are compound-level scientific data. Brand names and pill appearance stay on InventoryItem.
- **D-14:** Extend the AI medicine-search prompt and tool schema to return `mechanismOfAction` field.
- **D-15:** The add-medication wizard should persist all AI-returned compound data to the Prescription record.

### Analytics
- **D-16:** Medication adherence calculation must ignore scheduled doses that are in the future (after current time). Currently counts future doses as missed.
- **D-17:** Export PDF and Export CSV buttons should be stacked vertically (full-width each) instead of side-by-side taking up 1/3 of the row each.
- **D-18:** Insights should have editable thresholds. Gear icon per insight type on the Insights tab opens inline threshold editing (e.g., "Alert when adherence drops below [80]%"). Thresholds stored in Zustand settings store.

### Settings — Restructure
- **D-19:** Remove dead settings sections for Sodium, Caffeine, and Alcohol that duplicate functionality already in the defaults/customization section.
- **D-20:** Move CustomizationPanel content from modal into Settings page as accordion sections per category (Water, Coffee, Alcohol, Food/Beverage). Existing behavior settings (limits, increments, day-start-hour, theme) stay in their current position above the accordion.
- **D-21:** Presets in accordion sections support delete only (❌ button). To change a preset, delete and re-add.
- **D-22:** Each accordion section for Coffee/Alcohol presets should use color coding via existing Tailwind theme tokens: `--caffeine` for coffee items, `--alcohol` for alcohol items, and orange for mixed (both caffeine + alcohol) items.
- **D-23:** Users must be able to delete any default preset, not just custom ones.

### Claude's Discretion
- Accordion implementation details (single-open vs multi-open, animation)
- Exact layout of the Compound Details drawer sections
- How the AI refresh diff UI presents changes for accept/reject
- Branch naming convention for the fix branch

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Medication Data Model
- `src/lib/db.ts` §139-151 — Prescription interface (fields to extend)
- `src/lib/db.ts` §206-226 — InventoryItem interface (brandName, pill appearance already here)
- `src/lib/medication-service.ts` — Prescription CRUD (must update to persist new fields)

### AI Medicine Search
- `src/app/api/ai/medicine-search/route.ts` — AI tool schema and prompt (extend for mechanismOfAction)
- `src/hooks/use-medicine-search.ts` — Client-side hook for medicine search

### Schedule & Dose Components
- `src/components/medications/schedule-view.tsx` — Schedule view (dose formatting, brand name display)
- `src/components/medications/dose-row.tsx` — Individual dose row (formatting fix target)
- `src/components/medications/dose-progress-summary.tsx` — Progress bar (0x0 bug)
- `src/components/medications/time-slot-group.tsx` — "Mark All" button (time auto-populate fix)

### Rx View Components
- `src/components/medications/prescription-card.tsx` — Collapsed Rx display (format change)
- `src/components/medications/prescription-detail-drawer.tsx` — Expanded Rx view
- `src/components/medications/edit-medication-drawer.tsx` — "Edit" button → "Compound Details" rename

### Analytics
- `src/components/analytics/insights-tab.tsx` — Insights display (threshold editing)
- `src/components/analytics/export-controls.tsx` — Export buttons layout
- `src/lib/analytics-types.ts` §137-154 — Insight type definition with threshold field

### Settings
- `src/app/settings/page.tsx` — Settings page layout
- `src/components/settings/substance-settings-section.tsx` — Dead code with color-coded styling to reuse
- `src/components/customization-panel.tsx` — Modal content to migrate to accordion
- `src/components/quick-nav-footer.tsx` — Footer shortcuts (remove alcohol/caffeine)
- `tailwind.config.ts` §76-82 — Existing caffeine/alcohol theme tokens

### Settings Store
- `src/stores/settings-store.ts` — Zustand store (insight thresholds to add here)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SubstanceSettingsSection` (`src/components/settings/substance-settings-section.tsx`): Has color-coded caffeine (yellow-700) and alcohol (fuchsia-600) sections with add/delete/edit UI. Dead code but good reference for accordion section styling.
- `CustomizationPanel` (`src/components/customization-panel.tsx`): Existing preset management with tab selector (coffee/alcohol/beverage). Content to migrate into accordion sections.
- Tailwind theme tokens `--caffeine` and `--alcohol` already defined in `tailwind.config.ts`
- `InsightBanner` component exists for displaying individual insights
- `useSettingsStore` already has `dismissInsight`/`isDismissed` for insights — can extend with threshold config

### Established Patterns
- Drawers used extensively in medications (prescription-detail-drawer, edit-medication-drawer, inventory-item-view-drawer)
- Zustand + localStorage persistence for all user settings
- Dexie version bumps require repeating full schema (documented in CLAUDE.md)
- React Query hooks wrap all Dexie operations with cache invalidation

### Integration Points
- `src/app/medications/page.tsx` — Top-level medications page (tab navigation lives here)
- `src/lib/medication-service.ts` — Service layer for dose logging (inventory deduction fix)
- `src/hooks/use-medication-queries.ts` — React Query hooks for medication operations

</code_context>

<specifics>
## Specific Ideas

- User specifically uses app to refill weekly pill organizer — collapsed Rx view format "{pillAmount} {numberOfTimes} per day" optimized for this workflow
- Dose formatting example: Carvedilol 12.5mg pill taken as half → display "1/2 tablet (6.25mg)" NOT "1/2 of 6.25mg"
- Color coding: the dead code in SubstanceSettingsSection has the right visual approach — yellow for caffeine, fuchsia for alcohol. Use theme tokens instead of hardcoded colors. Orange for mixed substances.
- Brand info belongs on InventoryItem (the medication/inventory section), NOT on Prescription. Prescription is compound-level scientific data only.
- Compound Details should be read-only with an AI refresh button that shows changes as a diff for accept/reject

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-cross-app-bug-fixes-and-ux-improvements*
*Context gathered: 2026-04-07*

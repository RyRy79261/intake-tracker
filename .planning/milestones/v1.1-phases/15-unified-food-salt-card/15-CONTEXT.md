# Phase 15: Unified Food+Salt Card - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace separate EatingCard + IntakeCard(salt) with a single FoodSaltCard component. Stacked layout: food section at top (text input + AI parse → composable entry preview), salt section below (existing +/- increment UX preserved). AI food parsing creates composable linked entries (eating + water + salt) via `addComposableEntry()`. Preview shows expandable cards per linked record with editable fields and remove buttons before confirming.

</domain>

<decisions>
## Implementation Decisions

### Card Layout
- **D-01:** Stacked sections, not tabs. Food input section at top, salt section below. Both visible without tab switching.
- **D-02:** Salt section is an exact lift of current IntakeCard(salt) UX: +/- buttons, daily total, limit warning, manual input dialog, recent entries list.

### AI Food Parse Flow
- **D-03:** Text input with AI sparkle icon button — same pattern as Phase 14 Liquids card coffee/alcohol tabs. Type food description, tap AI icon, shows spinner, result populates preview.
- **D-04:** AI parse uses existing `/api/ai/parse` route which returns `{ water: number|null, salt: number|null, reasoning?: string }`.
- **D-05:** On AI parse result, create a composable entry preview showing all linked records. User confirms or edits before saving.

### Composable Entry Preview
- **D-06:** Expandable card per linked record. Each record (eating, water, salt) shown as a mini-card with editable fields and a remove (X) button. User can edit amounts or remove individual entries before confirming all.
- **D-07:** Preview shows: eating record (food description, grams), water record (ml), salt record (mg). Each with edit capability.
- **D-08:** Confirm creates all records atomically via `addComposableEntry()` with `groupSource: "ai_food_parse"` and `originalInputText` stored for AI re-run capability (Phase 12 D-03).
- **D-09:** "Try Again" button clears the preview and returns to text input (reuse existing ParsedIntakeDisplay pattern).

### Water Integration
- **D-10:** Water from food creates a real intake record via composable entry. It adds to the Liquids card water daily total automatically — user sees total water from all sources in one place.

### Claude's Discretion
- Exact component decomposition (FoodSaltCard → FoodSection + SaltSection, or inline)
- Whether to reuse `ParsedIntakeDisplay` directly or build a new composable preview component
- How the expandable preview cards look (accordion, collapsible, inline expand)
- Whether the food input also supports a quick "I ate" button (no AI, just timestamp) like current EatingCard
- Optional grams field placement (before or after AI parse, or in the preview)
- Loading state for AI parse (skeleton, spinner, shimmer)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Components to Replace
- `src/components/eating-card.tsx` — Current eating card with quick-log + expandable details. Being replaced by FoodSaltCard food section.
- `src/components/intake-card.tsx` — Salt instance on dashboard being replaced by FoodSaltCard salt section. IntakeCard itself stays (may still be used elsewhere).

### Data Layer (Phase 12 outputs)
- `src/lib/composable-entry-service.ts` — `addComposableEntry()` with `ComposableEntryInput` type: `{ eating?, intakes?, substance?, originalInputText?, groupSource? }`
- `src/hooks/use-composable-entry.ts` — `useAddComposableEntry()`, `useEntryGroup()`, `useDeleteEntryGroup()`

### AI Route
- `src/app/api/ai/parse/route.ts` — Returns `{ water, salt, reasoning }` for food descriptions
- `src/lib/ai-client.ts` — `parseIntakeWithAI()` client function

### Existing Preview
- `src/components/parsed-intake-display.tsx` — Shows water/salt side-by-side with confirm/try again. May be extended or replaced.

### Service Layer
- `src/lib/eating-service.ts` — `addEatingRecord()`, `deleteEatingRecord()` (soft-delete), `undoDeleteEatingRecord()`
- `src/lib/intake-service.ts` — `addIntakeRecord()`, `deleteIntakeRecord()` (soft-delete)
- `src/hooks/use-eating-queries.ts` — Eating mutation hooks
- `src/hooks/use-intake-queries.ts` — Intake mutation hooks (salt)

### Phase 14 Pattern
- `src/components/liquids/preset-tab.tsx` — AI text input + sparkle icon pattern to reuse

### Dashboard
- `src/app/page.tsx` — Where EatingCard and IntakeCard(salt) are rendered. Will swap to FoodSaltCard.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parseIntakeWithAI()` — client-side AI parse function, returns `{ water, salt, reasoning }`
- `addComposableEntry()` — atomic cross-table writes with groupId linking
- `ParsedIntakeDisplay` — water/salt display with confirm/try again
- `IntakeCard` salt UX — +/- buttons, daily total, limit warning (lift into SaltSection)
- `EatingCard` quick-log pattern — "I ate" button for no-detail logging
- `showUndoToast()` — 5-second undo for all deletes
- Phase 14 AI text input pattern — sparkle icon, spinner on loading, inline result

### Established Patterns
- Cards use stacked layout within `max-w-lg` container
- `useLiveQuery` for reads, mutations for writes
- Source tags: `"ai_food_parse"`, `"manual"`, `"beverage:{name}"`
- `forceMount` on tabs for state preservation (if used)

### Integration Points
- Replace `<EatingCard />` + `<IntakeCard type="salt" />` in page.tsx with `<FoodSaltCard />`
- Water from food flows through existing `useIntake("water")` since it creates real intake records
- Salt from food flows through existing `useIntake("salt")`

</code_context>

<specifics>
## Specific Ideas

- User said "I just want to type in what I ate, and if it has water and salt, it makes an entry in food/salt and liquid intake"
- The composable entry preview is the first time users see linked records — it should feel intuitive, not overwhelming
- Salt section should feel exactly like the current salt card — no regression

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-unified-food-salt-card*
*Context gathered: 2026-03-24*

# Phase 33: Weight Direct Input - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable tap-to-type keyboard entry for weight values on the dashboard card. Users can tap the center weight display, type a decimal value directly, and confirm via the existing "Record Weight" button. This phase does NOT change the stepper (+/- buttons), edit dialog, or any other card.

</domain>

<decisions>
## Implementation Decisions

### Input Activation
- **D-01:** User taps the center value display (the big "70.50 kg" number) to activate direct input
- **D-02:** No additional buttons or icons — the value display itself is the tap target

### Input Mechanism
- **D-03:** Hidden input + visible label pattern — a `<label>` wraps the visible formatted text, a visually-hidden `<input>` inside it receives focus via native label association
- **D-04:** The hidden input triggers the numeric keyboard on mobile (`type="number"`, `inputMode="decimal"`)
- **D-05:** Display text stays visually unchanged during input — no borders, no style shift, no DOM swap
- **D-06:** As the user types, the visible formatted text updates in real-time from the hidden input's value

### Reusable Component
- **D-07:** Build as a generic reusable component in `src/components/ui/` (shadcn convention) that accepts any native input `type` and a display `format` function (mask)
- **D-08:** For weight usage: `type="number"`, `inputMode="decimal"`, format mask renders `{value} kg`
- **D-09:** Component must be Playwright-testable — the hidden input needs to be accessible via `getByRole` or test ID for E2E automation

### Rounding Behavior
- **D-10:** On blur (user taps away from the input), the typed value is rounded to the nearest configured increment (0.05 by default, from settings)
- **D-11:** The corrected/rounded value is shown in the display — user must explicitly press "Record Weight" to save. No silent auto-save.
- **D-12:** This matches the existing stepper flow: adjust value, then confirm via submit button

### Claude's Discretion
- Component naming and API design (props interface)
- How to handle edge cases: empty input, non-numeric input, values outside valid range
- Whether to show a subtle visual cue that the field is active (e.g., cursor blink, text color change) — keeping it minimal
- Playwright test structure and selectors

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Weight card (primary modification target)
- `src/components/weight-card.tsx` — Current weight card with stepper UI; lines 189-193 contain the center value display (`<span>`) that will become the tap target
- `src/components/weight-card.tsx` lines 94-107 — `handleDecrement`/`handleIncrement` use rounding logic that the direct input must match

### Existing input patterns
- `src/components/edit-weight-dialog.tsx` — Edit dialog with `type="number"` input for existing weight records
- `src/components/manual-input-dialog.tsx` — Dialog-based numeric input pattern (water/salt) for reference
- `src/components/ui/input.tsx` — shadcn Input component to follow conventions for the new component

### Settings and precision (from Phase 32)
- `src/stores/settings-store.ts` — `weightIncrement` default (0.05 after Phase 32), `setWeightIncrement`
- `src/lib/security.ts` lines 53-58 — `sanitizeNumericInput` (decimal-safe after Phase 32)
- `src/components/weight-card.tsx` lines 94-107 — Rounding uses `*100/100` after Phase 32

### Requirements
- `.planning/REQUIREMENTS.md` — WGT-01: User can tap weight value and type a number directly via keyboard

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/input.tsx`: shadcn Input component — follow its conventions (cn(), forwardRef, className merging) for the new inline-edit component
- `src/components/weight-card.tsx`: Existing `pendingWeight` state and `handleSubmit` flow — the direct input just becomes another way to set `pendingWeight`
- `src/hooks/use-settings.ts`: Already exposes `weightIncrement` for rounding calculation

### Established Patterns
- shadcn/ui components: Headless, Tailwind-styled, placed in `src/components/ui/`
- Weight card state: `pendingWeight` (number | null) drives both display and submit
- Zod validation on submit (`WeightFormSchema`) — direct input feeds into the same validation

### Integration Points
- `weight-card.tsx` center display (lines 189-193): Replace static `<span>` with the new inline-edit component
- `pendingWeight` state setter: Direct input calls `setPendingWeight` with the typed value
- Rounding: Apply `Math.round(value / increment) * increment` on blur using `settings.weightIncrement`
- E2E tests: New Playwright test in `e2e/` for the tap-to-type interaction

</code_context>

<specifics>
## Specific Ideas

- User wants zero visual change on tap — "visually nothing changes" when switching to edit mode
- Pattern inspired by apps where tapping a value lets you type directly without any UI transition
- The component should be generic enough to reuse for other input types beyond weight (different `type`, different format mask)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 33-weight-direct-input*
*Context gathered: 2026-04-06*

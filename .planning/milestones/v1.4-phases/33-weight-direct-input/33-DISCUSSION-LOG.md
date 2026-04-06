# Phase 33: Weight Direct Input - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 33-Weight Direct Input
**Areas discussed:** Input activation, Input mechanism, Rounding behavior

---

## Input Activation

| Option | Description | Selected |
|--------|-------------|----------|
| Tap the value display | Tapping the big center number switches to edit mode. Most intuitive. | ✓ |
| Edit icon next to value | Pencil icon beside the number. More discoverable but adds visual noise. | |
| You decide | Claude picks based on UX patterns | |

**User's choice:** Tap the value display
**Notes:** User clarified they want "visually nothing changes" when tapping — no UI transition at all.

---

## Input Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Ark UI Editable | Purpose-built package (@ark-ui/react/editable). Headless, Tailwind-compatible. | |
| Styled native input | Always-rendered input with transparent styling. Zero new deps. | |
| Hidden input + label | Hidden input inside a label; tapping label focuses input; display text updates from input value. | ✓ |

**User's choice:** Hidden input + visible label pattern (user-proposed approach)
**Notes:** User proposed this pattern themselves — avoids all input styling issues entirely. The input is truly hidden, the label shows the formatted value, and native label→input focus association handles activation. User specified it should be:
- Generic/reusable for any native input type
- For weight: `type="number"` with format mask `{value} kg`
- Playwright-testable (hidden input must be accessible)

---

## Rounding Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-round on confirm | 71.37 rounds to 71.35 on blur/Enter. Matches stepper behavior. | |
| Accept any decimal | Save exactly what user typed. More flexible but mixed precision. | |
| Show corrected value before saving | On blur, display rounded value but don't save — user confirms via Record Weight button. | ✓ |

**User's choice:** Show corrected value before saving
**Notes:** Round to nearest increment on blur, show corrected value in display, wait for explicit "Record Weight" button press. Matches existing stepper submit flow.

---

## Claude's Discretion

- Component naming and API design
- Edge case handling (empty input, non-numeric, out-of-range)
- Subtle active-state visual cues (minimal)
- Playwright test structure

## Deferred Ideas

None — discussion stayed within phase scope.

---
status: diagnosed
trigger: "Investigate three UX issues: caffeine popup vs inline, alcohol unit display, time range button overflow"
created: 2026-03-10T00:00:00Z
updated: 2026-03-10T00:00:00Z
---

## Current Focus

hypothesis: Three independent UX issues with clear root causes in substance-row.tsx, substance-type-picker.tsx, and time-range-selector.tsx
test: Code review comparing patterns across components
expecting: Identify specific code changes needed
next_action: Return diagnosis

## Symptoms

expected: (1) Caffeine/alcohol cards use inline +/- like water/salt. (2) Alcohol shows meaningful units. (3) Time range buttons fit on mobile.
actual: (1) Caffeine/alcohol use a drawer popup. (2) Alcohol shows "1.4 drinks" which is meaningless. (3) Buttons overflow on mobile.
errors: N/A - UX/design issues
reproduction: View dashboard on mobile viewport
started: Since substance tracking was implemented

## Eliminated

(none)

## Evidence

- timestamp: 2026-03-10
  checked: IntakeCard (water/salt) pattern
  found: Uses inline +/- buttons with pendingAmount, handleIncrement/handleDecrement, and a Confirm button. All interaction happens within the card itself.
  implication: This is the target pattern for caffeine/alcohol.

- timestamp: 2026-03-10
  checked: SubstanceRow pattern
  found: Uses a single "Add Caffeine/Alcohol" button that opens SubstanceTypePicker (a Drawer). No inline increment controls at all.
  implication: Completely different interaction model from water/salt.

- timestamp: 2026-03-10
  checked: SubstanceTypePicker implementation
  found: A multi-step Drawer: step 1 = type grid, step 2 = AI description input, step 3 = result review. For known types, one tap selects and closes drawer.
  implication: The drawer adds friction. For known types (Coffee 95mg, Beer 1 drink), this should be inline taps.

- timestamp: 2026-03-10
  checked: Alcohol unit storage and display
  found: Stored as `amountStandardDrinks` (float). Display is `${todayTotal.toFixed(1)} drinks`. Default types all use defaultDrinks=1. The "1.4 drinks" comes from summing fractional standard drinks (e.g. AI enrichment returning 1.4 for a craft beer).
  implication: "Standard drinks" is actually a well-defined unit (14g of pure alcohol in the US). The display label "drinks" is vague. The real issue is that fractional standard drinks from AI enrichment produce confusing totals.

- timestamp: 2026-03-10
  checked: TimeRangeSelector layout
  found: Uses `flex gap-1 overflow-x-auto pb-1` for 6 buttons (24h, 7d, 30d, 90d, All, Custom). Each button has `shrink-0`. The container allows horizontal scroll but has no visual scroll indicator.
  implication: On narrow mobile screens, buttons overflow horizontally. The overflow-x-auto allows scrolling but users cannot see there are more buttons. The "Custom" button may be entirely off-screen.

## Resolution

root_cause: |
  1. CAFFEINE POPUP: SubstanceRow uses a fundamentally different interaction pattern (Drawer popup) from IntakeCard (inline +/- controls). The SubstanceTypePicker is a Drawer component that opens on every "Add" tap.
  2. ALCOHOL UNITS: The display format `${todayTotal.toFixed(1)} drinks` uses a vague label. The underlying data model (amountStandardDrinks) is correct -- "standard drinks" is the proper unit. The display just needs to say "std drinks" or show the definition. The "1.4" value itself is correct if the user logged a 1.4 standard drink equivalent.
  3. TIME RANGE OVERFLOW: The flex container with `overflow-x-auto` and 6 `shrink-0` buttons overflows on mobile. There is no visual affordance (scroll indicator, fade edge) to show more buttons exist off-screen.

fix: |
  See detailed fix directions below.

verification: N/A - diagnosis only
files_changed: []

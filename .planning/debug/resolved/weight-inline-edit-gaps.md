---
status: resolved
trigger: "UAT Phase 33 - 3 gaps in weight direct input"
created: 2026-04-06T15:30:00.000Z
updated: 2026-04-06T16:00:00.000Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED - All 3 gaps traced to InlineEdit component
test: Complete - code path analysis for all 3 gaps
expecting: n/a - diagnosis complete
next_action: Return structured diagnosis

## Symptoms

expected: |
  1. Cursor/typing indicator visible when weight tapped for input
  2. Value 69.00 stays as 69.00 when entering edit mode
  3. Pressing "." shows partial decimal (e.g. "69.") not "--"
actual: |
  1. No visual feedback that input is active
  2. 69.00 becomes 69 when tapping to type
  3. Pressing "." causes "--" display
errors: No runtime errors - all are visual/UX issues
reproduction: Tap the weight value on the main dashboard card
started: Since Phase 33 implementation

## Eliminated

## Evidence

- timestamp: 2026-04-06T15:35:00Z
  checked: InlineEdit display rendering (line 116)
  found: "isEditing ? editValue || formatDisplay(null) : formatDisplay(value)" — uses logical OR fallback
  implication: When editValue is empty string (falsy), falls through to formatDisplay(null) which returns "--"

- timestamp: 2026-04-06T15:36:00Z
  checked: InlineEdit handleFocus (line 69-72)
  found: "setEditValue(value != null ? String(value) : '')" — String(69) = "69", not "69.00"
  implication: Formatting is lost because formatDisplay is only used for non-editing display; editValue uses raw String() conversion

- timestamp: 2026-04-06T15:37:00Z
  checked: InlineEdit input element (line 124)
  found: "className='sr-only'" — input is screen-reader-only, completely visually hidden
  implication: No visible caret/cursor; isEditing state exists but never drives any visual feedback

- timestamp: 2026-04-06T15:38:00Z
  checked: InlineEdit input type vs weight-card props
  found: type="number" passed from weight-card (line 212); browser returns "" for e.target.value on intermediate decimal states like "69."
  implication: This is the mechanism for Gap 3 — browser swallows partial decimals on type="number" inputs

- timestamp: 2026-04-06T15:39:00Z
  checked: formatDisplay callback in weight-card (line 203)
  found: "(v) => v?.toFixed(2) ?? '--'" — returns "--" when v is null
  implication: formatDisplay(null) = "--", which is what shows during intermediate decimal entry

## Resolution

root_cause: |
  All 3 gaps are in src/components/ui/inline-edit.tsx:
  
  Gap 1 (no typing indicator): The <input> uses className="sr-only" (line 124) making it invisible.
  The isEditing state (line 52) is never used to apply visual feedback to the display span or label.
  No cursor, highlight, or any editing indicator exists.
  
  Gap 2 (decimal formatting lost): handleFocus (line 71) sets editValue via String(value).
  String(69) = "69", not "69.00". The formatDisplay function is only used in the non-editing 
  branch of the ternary (line 116), so the formatted value is never carried into edit mode.
  
  Gap 3 ("." causes "--"): Two compounding issues:
  (a) The input uses type="number" (passed from weight-card.tsx line 212). Browsers report 
  e.target.value="" for intermediate states like "69." because it's not a valid number yet.
  (b) The display logic (line 116) uses || (logical OR): editValue || formatDisplay(null).
  When editValue is "" (falsy), it falls through to formatDisplay(null) which returns "--".
fix: ""
verification: ""
files_changed: []

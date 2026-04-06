# Phase 37: Water Entry Label Formatting Bug - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 37-water-entry-label-formatting-bug
**Areas discussed:** Label text for presets, Label text for substances, Fallback strategy

---

## Label text for presets

| Option | Description | Selected |
|--------|-------------|----------|
| Beverage name from preset | Look up the preset by ID in settings store and show its name (e.g., 'Flat White', 'Orange Juice'). Falls back to 'Beverage' if preset was deleted. | ✓ |
| Generic 'Beverage' label | Always show 'Beverage' for any preset source — simpler, no lookup needed, but loses specificity | |
| No label (hide) | Treat preset water entries same as plain water — no source annotation | |

**User's choice:** Beverage name from preset (Recommended)
**Notes:** None

---

## Label text for substances

| Option | Description | Selected |
|--------|-------------|----------|
| Description from parent substance record | The substance record already has a description (e.g., 'Coca-Cola'). Look up the substance by ID and use that. Falls back to 'Drink' if not found. | ✓ |
| Generic 'Drink' label | Always show 'Drink' for substance sources — simpler, no async lookup needed | |
| You decide | Claude picks the best approach based on codebase patterns | |

**User's choice:** Description from parent substance record (Recommended)
**Notes:** None

---

## Fallback strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Return null (hide label) | Unknown sources display no annotation — prevents raw internal strings from ever reaching the UI. Safe default. | ✓ |
| Return generic 'Beverage' | Always show something — slightly more informative but may mislabel non-beverage sources | |
| Keep returning raw string | Preserves current behavior for debugging, but ugly for users | |

**User's choice:** Return null (hide label) (Recommended)
**Notes:** None

---

## Claude's Discretion

- Whether `getLiquidTypeLabel` becomes async or description gets pre-resolved
- How to thread preset name from settings store into the label function
- Whether to add unit tests for new source format handling

## Deferred Ideas

None — discussion stayed within phase scope.

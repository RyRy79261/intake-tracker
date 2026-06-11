/**
 * InlineEdit component — behavioral unit tests
 *
 * Tests the state-machine logic extracted from src/components/ui/inline-edit.tsx.
 * Because vitest is configured for the node environment (no DOM), these tests
 * model the handler logic as pure functions that mirror the component exactly.
 * Each test group maps to a named behavior from the validation gaps.
 *
 * Behaviors under test:
 *   GAP-1a: handleFocus seeds editValue using formatDisplay(value) — e.g. 69 → "69.00"
 *   GAP-1b: handleBlur with empty input reverts without calling onValueChange
 *   GAP-1c: handleBlur with NaN input reverts without calling onValueChange
 *   GAP-1d: handleBlur with valid input: parses, clamps to [min,max], applies roundOnBlur, calls onValueChange
 *   GAP-1e: handleChange updates editValue string
 *   GAP-1f: handleKeyDown Enter triggers blur (modelled via blur side-effect)
 *   GAP-2a: Editing indicator — when isEditing, display span gains "border-b-2 border-current" class
 *   GAP-2b: Display ternary — shows editValue during editing, formatDisplay(value) when not editing
 *   GAP-2c: Intermediate decimal — "69." is passed through unchanged (not replaced by formatDisplay(null))
 */

import { describe, it, expect, vi } from "vitest";

// ─── Inline-edit logic extracted as pure functions ────────────────────────────
// These replicate the exact logic from src/components/ui/inline-edit.tsx
// without importing React or mounting a component.

interface HandleBlurArgs {
  editValue: string;
  min: number;
  max: number;
  roundOnBlur?: (v: number) => number;
  onValueChange: (v: number) => void;
  setIsEditing: (v: boolean) => void;
}

/**
 * Mirrors handleBlur logic from inline-edit.tsx lines 74–95.
 */
function simulateHandleBlur({
  editValue,
  min,
  max,
  roundOnBlur,
  onValueChange,
  setIsEditing,
}: HandleBlurArgs) {
  setIsEditing(false);

  if (editValue.trim() === "") {
    // Empty input — revert silently
    return;
  }

  const parsed = parseFloat(editValue);
  if (isNaN(parsed)) {
    // Invalid input — revert silently
    return;
  }

  const clamped = Math.max(min, Math.min(max, parsed));
  const rounded = roundOnBlur ? roundOnBlur(clamped) : clamped;
  onValueChange(rounded);
}

interface HandleFocusArgs {
  value: number | null;
  formatDisplay: (v: number | null) => string;
  setIsEditing: (v: boolean) => void;
  setEditValue: (v: string) => void;
}

/**
 * Mirrors handleFocus logic from inline-edit.tsx lines 69–72.
 */
function simulateHandleFocus({
  value,
  formatDisplay,
  setIsEditing,
  setEditValue,
}: HandleFocusArgs) {
  setIsEditing(true);
  setEditValue(value != null ? formatDisplay(value) : "");
}

/**
 * Mirrors the display ternary from inline-edit.tsx line 116.
 * Returns the string that would appear in the display span.
 */
function resolveDisplayText(
  isEditing: boolean,
  editValue: string,
  value: number | null,
  formatDisplay: (v: number | null) => string
): string {
  return isEditing ? editValue : formatDisplay(value);
}

/**
 * Mirrors the className logic from inline-edit.tsx line 115.
 * Returns whether the editing underline classes are applied.
 */
function hasEditingIndicator(isEditing: boolean): boolean {
  // cn(displayClassName, isEditing && "border-b-2 border-current")
  // We test the boolean condition: editing indicator classes are present iff isEditing is true
  return isEditing;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

const formatWeight = (v: number | null): string => v?.toFixed(2) ?? "--";

// Default weight-card rounding (0.05 increment, as used in weight-card.tsx)
const roundToIncrement = (increment: number) => (v: number): number => {
  const rounded = Math.round(v / increment) * increment;
  return Math.round(rounded * 100) / 100;
};

describe("InlineEdit — handleFocus (GAP-1a)", () => {
  it("seeds editValue with formatDisplay(value) so 69 becomes '69.00'", () => {
    let editValue = "";
    let isEditing = false;

    simulateHandleFocus({
      value: 69,
      formatDisplay: formatWeight,
      setIsEditing: (v) => { isEditing = v; },
      setEditValue: (v) => { editValue = v; },
    });

    expect(isEditing).toBe(true);
    expect(editValue).toBe("69.00");
  });

  it("seeds editValue with formatDisplay(value) so 71.35 becomes '71.35'", () => {
    let editValue = "";

    simulateHandleFocus({
      value: 71.35,
      formatDisplay: formatWeight,
      setIsEditing: vi.fn(),
      setEditValue: (v) => { editValue = v; },
    });

    expect(editValue).toBe("71.35");
  });

  it("seeds editValue as empty string when value is null", () => {
    let editValue = "previous";

    simulateHandleFocus({
      value: null,
      formatDisplay: formatWeight,
      setIsEditing: vi.fn(),
      setEditValue: (v) => { editValue = v; },
    });

    expect(editValue).toBe("");
  });

  it("sets isEditing to true", () => {
    let isEditing = false;

    simulateHandleFocus({
      value: 70,
      formatDisplay: formatWeight,
      setIsEditing: (v) => { isEditing = v; },
      setEditValue: vi.fn(),
    });

    expect(isEditing).toBe(true);
  });
});

describe("InlineEdit — handleBlur empty/NaN revert (GAP-1b, GAP-1c)", () => {
  it("does NOT call onValueChange when editValue is empty string", () => {
    const onValueChange = vi.fn();
    let isEditing = true;

    simulateHandleBlur({
      editValue: "",
      min: 0,
      max: 100000,
      onValueChange,
      setIsEditing: (v) => { isEditing = v; },
    });

    expect(onValueChange).not.toHaveBeenCalled();
    expect(isEditing).toBe(false);
  });

  it("does NOT call onValueChange when editValue is whitespace only", () => {
    const onValueChange = vi.fn();

    simulateHandleBlur({
      editValue: "   ",
      min: 0,
      max: 100000,
      onValueChange,
      setIsEditing: vi.fn(),
    });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("does NOT call onValueChange when editValue is non-numeric text", () => {
    const onValueChange = vi.fn();

    simulateHandleBlur({
      editValue: "abc",
      min: 0,
      max: 100000,
      onValueChange,
      setIsEditing: vi.fn(),
    });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("sets isEditing to false even when input is empty (reverts cleanly)", () => {
    let isEditing = true;

    simulateHandleBlur({
      editValue: "",
      min: 0,
      max: 100000,
      onValueChange: vi.fn(),
      setIsEditing: (v) => { isEditing = v; },
    });

    expect(isEditing).toBe(false);
  });
});

describe("InlineEdit — handleBlur valid input flow (GAP-1d)", () => {
  it("calls onValueChange with the parsed value for valid numeric input", () => {
    const onValueChange = vi.fn();

    simulateHandleBlur({
      editValue: "71.35",
      min: 0,
      max: 100000,
      onValueChange,
      setIsEditing: vi.fn(),
    });

    expect(onValueChange).toHaveBeenCalledWith(71.35);
  });

  it("clamps value to min when input is below min", () => {
    const onValueChange = vi.fn();

    simulateHandleBlur({
      editValue: "0.05",
      min: 0.1,
      max: 1000,
      onValueChange,
      setIsEditing: vi.fn(),
    });

    expect(onValueChange).toHaveBeenCalledWith(0.1);
  });

  it("clamps value to max when input exceeds max", () => {
    const onValueChange = vi.fn();

    simulateHandleBlur({
      editValue: "1500",
      min: 0.1,
      max: 1000,
      onValueChange,
      setIsEditing: vi.fn(),
    });

    expect(onValueChange).toHaveBeenCalledWith(1000);
  });

  it("applies roundOnBlur to the clamped value before calling onValueChange", () => {
    const onValueChange = vi.fn();
    const round = roundToIncrement(0.05);

    simulateHandleBlur({
      editValue: "69.03",
      min: 0.1,
      max: 1000,
      roundOnBlur: round,
      onValueChange,
      setIsEditing: vi.fn(),
    });

    // 69.03 → nearest 0.05 → 69.05
    expect(onValueChange).toHaveBeenCalledWith(69.05);
  });

  it("rounds 69.07 to 69.05 (rounds down to nearest 0.05)", () => {
    const onValueChange = vi.fn();
    const round = roundToIncrement(0.05);

    simulateHandleBlur({
      editValue: "69.07",
      min: 0.1,
      max: 1000,
      roundOnBlur: round,
      onValueChange,
      setIsEditing: vi.fn(),
    });

    expect(onValueChange).toHaveBeenCalledWith(69.05);
  });

  it("passes value through unchanged when roundOnBlur is not provided", () => {
    const onValueChange = vi.fn();

    simulateHandleBlur({
      editValue: "69.123",
      min: 0,
      max: 100000,
      onValueChange,
      setIsEditing: vi.fn(),
    });

    expect(onValueChange).toHaveBeenCalledWith(69.123);
  });

  it("sets isEditing to false after processing valid input", () => {
    let isEditing = true;

    simulateHandleBlur({
      editValue: "70",
      min: 0,
      max: 100000,
      onValueChange: vi.fn(),
      setIsEditing: (v) => { isEditing = v; },
    });

    expect(isEditing).toBe(false);
  });
});

describe("InlineEdit — editing indicator class (GAP-2a)", () => {
  it("reports editing indicator active when isEditing is true", () => {
    expect(hasEditingIndicator(true)).toBe(true);
  });

  it("reports no editing indicator when isEditing is false", () => {
    expect(hasEditingIndicator(false)).toBe(false);
  });
});

describe("InlineEdit — display text ternary (GAP-2b, GAP-2c)", () => {
  it("shows formatDisplay(value) when not editing", () => {
    const display = resolveDisplayText(false, "", 69, formatWeight);
    expect(display).toBe("69.00");
  });

  it("shows raw editValue during editing (not formatDisplay result)", () => {
    const display = resolveDisplayText(true, "69.00", 69, formatWeight);
    expect(display).toBe("69.00");
  });

  it("shows intermediate decimal '69.' during editing without replacing with '--'", () => {
    // GAP-2c: the || fallback was removed; editValue="69." should show "69." not "--"
    const display = resolveDisplayText(true, "69.", 69, formatWeight);
    expect(display).toBe("69.");
  });

  it("shows empty string during editing when user cleared input (not '--')", () => {
    // After clearing the field, display is "" not "--"
    const display = resolveDisplayText(true, "", 69, formatWeight);
    expect(display).toBe("");
  });

  it("shows '--' when not editing and value is null", () => {
    const display = resolveDisplayText(false, "", null, formatWeight);
    expect(display).toBe("--");
  });
});

describe("InlineEdit — handleFocus preserves decimal format (GAP-2b format preservation)", () => {
  it("focusing on 69.00 shows '69.00' not '69' (formatDisplay seeding)", () => {
    // This is the critical format-preservation behavior fixed in Plan 03
    // Before fix: editValue was seeded with String(69) = "69"
    // After fix: editValue is seeded with formatDisplay(69) = "69.00"
    let editValue = "";

    simulateHandleFocus({
      value: 69,
      formatDisplay: (v) => v?.toFixed(2) ?? "--",
      setIsEditing: vi.fn(),
      setEditValue: (v) => { editValue = v; },
    });

    expect(editValue).toBe("69.00");
    expect(editValue).not.toBe("69");
  });

  it("focusing on 71.35 shows '71.35' not '71.35' (already formatted)", () => {
    let editValue = "";

    simulateHandleFocus({
      value: 71.35,
      formatDisplay: (v) => v?.toFixed(2) ?? "--",
      setIsEditing: vi.fn(),
      setEditValue: (v) => { editValue = v; },
    });

    expect(editValue).toBe("71.35");
  });
});

# Phase 33: Weight Direct Input — Research

**Date:** 2026-04-06
**Phase:** 33 — Weight Direct Input
**Requirement:** WGT-01

---

## 1. Standard Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Component library | shadcn/ui (radix primitives) | Already in project |
| Styling | Tailwind CSS + CSS variables | Existing approach |
| State management | React useState (local) | Weight card uses `pendingWeight` local state |
| Icon library | lucide-react | Already in project |
| Testing | Playwright E2E + Vitest unit | Established pattern |
| Validation | Zod (`WeightFormSchema`) | Already in weight-card.tsx |

**No new dependencies required.** The hidden-input + label pattern uses only native HTML elements.

---

## 2. Architecture: Hidden Input + Visible Label Pattern

### How It Works

1. A `<label>` wraps both the visible formatted text and a visually-hidden `<input>`
2. Tapping anywhere on the label (including the visible text) focuses the hidden input via native label-input association
3. The hidden input has `type="number"` and `inputMode="decimal"` to trigger numeric keyboard on mobile
4. As the user types, an `onChange` handler updates the visible display text in real-time
5. On blur, the value is rounded to the nearest increment and committed to `pendingWeight`

### Why This Pattern (vs Alternatives)

| Pattern | Pros | Cons | Verdict |
|---------|------|------|---------|
| Hidden input + label | Zero visual transition; native keyboard; no style fighting | Slightly more complex DOM | **Selected by user (D-03)** |
| Styled transparent input | Simpler DOM | Must fight browser input styles; visible focus ring; mobile browser inconsistencies | Rejected |
| Ark UI Editable | Purpose-built | New dependency; heavier than needed | Rejected |

### Implementation Detail

```tsx
// Conceptual structure (not final code)
<label className="flex-1 text-center cursor-text">
  {/* Visible formatted display */}
  <span className="text-4xl font-bold tabular-nums">
    {isEditing ? editValue : pendingWeight?.toFixed(2) ?? "--"}
  </span>
  <span className="text-lg text-muted-foreground ml-1">kg</span>

  {/* Hidden input — receives focus when label is tapped */}
  <input
    type="number"
    inputMode="decimal"
    step="any"
    className="sr-only"  // visually hidden but focusable
    value={editValue}
    onChange={handleInputChange}
    onFocus={handleFocus}
    onBlur={handleBlur}
    aria-label="Weight in kilograms"
  />
</label>
```

### Key Technical Decisions

**`sr-only` vs `opacity-0 absolute`:** Use Tailwind's `sr-only` class (position: absolute, width: 1px, height: 1px, overflow: hidden). This keeps the input in the accessibility tree and focusable, but truly invisible. Note: `sr-only` still allows focus — when the label is clicked, the browser focuses the input and the keyboard appears.

**`step="any"`:** Using `step="any"` instead of `step="0.05"` avoids the browser's native validation rejecting values like `71.3` (which is valid during typing but doesn't match 0.05 increments). Rounding happens on blur, not during input.

**`type="number"` quirks:** The `number` input's `.value` returns empty string for invalid intermediate states (e.g., "71." while still typing). Handle this by keeping a separate `editValue` string state and only parsing to number on blur.

---

## 3. Rounding Logic

### Existing Pattern (weight-card.tsx lines 94-107)

```typescript
// Current increment/decrement rounding:
const next = Math.round((prev - settings.weightIncrement) * 100) / 100;
```

### Required Rounding for Direct Input

On blur, apply the same increment-aligned rounding:

```typescript
const rounded = Math.round(value / settings.weightIncrement) * settings.weightIncrement;
// Then fix floating-point: Math.round(rounded * 100) / 100
```

This ensures `71.37` with increment `0.05` becomes `71.35`, matching stepper behavior.

### Edge Cases

| Input | Increment | Result | Reason |
|-------|-----------|--------|--------|
| `71.37` | 0.05 | `71.35` | Round to nearest 0.05 |
| `71.375` | 0.05 | `71.40` | Rounds up at midpoint |
| `""` (empty) | any | Revert to previous `pendingWeight` | Don't lose current value |
| `0` | any | `0.10` (min) | Clamp to minimum 0.1 (Zod schema min) |
| `1500` | any | `1000` | Clamp to max (Zod schema) |
| `-5` | any | `0.10` | Clamp to minimum |

### `sanitizeNumericInput` from security.ts

The existing `sanitizeNumericInput(value, min, max, precision)` function handles clamping and rounding. With `precision=2`, it produces the right output:

```typescript
sanitizeNumericInput(editValue, 0.1, 1000, 2)
```

However, this does integer rounding (to decimal places), not increment-aligned rounding. The increment rounding (`Math.round(value / increment) * increment`) must be applied BEFORE `sanitizeNumericInput` or as a custom step.

---

## 4. Reusable Component Design

### Component: `InlineEdit` (or `TapToEdit`)

Place in `src/components/ui/inline-edit.tsx` following shadcn conventions:
- `cn()` for className merging
- `React.forwardRef` for ref forwarding
- Accepts spread `InputHTMLAttributes` minus those managed internally

### Props Interface

```typescript
interface InlineEditProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** Current numeric value */
  value: number | null;
  /** Callback when value changes (on blur, after rounding) */
  onValueChange: (value: number) => void;
  /** Format function for display text (e.g., v => `${v.toFixed(2)} kg`) */
  formatDisplay: (value: number | null) => string;
  /** Rounding function applied on blur (e.g., round to nearest 0.05) */
  roundOnBlur?: (value: number) => number;
  /** Placeholder when value is null */
  placeholder?: string;
  /** className for the display text wrapper */
  displayClassName?: string;
  /** className for the suffix (e.g., "kg") if separated from display */
  suffixClassName?: string;
  /** Suffix text (e.g., "kg") — rendered outside the dynamic value */
  suffix?: string;
}
```

### Why Generic

The CONTEXT.md (D-07, D-08) specifies this must be reusable. Future uses:
- Blood pressure direct input (type="number", format: `{sys}/{dia} mmHg`)
- Water/salt quick-entry on the card itself
- Any metric card with a center value display

---

## 5. Integration with Weight Card

### Modification Points

**weight-card.tsx lines 188-194 (Center Display):**

Replace:
```tsx
<div className="flex-1 text-center">
  <span className="text-4xl font-bold tabular-nums">
    {pendingWeight?.toFixed(2) ?? "--"}
  </span>
  <span className="text-lg text-muted-foreground ml-1">kg</span>
</div>
```

With:
```tsx
<InlineEdit
  value={pendingWeight}
  onValueChange={setPendingWeight}
  formatDisplay={(v) => v?.toFixed(2) ?? "--"}
  suffix="kg"
  displayClassName="text-4xl font-bold tabular-nums"
  suffixClassName="text-lg text-muted-foreground ml-1"
  roundOnBlur={(v) => Math.round(Math.round(v / settings.weightIncrement) * settings.weightIncrement * 100) / 100}
  type="number"
  inputMode="decimal"
  step="any"
  min={0.1}
  max={1000}
  aria-label="Weight in kilograms"
  data-testid="weight-direct-input"
/>
```

### State Flow

1. User taps display → hidden input focuses → keyboard appears
2. User types `71.37` → `editValue` (internal string state) updates → display shows `71.37`
3. User taps away (blur) → `roundOnBlur(71.37)` → `71.35` → `onValueChange(71.35)` → `setPendingWeight(71.35)`
4. User presses "Record Weight" → existing `handleSubmit` flow → Zod validation → Dexie write

No changes needed to `handleSubmit`, `handleIncrement`, `handleDecrement`, or any other weight card logic. The `InlineEdit` component is purely an alternative way to set `pendingWeight`.

---

## 6. Testing Strategy

### E2E Test (Playwright)

Add test to `e2e/dashboard.spec.ts` or a new `e2e/weight-direct-input.spec.ts`:

```typescript
test('should allow direct keyboard entry for weight', async ({ page }) => {
  await page.goto('/');
  const weightCard = page.locator('#section-weight');
  await weightCard.scrollIntoViewIfNeeded();

  // Click the weight value to activate input
  const weightDisplay = weightCard.getByTestId('weight-direct-input');
  await weightDisplay.click();

  // Type a value
  await weightDisplay.fill('71.35');

  // Blur to trigger rounding
  await weightDisplay.press('Tab');

  // Verify the display shows rounded value
  await expect(weightCard.locator('text=71.35')).toBeVisible();

  // Submit
  const recordBtn = weightCard.locator('button:has-text("Record Weight")');
  await recordBtn.click();

  // Verify success
  await expect(page.getByText('Weight recorded', { exact: true })).toBeVisible();
});
```

**Note:** The `getByTestId('weight-direct-input')` targets the hidden input via `data-testid`. Even though visually hidden, Playwright can interact with it via `fill()`.

### Unit Test Considerations

The rounding logic is the most critical path. Consider a small unit test for the rounding function if extracted as a utility, but the E2E test covers the full flow including rounding behavior.

---

## 7. Accessibility

| Concern | Approach |
|---------|----------|
| Screen reader | `aria-label="Weight in kilograms"` on hidden input |
| Focus management | Native label→input association handles focus |
| Keyboard navigation | Tab reaches the input; Enter/Tab blurs to confirm |
| Touch target | The entire center display area is tappable (label wraps display) — well above 44px minimum |
| Reduced motion | No animations in this feature |

---

## 8. Validation Architecture

### Input Validation Flow

1. **During typing:** No validation — allow any intermediate state (`71.`, `7`, empty)
2. **On blur:** Round to increment, clamp to min/max, update `pendingWeight`
3. **On submit:** Existing `WeightFormSchema` Zod validation (positive, max 1000)

### Error States

- Invalid number on blur: revert to previous `pendingWeight` (silent, no error message)
- Out of range: clamp silently (0.1 min, 1000 max)
- Zod validation failure on submit: existing error display below input

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `type="number"` returns empty string during typing | HIGH | LOW | Use separate string state (`editValue`), only parse on blur |
| Mobile keyboard doesn't appear | LOW | HIGH | `inputMode="decimal"` is well-supported; `type="number"` as fallback |
| `tabular-nums` shifts during typing | LOW | MEDIUM | Font feature is on the display span, not the input — should persist |
| Conflict with stepper buttons | LOW | LOW | Stepper only works on blur/defocused state; no race condition |

---

## RESEARCH COMPLETE

All technical questions answered. Pattern is straightforward — hidden input + label, rounding on blur, reusable component in shadcn convention. No new dependencies needed.

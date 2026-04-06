# Phase 35: Preset Fixes - Research

## Research Goal
What do I need to know to PLAN fixing coffee preset AI auto-population and preset deletion from the grid?

## Key Findings

### 1. AI Auto-Population on Preset Creation

**Current Flow (preset-tab.tsx):**
- User types a beverage name in `searchText` input
- Clicks sparkle icon or presses Enter → `handleAiLookup()` fires
- AI response populates: `caffeinePer100ml`, `alcoholPer100ml`, `volumeMl`, `beverageName`, `waterContentPercent`
- State flag `aiLookupUsed` is set to `true` on successful lookup (line 141)
- "Save as preset & log" button appears when `beverageName.trim()` is truthy (line 449)
- Button is currently **not gated** on `aiLookupUsed` — user can save a preset with zero substance data

**What Needs to Change (D-01, D-02, D-03):**
- The "Save as preset & log" button must be disabled (not hidden) until `aiLookupUsed === true`
- Add a visual cue (tooltip or helper text) explaining "Use AI lookup first"
- The `aiLookupUsed` flag already exists — just needs to gate the button's `disabled` prop

**Implementation Complexity:** LOW — single prop change + optional tooltip text.

**Edge Cases:**
- User performs AI lookup, then manually changes substance values → still OK, `aiLookupUsed` is true
- User selects an existing preset (which already has substance data) → `aiLookupUsed` remains false (correct — selecting existing preset != creating new)
- `aiLookupUsed` resets on `resetFields()` (line 291) — correct behavior

### 2. Preset Deletion from Grid

**Current Delete Implementation:**
- `deleteLiquidPreset(id)` exists in settings-store.ts (line 276-278) — filters preset by ID from array
- Zustand persist triggers re-render immediately — no page refresh needed
- `customization-panel.tsx` uses this for Settings delete UI (with `Trash2` icon)
- **No delete functionality exists in `preset-tab.tsx`** — only tap-to-select

**What Needs to Be Built (D-04 through D-07):**
- Long-press gesture (~500ms) on preset grid buttons
- Confirm dialog using shadcn AlertDialog (already available at `src/components/ui/alert-dialog.tsx`)
- Wire `deleteLiquidPreset` into preset-tab.tsx
- All presets deletable (including `isDefault: true`)

**Long-Press Implementation Approaches:**

| Approach | Pros | Cons |
|----------|------|------|
| Pointer events (onPointerDown/Up) | Works on touch + mouse, modern API | Need to handle `pointercancel`, scroll-abort |
| Touch events (onTouchStart/End) | Native mobile feel | Doesn't work on desktop |
| useRef + setTimeout | Simple, no dependencies | Manual cleanup |
| `use-long-press` library | Full-featured | New dependency (user dislikes third-party) |

**Recommended:** Pointer events with `useRef` + `setTimeout`. Handle:
1. `onPointerDown` → start timer (500ms)
2. `onPointerUp` / `onPointerCancel` / `onPointerLeave` → clear timer
3. If timer fires → set `longPressedPresetId` state → show AlertDialog
4. Prevent normal click from firing after long-press (use a `longPressTriggered` ref)

**AlertDialog Integration:**
- shadcn AlertDialog is available and imported elsewhere in the project
- Pattern: controlled via state (`longPressedPresetId: string | null`)
- When non-null, show dialog with preset name; on confirm, call `deleteLiquidPreset(id)`

### 3. File Inventory

| File | Role | Changes Needed |
|------|------|----------------|
| `src/components/liquids/preset-tab.tsx` | Main preset grid + creation UI | Gate save button, add long-press + delete |
| `src/stores/settings-store.ts` | Zustand store with CRUD | None — `deleteLiquidPreset` already exists |
| `src/components/ui/alert-dialog.tsx` | shadcn AlertDialog | None — already available |
| `src/lib/constants.ts` | LiquidPreset type | None — type already supports all fields |
| `src/stores/__tests__/settings-store-presets.test.ts` | Preset CRUD tests | None — delete already tested |

### 4. Substance Lookup API Shape

The `/api/ai/substance-lookup` returns:
```typescript
{
  substancePer100ml: number;  // caffeine mg or ABV %
  defaultVolumeMl: number;
  beverageName: string;
  reasoning: string;
  waterContentPercent: number;
}
```

The `handleAiLookup()` in preset-tab.tsx already correctly maps `substancePer100ml` to the appropriate per-100ml field based on tab type (coffee → caffeinePer100ml, alcohol → alcoholPer100ml).

### 5. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Long-press conflicts with scroll on mobile | Medium | Clear timer on pointer leave/cancel; use `touch-action: manipulation` |
| Long-press fires but onClick also fires | Medium | Use `longPressTriggered` ref to prevent click handler |
| User accidentally deletes preset | Low | Confirm dialog (D-06) |
| AI lookup fails → button stays disabled forever | Low | Button only disabled for save-as-preset; manual "Log Entry" still works |

## Validation Architecture

### Testable Dimensions

1. **AI Gate:** "Save as preset & log" button disabled state when `aiLookupUsed` is false
2. **AI Gate Active:** Button enabled after AI lookup succeeds
3. **Long-Press:** Confirm dialog appears after 500ms press on preset button
4. **Delete Flow:** Preset removed from grid after confirm
5. **Click Prevention:** Normal tap still selects/deselects (no accidental delete)

### Verification Commands

```bash
# Type check
pnpm tsc --noEmit

# Lint
pnpm lint

# Existing preset tests still pass
pnpm vitest run src/stores/__tests__/settings-store-presets.test.ts

# E2E (if preset tests exist)
pnpm test:e2e
```

## RESEARCH COMPLETE

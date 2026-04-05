# Phase 14: Unified Liquids Card - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 14-unified-liquids-card
**Areas discussed:** Tab layout and switching, Coffee/alcohol preset UX, Water tab preservation

---

## Tab Layout and Switching

### Juice/food types

| Option | Description | Selected |
|--------|-------------|----------|
| Remove both | Juice and food removed from Liquids card entirely | |
| Keep juice as water preset | Juice becomes a built-in water-type preset | |
| 4 tabs: Water / Beverage / Coffee / Alcohol | Beverage for non-water, non-coffee, non-alcohol drinks | ✓ |

**User's choice:** 4 tabs with Beverage for juice-like drinks
**Notes:** User wanted juice kept as a useful category but renamed to "Beverage" or similar. Food-derived water entries viewable in records/history via composable group display.

### Tab persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Remember last tab | Store in Zustand | |
| Always start on water | Water is always default | ✓ |
| You decide | | |

**User's choice:** Always start on water

### Beverage tab design

| Option | Description | Selected |
|--------|-------------|----------|
| Same as water + name field | Water-style +/- buttons + text field for name. No substance tracking. | ✓ |
| Preset-based like coffee | User creates beverage presets with optional substance content | |
| You decide | | |

**User's choice:** Same as water + name field

---

## Coffee/Alcohol Preset UX

### Preset display

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal scroll pills | Row of pill buttons, scrollable | |
| Vertical list | Stacked list with full info | |
| Grid buttons | 2-column grid (like quick-add) | ✓ |
| You decide | | |

**User's choice:** Grid buttons

### Confirm flow

| Option | Description | Selected |
|--------|-------------|----------|
| One-tap log, undo toast | Instant log on preset tap | |
| Select → adjust volume → confirm | Preset fills fields, user adjusts then confirms | ✓ |
| You decide | | |

**User's choice:** Select → adjust volume → confirm

### AI FAB placement

**User's choice:** Not a FAB — inline text input with AI icon button at the end. Type beverage name, tap AI icon, shows spinner, populates fields. Located below the preset grid.
**Notes:** User clarified this is not a floating action button. It's a search-bar style text input with an AI trigger icon. Dual-purpose: can also be used for manual entry without AI.

### Save behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Log + Save as Preset | Two buttons: "Log" and "Save & Log" | ✓ |
| Always save as preset | Auto-save on AI lookup | |
| You decide | | |

**User's choice:** Log + Save as Preset (two buttons)

### Manual entry

**User's choice:** Text input is dual-purpose. User can type a name and manually fill per-100ml/volume fields without triggering AI. Important for cases where user roughly knows caffeine content.

---

## Water Tab Preservation

### Change level

| Option | Description | Selected |
|--------|-------------|----------|
| Exact lift, no changes | Pixel-perfect copy | |
| Lift + minor polish | Same core UX, small improvements welcome | ✓ |
| You decide | | |

**User's choice:** Lift + minor polish

---

## Claude's Discretion

- Component decomposition strategy
- Tab animation
- Grid button visual design
- Substance amount display format
- AI loading/error states
- Per-100ml field visibility logic

## Deferred Ideas

None

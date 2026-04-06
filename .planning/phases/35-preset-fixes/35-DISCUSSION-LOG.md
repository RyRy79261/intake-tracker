# Phase 35: Preset Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 35-Preset Fixes
**Areas discussed:** AI auto-population trigger, Preset deletion UX

---

## AI Auto-Population Trigger

### When should AI lookup trigger?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-trigger on Save | Auto-run lookup when saving without prior AI data | |
| Require lookup before Save | Disable Save button until AI lookup performed | ✓ |
| Keep manual, warn if empty | Allow save without data, show warning toast | |

**User's choice:** Require lookup before Save
**Notes:** Forces explicit AI lookup step, prevents presets with zero substance data

### Save button visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Always show, disabled until lookup | Button visible but grayed out with tooltip | ✓ |
| Only appear after lookup | Button hidden until AI lookup completes | |

**User's choice:** Always show, disabled until lookup
**Notes:** User sees the option exists but understands what's needed

---

## Preset Deletion UX

### Delete gesture

| Option | Description | Selected |
|--------|-------------|----------|
| Long-press to delete | ~500ms long-press shows confirm dialog | ✓ |
| Edit mode toggle | Add Edit button above grid, X badges on presets | |
| Swipe to delete | Swipe left to reveal delete action | |

**User's choice:** Long-press to delete
**Notes:** Natural mobile gesture, no UI clutter

### Deletable scope

| Option | Description | Selected |
|--------|-------------|----------|
| All presets deletable | Including default/built-in presets | ✓ |
| Only user-created presets | Default presets protected | |

**User's choice:** All presets deletable
**Notes:** Full user control, simpler logic

### Delete confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm dialog | "Delete [name]?" with Cancel/Delete buttons | ✓ |
| Toast with undo | Delete immediately, undo via toast for 5s | |
| No confirmation | Delete on long-press immediately | |

**User's choice:** Confirm dialog
**Notes:** Prevents accidental deletions from long-press

---

## Claude's Discretion

- Long-press detection implementation approach
- Confirm dialog styling
- Disabled button tooltip implementation

## Deferred Ideas

None — discussion stayed within phase scope

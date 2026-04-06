---
phase: 35-preset-fixes
plan: 02
subsystem: ui
tags: [react, zustand, preset, long-press, alert-dialog, radix]

requires:
  - phase: 35-01
    provides: AI lookup gate on save-as-preset button
provides:
  - Long-press delete gesture for preset grid
  - AlertDialog confirmation for preset deletion
affects: []

tech-stack:
  added: []
  patterns:
    - "Long-press gesture: pointer events + setTimeout + ref-based click prevention"
    - "Controlled AlertDialog: state-driven open/close via deletePresetId"

key-files:
  created: []
  modified:
    - src/components/liquids/preset-tab.tsx

key-decisions:
  - "Used pointer events (not touch events) for cross-platform long-press detection"
  - "500ms timer with longPressTriggeredRef to prevent click handler from firing after long-press"
  - "Wrapped selectPreset and handlePresetTap in useCallback to satisfy exhaustive-deps lint rule"

patterns-established:
  - "Long-press pattern: onPointerDown starts timer, onPointerUp/Cancel/Leave clears it, ref prevents click"
  - "Delete confirmation: controlled AlertDialog with destructive action styling"

requirements-completed: [PRES-02]

duration: 3min
completed: 2026-04-06
---

# Plan 35-02: Long-press delete for preset grid Summary

**Implemented 500ms long-press gesture on preset grid buttons with AlertDialog confirmation and immediate Zustand-driven removal**

## Performance

- **Duration:** 3 min
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Long-press (~500ms) on any preset button triggers delete confirmation dialog
- Normal tap still selects/deselects presets (no accidental deletes)
- AlertDialog shows preset name with Cancel/Delete (destructive red) buttons
- All presets deletable including defaults (isDefault: true)
- Toast notification "Deleted" / "{name} removed" on successful delete
- Immediate grid update via Zustand re-render

## Task Commits

1. **Task 1: Add long-press detection and delete state** - `7c0ef0b` (feat)
2. **Task 2: Add AlertDialog for delete confirmation** - `7c0ef0b` (feat, same commit)

## Files Created/Modified
- `src/components/liquids/preset-tab.tsx` - Added useRef/useCallback imports, AlertDialog imports, deletePresetId state, longPressTimerRef/longPressTriggeredRef refs, pointer event handlers, delete confirmation dialog

## Decisions Made
- Used pointer events (onPointerDown/Up/Cancel/Leave) for cross-device compatibility (touch + mouse)
- Added `touch-manipulation` CSS class to prevent browser zoom on long-press
- Wrapped `selectPreset` in `useCallback` to satisfy react-hooks/exhaustive-deps lint rule
- If deleted preset was currently selected, resetFields() clears the form

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Wrapped selectPreset in useCallback**
- **Found during:** Task 1 (handlePresetTap useCallback wrapping)
- **Issue:** Lint warning: selectPreset makes dependencies of useCallback change on every render
- **Fix:** Wrapped selectPreset in useCallback with empty deps (all setters are stable)
- **Files modified:** src/components/liquids/preset-tab.tsx
- **Verification:** `pnpm lint` shows no warnings for preset-tab.tsx
- **Committed in:** 7c0ef0b

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Performance improvement via stable callback references. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Preset fixes complete, both PRES-01 and PRES-02 requirements addressed
- No blockers for subsequent phases

## Self-Check: PASSED

---
*Phase: 35-preset-fixes*
*Completed: 2026-04-06*

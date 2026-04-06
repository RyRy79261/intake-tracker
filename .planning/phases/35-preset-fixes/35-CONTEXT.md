# Phase 35: Preset Fixes - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Coffee presets are created with accurate substance data (caffeine/alcohol per 100ml via AI lookup) and can be reliably removed from the preset grid. Two independent bug fixes scoped to the preset system.

</domain>

<decisions>
## Implementation Decisions

### AI Auto-Population on Preset Creation
- **D-01:** Require AI lookup before the "Save as preset & log" button becomes active. User must use the sparkle/search AI lookup to populate substance data before saving a new preset.
- **D-02:** The "Save as preset & log" button is always visible but disabled (grayed out) until AI lookup has been performed. A tooltip or visual cue indicates "Use AI lookup first".
- **D-03:** The existing `aiLookupUsed` state flag in `preset-tab.tsx` can gate the button's enabled state.

### Preset Deletion from Grid
- **D-04:** Long-press (~500ms) on a preset in the grid triggers deletion flow. Normal tap continues to select/deselect as before.
- **D-05:** All presets are deletable — including default/built-in presets (isDefault: true). User has full control.
- **D-06:** Deletion requires a confirm dialog: "Delete [preset name]?" with Cancel/Delete buttons. Prevents accidental deletions from long-press.
- **D-07:** After deletion, the preset disappears from the grid immediately (Zustand state update triggers re-render). No page refresh or navigation needed.

### Claude's Discretion
- Long-press detection implementation approach (pointer events, touch events, or library)
- Confirm dialog styling (shadcn AlertDialog or custom)
- Disabled button tooltip implementation
- Whether to add haptic feedback on long-press (if available)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Preset system
- `src/components/liquids/preset-tab.tsx` — Main preset grid UI, AI lookup handler, save-as-preset flow
- `src/stores/settings-store.ts` — `addLiquidPreset`, `deleteLiquidPreset` store actions, LiquidPreset type
- `src/lib/constants.ts` — `LiquidPreset` type definition, `DEFAULT_LIQUID_PRESETS`

### Existing delete implementation (reference)
- `src/components/customization-panel.tsx` — Existing preset delete UI in Settings (lines ~201, ~305)

### AI lookup
- `src/app/api/ai/substance-lookup/schema.ts` — AI substance lookup API schema
- `src/stores/__tests__/settings-store-presets.test.ts` — Existing preset CRUD tests

### Requirements
- `.planning/REQUIREMENTS.md` — PRES-01 (AI auto-populate), PRES-02 (delete from grid)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `deleteLiquidPreset(id)` store action: Already exists, tested, works — just not wired into preset-tab.tsx
- `aiLookupUsed` state flag: Already tracks whether AI lookup was performed in current session
- `handleAiLookup()`: Complete AI lookup flow with error handling and toast feedback
- shadcn AlertDialog component: Available for confirm dialog

### Established Patterns
- Zustand store mutations trigger immediate React re-renders — deletion will update grid automatically
- Toast notifications for success/error feedback (used throughout preset-tab.tsx)
- `crypto.randomUUID()` for preset IDs

### Integration Points
- `preset-tab.tsx` preset grid buttons: Add long-press handler alongside existing onClick
- `handleSaveAndLog`: Gate with `aiLookupUsed` check for the disabled state
- `useSettingsStore` selectors: Already imported in preset-tab.tsx, just need `deleteLiquidPreset`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 35-preset-fixes*
*Context gathered: 2026-04-06*

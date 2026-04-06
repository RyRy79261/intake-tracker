# Phase 39: Preset Save-and-Log Label Fix - Context

**Gathered:** 2026-04-06 (assumptions mode — gap closure from v1.4 audit)
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the Save-and-Log flow in preset-tab.tsx so the logged water entry references the new preset's UUID instead of "preset:manual". Also clean up orphaned Zustand exports from salt-section deletion.

</domain>

<decisions>
## Implementation Decisions

### Preset ID Propagation
- **D-01:** `addLiquidPreset` in settings-store.ts must return the generated UUID so the caller can use it
- **D-02:** `handleSaveAndLog` in preset-tab.tsx must capture the returned UUID and pass it to `buildComposableEntry` (or set `selectedPresetId` before calling it)
- **D-03:** The simplest fix: have `addLiquidPreset` return the new preset's `id`, then use it in `buildComposableEntry`'s `groupSource` and water entry `source` fields

### Dead Code Cleanup
- **D-04:** Remove `sodiumPresets`, `addSodiumPreset`, `deleteSodiumPreset` from settings-store.ts — unused after salt-section.tsx deletion in Phase 34
- **D-05:** Remove the `SodiumPreset` type and `sodiumPresets` initial state if no other consumers exist

### Claude's Discretion
- Exact implementation approach (return ID from store action vs generate ID before calling store)
- Whether to also clean up any other orphaned exports found during implementation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Bug source
- `.planning/v1.4-MILESTONE-AUDIT.md` — Gap details, integration checker findings
- `src/components/liquids/preset-tab.tsx` lines 299-315 — `handleSaveAndLog` function with the bug
- `src/stores/settings-store.ts` lines 263-268 — `addLiquidPreset` generates UUID internally

### Label resolution
- `src/lib/utils.ts` line 78 — `getLiquidTypeLabel` returns null for "preset:manual"
- `src/components/liquids/water-tab.tsx` line 225 — caller of getLiquidTypeLabel

</canonical_refs>

<code_context>
## Existing Code Insights

### Root Cause
`addLiquidPreset` (settings-store.ts:263) uses `crypto.randomUUID()` internally and does NOT return the generated ID. `handleSaveAndLog` (preset-tab.tsx:303) calls `addPreset(...)` then immediately calls `buildComposableEntry()` which reads `selectedPresetId` — but that's `null` during the AI lookup flow. Result: entry gets `source: "preset:manual"`.

### Fix Pattern
Either:
1. Have `addLiquidPreset` return the new ID (change store action signature)
2. Generate UUID before calling `addPreset`, pass it in as `id` field
3. Set `selectedPresetId` to the new ID before calling `buildComposableEntry`

Option 1 is cleanest — minimal surface area change.

### Orphaned Exports
`sodiumPresets` (settings-store.ts:68), `addSodiumPreset` (line 116), `deleteSodiumPreset` (line 117) — only consumed by the store's own migration logic and the deleted `salt-section.tsx`.

### Integration Points
- `buildComposableEntry` at line 205-226 uses `selectedPresetId` for source field
- `getLiquidTypeLabel` resolves `preset:{uuid}` to preset name via lookup
- All history views (water-tab, record-row, history-drawer, records-tab) already handle `preset:{uuid}` correctly from Phase 37

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward bug fix with well-understood root cause from the integration checker.

</specifics>

<deferred>
## Deferred Ideas

None — analysis stayed within phase scope.

</deferred>

---

*Phase: 39-preset-save-and-log-label-fix*
*Context gathered: 2026-04-06*

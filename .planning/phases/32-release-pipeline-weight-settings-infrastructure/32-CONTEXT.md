# Phase 32: Release Pipeline + Weight Settings Infrastructure - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix release-please PR creation permissions so automated releases work again, and establish correct decimal precision for weight tracking throughout the settings-helpers, security sanitizer, settings store, and weight card display pipeline. This phase does NOT add direct keyboard input for weight (Phase 33) or change any non-weight UI.

</domain>

<decisions>
## Implementation Decisions

### Weight Settings UI
- **D-01:** New `weight-settings-section.tsx` component using the same +/- stepper pattern as `water-settings-section.tsx` and `salt-settings-section.tsx`
- **D-02:** Dedicated "Weight" section on the Settings page, placed near water/salt sections since they're all intake-related

### Decimal Precision Strategy
- **D-03:** Make `sanitizeNumericInput` in `security.ts` generic — change from `parseInt` to `parseFloat`, add optional precision parameter, default to `Math.round` so all existing integer callers keep working unchanged
- **D-04:** Fix `settings-helpers.ts` `validateAndSave` to use `parseFloat` instead of `parseInt` so decimal values like 0.05 are preserved
- **D-05:** Weight card rounding uses fixed `*100/100` (2 decimal places) instead of current `*10/10`, covering both 0.05 and 0.1 increments without dynamic calculation

### Default Increment Value
- **D-06:** Change default `weightIncrement` in settings store from 0.1 to 0.05
- **D-07:** Allowed range for weight increment: 0.05 to 1.0, with 0.05 step size on the Settings stepper
- **D-08:** `setWeightIncrement` in settings store must use the updated decimal-safe `sanitizeNumericInput` with appropriate precision

### Release-Please Fix
- **D-09:** Fix is at GitHub repo settings level (Settings > Actions > General > Workflow permissions), not in the YAML file which already has correct permissions
- **D-10:** Document the fix — add troubleshooting notes to existing CI/deployment docs so the fix is findable if permissions break again

### Claude's Discretion
- Exact placement order of the Weight section relative to other Settings sections
- Settings stepper step size label formatting (e.g., "0.05 kg" vs "0.05")
- Documentation format and location for the release-please troubleshooting note

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Weight precision pipeline
- `src/lib/settings-helpers.ts` — `validateAndSave` uses `parseInt` on line 14; must change to `parseFloat`
- `src/lib/security.ts` lines 53-58 — `sanitizeNumericInput` uses `parseInt` + `Math.round`; must become decimal-safe
- `src/stores/settings-store.ts` — Default `weightIncrement: 0.1` on line 159; `setWeightIncrement` on line 257-258 uses `sanitizeNumericInput`
- `src/components/weight-card.tsx` lines 94-107 — `handleDecrement`/`handleIncrement` use `*10/10` rounding

### Settings UI patterns
- `src/components/settings/water-settings-section.tsx` — Reference pattern for +/- stepper settings UI
- `src/components/settings/salt-settings-section.tsx` — Reference pattern for +/- stepper settings UI

### Release pipeline
- `.github/workflows/release-please.yml` — Current workflow config (permissions already correct in YAML)

### Requirements
- `.planning/REQUIREMENTS.md` — REL-01, WGT-02, WGT-03 requirements for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `water-settings-section.tsx` / `salt-settings-section.tsx`: Exact pattern to follow for weight increment stepper UI
- `settings-helpers.ts` `incrementSetting`/`decrementSetting`: Already handles step + clamp logic, just needs decimal support
- `settings-helpers.ts` `validateAndSave`: Handles input validation + save, needs parseInt → parseFloat fix
- `useSettings` hook: Already exposes `weightIncrement` and `setWeightIncrement`

### Established Patterns
- Settings sections: Each is a standalone component imported into the settings page
- Zustand store with `sanitizeNumericInput` for all numeric setters
- `persist` middleware with version migration for settings store changes

### Integration Points
- `settings-store.ts` default value change (0.1 → 0.05) — may need store migration if existing users have persisted 0.1
- `security.ts` `sanitizeNumericInput` — used by multiple setters; changes must be backward-compatible
- Settings page layout — new Weight section component needs to be imported and placed

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches matching existing patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 32-release-pipeline-weight-settings-infrastructure*
*Context gathered: 2026-04-06*

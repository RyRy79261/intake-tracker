# Phase 40: Settings Accordion Restructure - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Reorganize the settings page from a flat list of 12+ sections into 6 grouped, expandable accordion sections with color-coded headers. Eliminate all modals except Debug. Surface orphaned medication settings. Add a Storage & Security placeholder section.

</domain>

<decisions>
## Implementation Decisions

### Section Grouping
- **D-01:** 6 domain-based accordion groups: Tracking, Customization, Medication, Data & Storage, Privacy & Security, Debug
- **D-02:** Each group gets a distinct color for its header icon (extend existing per-section color pattern to group level)
- **D-03:** Group mapping:
  - **Tracking** — Day start hour, Water settings, Salt settings, Weight settings (+ weight graph toggles from modal), Substance/liquid settings (+ liquid presets from modal), Urination/defecation defaults (from modal)
  - **Customization** — Appearance (theme), Quick nav order, Animation timing (NEW — SET-03)
  - **Medication** — Regions (primary/secondary), Dose reminders/time format/follow-up config (orphaned MedicationSettingsSection — SET-04)
  - **Data & Storage** — Backup/restore, Sync status placeholder ("Local only" badge), Storage info (IndexedDB usage + record counts) — SET-05
  - **Privacy & Security** — Account, Permissions
  - **Debug** — Debug panel, App Updates section
- **D-04:** App Updates section lives inside the Debug group (power-user concern)

### Accordion Behavior
- **D-05:** Single-open mode — opening one group closes any other open group
- **D-06:** Tracking group expanded by default on page load
- **D-07:** Reset to Defaults button and About dialog stay outside the accordion at the bottom of the page (page-level actions, always visible)

### Modal Decomposition
- **D-08:** CustomizationPanel dialog is deleted entirely (SET-06 — no modals except Debug)
- **D-09:** Liquid presets move to Tracking group under Substance settings, keeping the existing tabbed view (coffee/alcohol/beverage tabs) rendered inline instead of in a dialog
- **D-10:** Urination/defecation defaults move to Tracking group as a new sub-section
- **D-11:** Weight graph toggles move to Tracking group under Weight settings

### Storage & Security Placeholder
- **D-12:** Show estimated IndexedDB storage usage and record counts per table
- **D-13:** Display "Local only" badge for sync status (real sync UI comes in Phase 44)
- **D-14:** Include Backup & Restore entry point (existing flow, relocated here)

### Claude's Discretion
- Specific color assignments per accordion group (extend existing color palette)
- Animation/transition style for accordion open/close
- Exact layout of storage stats (table vs list vs summary)
- Whether to use shadcn/ui Accordion component or build on existing Radix Collapsible primitive

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — SET-01 through SET-06 define acceptance criteria for this phase

### Existing Settings Components
- `src/app/settings/page.tsx` — Current flat layout with 12 section imports + CustomizationPanel + DebugPanel
- `src/components/customization-panel.tsx` — Modal to decompose (liquid presets, urination/defecation, weight toggles)
- `src/components/settings/medication-settings-section.tsx` — Orphaned component (not imported in page.tsx, needs to be surfaced)
- `src/components/ui/collapsible.tsx` — Existing Radix Collapsible primitive (potential base for accordion)

### Settings State
- `src/stores/settings-store.ts` — Zustand store with all persisted settings

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/collapsible.tsx` — Radix Collapsible primitive, could form base of accordion
- `src/components/settings/*.tsx` — 13 existing section components, each self-contained with their own color-coded icon+header
- `src/components/customization-panel.tsx` — Contains liquid preset CRUD with tabbed view (coffee/alcohol/beverage), urination/defecation defaults, weight toggles
- `MedicationSettingsSection` — Fully built but not imported in page.tsx (orphaned)

### Established Patterns
- Each settings section follows: colored icon + h3 header + `space-y-3 pl-6` content pattern
- Settings state managed via Zustand with localStorage persistence
- shadcn/ui components for all form elements (Select, Input, Label, Switch, etc.)

### Integration Points
- `src/app/settings/page.tsx` — Main page component that renders all sections (restructure target)
- `src/components/customization-panel.tsx` — Dialog to decompose and delete
- `src/hooks/use-settings.ts` — Settings hook used by multiple sections

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for accordion implementation.

</specifics>

<deferred>
## Deferred Ideas

### Cross-Phase Concern: Auth Migration Data Safety
User concern: switching from Privy to Neon Auth could make the current user account appear as a new one, risking data loss during migration. Currently all data lives in IndexedDB (not tied to Privy user ID), so the auth swap itself is safe. The real risk point is Phase 45 (Data Migration) when local data uploads to NeonDB under the new Neon Auth identity. **Phases 41 and 45 must explicitly address data continuity guarantees.**

</deferred>

---

*Phase: 40-settings-accordion-restructure*
*Context gathered: 2026-04-12*

# Phase 40: Settings Accordion Restructure - Research

**Completed:** 2026-04-12
**Researcher:** Inline (orchestrator-performed)

## Executive Summary

Phase 40 restructures the settings page from a flat list of 12+ independently rendered sections into 6 grouped accordion sections with color-coded headers. The work is purely frontend (no data-layer changes), involving: installing shadcn/ui Accordion, creating an accordion group wrapper, reorganizing sections by domain, decomposing the CustomizationPanel dialog into inline sub-sections, surfacing the orphaned MedicationSettingsSection, creating new Animation Timing and Storage & Security sub-sections, and cleaning up the page layout.

## Current Architecture

### Settings Page Structure (`src/app/settings/page.tsx`)
- Renders 12 section components in a flat `space-y-6` div
- Each section is self-contained with its own colored icon + h3 header + content pattern
- Two modals at the bottom: `CustomizationPanel` (dialog) and `DebugPanel` (collapsible)
- Footer has Reset to Defaults button and AboutDialog

### Existing Section Components (13 total in `src/components/settings/`)
| Component | File | Color | Icon |
|-----------|------|-------|------|
| AccountSection | account-section.tsx | blue-600 | User |
| DaySettingsSection | day-settings-section.tsx | indigo-600 | Clock |
| WaterSettingsSection | water-settings-section.tsx | (uses water theme) | Droplets |
| SaltSettingsSection | salt-settings-section.tsx | (uses salt theme) | Sparkles |
| WeightSettingsSection | weight-settings-section.tsx | emerald-600 | Scale |
| SubstanceSettingsSection | substance-settings-section.tsx | yellow-700/fuchsia-600 | Coffee/Wine |
| AppearanceSection | appearance-section.tsx | slate-600 | Sun |
| QuickNavSection | quick-nav-section.tsx | cyan-600 | Navigation |
| DataManagementSection | data-management-section.tsx | (no color icon) | Download/Upload/Trash |
| PrivacySecuritySection | privacy-security-section.tsx | emerald-600 | Shield |
| PermissionsSection | permissions-section.tsx | purple-600 | ShieldCheck |
| AppUpdatesSection | app-updates-section.tsx | slate-600 | Smartphone |
| MedicationSettingsSection | medication-settings-section.tsx | teal-600 | Pill |

### CustomizationPanel (`src/components/customization-panel.tsx`)
- Renders as a Dialog with 3 tabs: Tracking, Liquid Presets, Graph
- **Tracking tab**: Urination default amount, Defecation default amount (Select components)
- **Liquid Presets tab**: Full CRUD for liquid presets with inline edit/delete/add forms. Uses `useSettingsStore` for `liquidPresets`, `addLiquidPreset`, `updateLiquidPreset`, `deleteLiquidPreset`
- **Graph tab**: Weight graph toggles (Eating, Urination, Defecation, Drinking) using custom `GraphToggle` component with color-coded active states
- Total: ~490 lines including `PresetEditForm` and `GraphToggle` helper components

### MedicationSettingsSection (`src/components/settings/medication-settings-section.tsx`)
- Fully built but NOT imported in `page.tsx` (orphaned)
- Contains: Primary Region and Secondary Region select dropdowns
- Uses `useSettingsStore` for `primaryRegion`, `setPrimaryRegion`, `secondaryRegion`, `setSecondaryRegion`
- Note: CONTEXT.md mentions "dose reminders, time format, follow-up config" but these settings do not exist in the current codebase. Only region settings exist. The phase should surface what exists (regions) and note that dose reminders/time format/follow-up are future additions.

### Animation Timing Settings
- Currently live in `QuickNavSection` under a "Animation Timings" sub-header
- Three settings: scrollDurationMs (100-1000), autoHideDelayMs (0-2000), barTransitionDurationMs (50-500)
- All persisted in Zustand `settings-store.ts` with sanitized numeric inputs
- These need to move to a new "UI/UX" or "Customization" accordion group per CONTEXT.md D-03

### Debug Panel (`src/components/debug-panel.tsx`)
- Already uses Collapsible from Radix (not Dialog)
- Contains audit log viewer, inventory recalculation, data clearing tools
- Should remain as-is but inside the Debug accordion group

### UI Component Inventory
- No `accordion.tsx` exists in `src/components/ui/`
- `@radix-ui/react-accordion` is NOT installed
- `@radix-ui/react-collapsible` IS installed and used by DebugPanel
- shadcn/ui Accordion component is available via `npx shadcn@latest add accordion`

## Technical Approach

### Accordion Component Strategy

**Recommended: Install shadcn/ui Accordion** (`npx shadcn@latest add accordion`)
- Built on `@radix-ui/react-accordion` (same ecosystem as existing Radix primitives)
- Supports `type="single"` with `collapsible` prop for single-open-mode (D-05)
- Supports `defaultValue` for expanding Tracking by default (D-06)
- Pre-styled, matches existing shadcn/ui design tokens
- Includes animated open/close via Tailwind `data-[state=open]` / `data-[state=closed]` classes

**Alternative rejected: Build on existing Collapsible**
- Would require manual single-open-mode state management
- Would need custom `AccordionContext` to coordinate open/close across groups
- More code, less accessible (Accordion has proper `role="region"` and `aria-expanded`)

### Accordion Group Wrapper Component

Create a `SettingsAccordionGroup` component that wraps each accordion item with:
- Color-coded icon in the trigger
- Group name as trigger text
- Chevron indicator for open/close state
- Animated content area

```tsx
// src/components/settings/settings-accordion-group.tsx
interface SettingsAccordionGroupProps {
  value: string;           // accordion item value
  icon: LucideIcon;        // group icon
  label: string;           // group header text
  iconColor: string;       // tailwind color class (e.g., "text-blue-600 dark:text-blue-400")
  children: React.ReactNode;
}
```

### Group Color Assignments (extending existing palette)

| Group | Color | Icon | Rationale |
|-------|-------|------|-----------|
| Tracking | indigo-600 | Activity | Matches DaySettingsSection's indigo |
| Customization | cyan-600 | Palette | Matches QuickNavSection's cyan |
| Medication | teal-600 | Pill | Matches MedicationSettingsSection's teal |
| Data & Storage | amber-600 | Database | Warm color for data management |
| Privacy & Security | emerald-600 | Shield | Matches PrivacySecuritySection's emerald |
| Debug | slate-600 | Bug | Neutral for power-user section |

### Section-to-Group Mapping (per CONTEXT.md D-03)

| Group | Sections Included |
|-------|-------------------|
| **Tracking** | DaySettingsSection, WaterSettingsSection, SaltSettingsSection, WeightSettingsSection (+ weight graph toggles from CustomizationPanel Graph tab), SubstanceSettingsSection (+ liquid presets from CustomizationPanel Presets tab), NEW: UrinationDefecationDefaults (from CustomizationPanel Tracking tab) |
| **Customization** | AppearanceSection, QuickNavSection (minus animation timing), NEW: AnimationTimingSection (extracted from QuickNavSection) |
| **Medication** | MedicationSettingsSection (currently orphaned — import it) |
| **Data & Storage** | DataManagementSection, NEW: StorageInfoSection (IndexedDB usage + record counts), NEW: SyncStatusPlaceholder ("Local only" badge) |
| **Privacy & Security** | AccountSection, PrivacySecuritySection, PermissionsSection |
| **Debug** | DebugPanel, AppUpdatesSection |

### CustomizationPanel Decomposition Plan

The CustomizationPanel dialog (~490 lines) must be decomposed into inline sections:

1. **Tracking tab content** (urination/defecation defaults) -> New `UrinationDefecationDefaults` inline component in Tracking group
2. **Liquid Presets tab content** -> Move inline under SubstanceSettingsSection in Tracking group. Keep `PresetEditForm` helper and preset CRUD logic, just render without Dialog wrapper
3. **Graph tab content** (weight graph toggles) -> Move inline under WeightSettingsSection in Tracking group. Keep `GraphToggle` helper component

After decomposition, delete `customization-panel.tsx` entirely (D-08).

### New Components Needed

1. **`src/components/ui/accordion.tsx`** — shadcn/ui Accordion (installed via CLI)
2. **`src/components/settings/settings-accordion-group.tsx`** — Reusable accordion item wrapper with colored icon
3. **`src/components/settings/urination-defecation-defaults.tsx`** — Extracted from CustomizationPanel Tracking tab
4. **`src/components/settings/animation-timing-section.tsx`** — Extracted from QuickNavSection
5. **`src/components/settings/storage-info-section.tsx`** — New: IndexedDB usage + record counts + "Local only" badge

### Storage Info Implementation

For IndexedDB storage estimation:
```tsx
// Use Storage API (widely supported)
const estimate = await navigator.storage.estimate();
const usageKB = Math.round((estimate.usage || 0) / 1024);
const quotaKB = Math.round((estimate.quota || 0) / 1024);
```

For record counts per table, use Dexie's `.count()`:
```tsx
const counts = await Promise.all([
  db.intakeRecords.count(),
  db.weightRecords.count(),
  db.bloodPressureRecords.count(),
  // ... etc
]);
```

Display as a compact list or summary (Claude's discretion per CONTEXT.md).

### Page Layout Changes

The settings page restructure:
```tsx
<Accordion type="single" collapsible defaultValue="tracking">
  <SettingsAccordionGroup value="tracking" icon={Activity} label="Tracking" iconColor="...">
    <DaySettingsSection />
    <WaterSettingsSection />
    <SaltSettingsSection />
    <WeightSettingsSection />
    {/* Weight graph toggles inline here */}
    <SubstanceSettingsSection />
    {/* Liquid presets inline here */}
    <UrinationDefecationDefaults />
  </SettingsAccordionGroup>

  <SettingsAccordionGroup value="customization" ...>
    <AppearanceSection />
    <QuickNavSection />  {/* minus animation timing */}
    <AnimationTimingSection />
  </SettingsAccordionGroup>

  <SettingsAccordionGroup value="medication" ...>
    <MedicationSettingsSection />
  </SettingsAccordionGroup>

  <SettingsAccordionGroup value="data-storage" ...>
    <StorageInfoSection />
    <DataManagementSection />
  </SettingsAccordionGroup>

  <SettingsAccordionGroup value="privacy-security" ...>
    <AccountSection />
    <PrivacySecuritySection />
    <PermissionsSection />
  </SettingsAccordionGroup>

  <SettingsAccordionGroup value="debug" ...>
    <DebugPanel />
    <AppUpdatesSection />
  </SettingsAccordionGroup>
</Accordion>

{/* Outside accordion - page-level actions */}
<Button onClick={handleResetToDefaults}>Reset to Defaults</Button>
<AboutDialog />
```

## Validation Architecture

### Structural Validation
- Accordion renders with 6 groups
- Each group has a color-coded icon header
- Single-open-mode works (opening one closes others)
- Tracking is expanded by default

### Functional Validation
- All existing settings still work after reorganization (no regression)
- Liquid preset CRUD works inline (no dialog)
- Urination/defecation defaults work inline
- Weight graph toggles work inline
- Animation timing controls work in Customization group
- MedicationSettingsSection renders and region selects work
- Storage info shows IndexedDB usage
- "Local only" badge shows for sync status
- Reset to Defaults and About still accessible outside accordion

### Deletion Validation
- CustomizationPanel dialog is fully deleted
- No Dialog import remains for CustomizationPanel
- No references to CustomizationPanel in page.tsx

## Dependencies

- `@radix-ui/react-accordion` — New package (installed via shadcn CLI)
- No other new dependencies

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Liquid preset CRUD complexity when moved inline | Medium — lots of state management in PresetEditForm | Keep PresetEditForm as a standalone component, just render it without Dialog wrapper |
| Animation timing extraction breaks QuickNavSection | Low — clean extraction of the sub-section | Keep QuickNavSection's remaining functionality (footer toggle, item reorder, icon order) intact |
| DebugPanel already uses Collapsible | Low — it can keep its internal collapsible, just wrapped in accordion item | No changes to DebugPanel internals needed |
| StorageEstimate API not available in all browsers | Low — Safari 17.5+ supports it, fallback to "Unknown" | Use `navigator.storage?.estimate?.()` with graceful fallback |

## RESEARCH COMPLETE

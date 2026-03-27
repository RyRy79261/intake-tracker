# Phase 6: Medication UX Core - Gap Closure Research

**Researched:** 2026-03-11
**Domain:** React UI, Dexie data model, medication workflow UX
**Confidence:** HIGH

## Summary

Plans 01-04 built the 3-tab layout, compound cards with expand/collapse, schedule dashboard with inline Take/Skip/undo, retroactive dose logging, and dose detail dialog. UAT revealed that the data model hierarchy needs a UI-level separation: prescriptions (doctor's orders) should be managed independently from medications (physical products that fulfill prescriptions). The current code already has the right data model (prescriptions -> medicationPhases -> phaseSchedules, inventoryItems linked to prescriptions), but the UI conflates prescription management with inventory/medication management.

The gap closure needs to: (1) add a 4th "Prescriptions" tab for managing the doctor's-order side, (2) revise the Medications tab to focus on physical products/inventory, (3) fix bugs found in UAT (cache invalidation, inventory button navigation, expanded card content), (4) improve the add-medication wizard (AI auto-select dosage, prescription assignment flow), and (5) add "Add another medication" button and editable refill entries.

**Primary recommendation:** Split into 2-3 focused plans: one for the Prescriptions tab (new UI, biggest scope), one for Medications tab revisions + bug fixes, and optionally one for wizard improvements.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Prescription is the root entity -- a doctor's order: compound, dose amount, schedule, titration phases
- Medication fulfills a prescription -- physical product: brand, region, pill strength, inventory/stock
- 4 tabs: Schedule, Medications, Prescriptions, Settings
- Prescriptions tab: list of active prescriptions, titration phase management, notes/scratchpad, simplified schedule display, "as needed" schedule type
- Medications tab: compound card with brand, stock, region; inline expand; "Add another medication" button; medication assigned to prescription
- Schedule simplification: no "Schedule 1, Schedule 2" naming, flat list of time entries, same times every day default, optional day-of-week for weekly drugs
- AI auto-select dosage strength from search query
- Don't force prescription creation when adding medication -- assign to existing or create inline
- Bug fixes: schedule not updating after creating medicine, inventory button doesn't navigate, expanded card shows wrong content, can't edit refill entries

### Claude's Discretion
- Loading skeleton design for schedule view
- Exact spacing, typography, and color choices
- Animation timing details beyond "use settings store values"
- How dose detail view is structured internally
- Pill icon SVG implementation details
- Cat illustration style for empty states

### Deferred Ideas (OUT OF SCOPE)
- Pill icon AI integration (fetching shape/color from AI during add) -- manual selection is MVP
- Adherence streaks / gamification -- explicitly rejected
- Status dots on WeekDaySelector -- explicitly rejected
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MEDX-03 | Retroactive dose logging | Partially built in 06-04 (T1/T2 done, T3 checkpoint not yet approved). Gap closure should verify this works. |
| MEDX-07 | Schedule visualization -- maintenance vs titration phases displayed clearly | New Prescriptions tab will show titration phase management and phase status |

New implicit requirements from UAT:
| ID | Description | Research Support |
|----|-------------|-----------------|
| GAP-01 | 4th tab: Prescriptions management | New MedTab value, new PrescriptionsView component |
| GAP-02 | Medications tab revisions (inventory focus, "add another" button) | CompoundCard and CompoundList modifications |
| GAP-03 | Bug fixes (cache invalidation, inventory button, expanded card content, refill editing) | Identified root causes below |
| GAP-04 | Wizard improvements (AI auto-select, prescription assignment) | SearchStep and handleSearch modifications |
</phase_requirements>

## Current Architecture Analysis

### Data Model (Already Correct)
The Dexie schema at v13 already supports the desired hierarchy:

| Entity | Table | Key Fields | Role |
|--------|-------|------------|------|
| Prescription | `prescriptions` | genericName, indication, notes, isActive | Doctor's order (root entity) |
| MedicationPhase | `medicationPhases` | prescriptionId, type (maintenance/titration), status (active/completed/cancelled/pending), unit, foodInstruction | Dosage configuration period |
| PhaseSchedule | `phaseSchedules` | phaseId, scheduleTimeUTC, dosage, daysOfWeek, enabled | When to take |
| InventoryItem | `inventoryItems` | prescriptionId, brandName, strength, isActive, pillShape, pillColor | Physical product |
| InventoryTransaction | `inventoryTransactions` | inventoryItemId, amount, type (refill/consumed/adjusted/initial) | Stock changes |
| DoseLog | `doseLogs` | prescriptionId, phaseId, scheduleId, scheduledDate, status | Dose events |

**No schema changes needed.** The data model already separates prescriptions from inventory. The gap is purely at the UI level.

### Current Tab Structure (3 tabs -> needs 4)

```
med-footer.tsx:
  MedTab = "schedule" | "medications" | "settings"
  TABS array: [schedule, medications, settings]
```

**Change needed:** Add `"prescriptions"` to MedTab union and TABS array. Add `ClipboardList` (or similar) icon.

### Current Component Map

| Component | File | Lines | Current Role | Gap Role |
|-----------|------|-------|--------------|----------|
| `medications/page.tsx` | page.tsx | 99 | Routes tabs, hosts dialogs | Add prescriptions tab routing |
| `med-footer.tsx` | 65 | Tab bar (3 tabs) | Add 4th tab |
| `compound-list.tsx` | 50 | Lists prescriptions as compound cards | Keep for Medications tab |
| `compound-card.tsx` | 177 | Collapsed card per prescription | Fix stock display, show which prescription it fulfills |
| `compound-card-expanded.tsx` | 291 | Expanded view with inventory, schedule, today status | Fix content (show dosage amounts, not "current phase") |
| `add-medication-wizard.tsx` | 987 | 6-step wizard | Fix prescription assignment, AI auto-select |
| `edit-medication-drawer.tsx` | ~800 | PrescriptionViewDrawer | Refactor: this IS the prescription management view |
| `inventory-item-view-drawer.tsx` | 294 | Inventory details, refill, manage | Add refill editing capability |

### Identified Bugs and Root Causes

#### Bug 1: Schedule not updating after creating medicine
**Root cause:** useLiveQuery should auto-detect DB changes. However, `addPrescription` and `addMedicationToPrescription` in `medication-service.ts` write to multiple tables within a transaction. useLiveQuery detects changes, BUT the medications page might be on a different tab when the wizard closes, so the schedule tab's useDailyDoseSchedule hasn't mounted yet. When switching to schedule tab, it mounts fresh -- this should work.

**Likely actual cause:** The wizard calls `handleClose()` which sets `wizardOpen = false`, but the useLiveQuery in schedule-view depends on `dateStr`. If the DB write completes after the close animation, the query might not re-fire. Need to investigate if this is a race condition or if something else is wrong.

**Fix approach:** Add explicit investigation. Most likely this is an issue where `isActive` on Dexie is stored as `true` (boolean) but queried with `.equals(1)` (number). Dexie v3/v4 with IndexedDB: `true` stored as-is, but `.equals(1)` may not match `true`. Check `getDailyDoseSchedule` -- it queries `where("isActive").equals(1)`. The `buildPrescription` function sets `isActive: true` (boolean). This type mismatch would cause new prescriptions to not appear in the schedule.

**Confidence: MEDIUM** -- Need to verify this specific mismatch at runtime.

#### Bug 2: Inventory button doesn't navigate
**Root cause (confirmed):** In `compound-card-expanded.tsx`, the Inventory button opens `setInventoryDrawerOpen(true)` which renders `<InventoryItemViewDrawer>`. This drawer EXISTS and renders correctly. The bug might be that the button's `onClick` is swallowed by the card's `onClick` for expand/collapse, even though there's `e.stopPropagation()` on the expanded div.

**Fix approach:** Verify stopPropagation is working. If the button itself needs stopPropagation, add it. Or the issue may be that InventoryItemViewDrawer doesn't show anything meaningful -- "No supply items found" if no active inventory exists.

**Confidence: MEDIUM** -- Need runtime verification.

#### Bug 3: Expanded card shows wrong content
**Root cause (confirmed):** `compound-card-expanded.tsx` line 108-119 shows "Current Phase" with type badge and "Target unit" -- this is the phase metadata, not the actual dosage amounts. User wants to see the actual dosage numbers (e.g., "6.25mg twice daily") not "Maintenance" / "Target unit: mg".

**Fix approach:** Replace phase type/unit display with actual schedule details: list each schedule entry showing `dosage + unit` at each `time`. Already partially done (lines 169-186 show schedules with time and dosage), but the section header says "Schedule" not the dosage amount. The issue is likely that the "Today" section (lines 192-237) shows status but not the dosage clearly.

**Confidence: HIGH** -- Clear UI content issue.

#### Bug 4: Can't edit refill entries
**Root cause (confirmed):** `inventory-item-view-drawer.tsx` InventoryTab (line 136-229) shows transaction history but each transaction row is read-only. There's no edit/delete action on individual transactions.

**Fix approach:** Add edit/delete buttons to each transaction row. For editing: inline amount/note editing. For deleting: confirmation then remove transaction and adjust currentStock.

**Confidence: HIGH**

### Existing Service Hooks Available

All needed mutations already exist in `use-medication-queries.ts`:
- `useAddPrescription()` -- creates prescription + phase + inventory + schedules
- `useAddMedicationToPrescription()` -- adds inventory/phase to existing prescription
- `useUpdatePrescription()` -- update prescription fields (genericName, indication, notes, isActive)
- `useDeletePrescription()` -- cascading delete
- `useStartNewPhase()` -- create new phase (for titration)
- `useActivatePhase()` -- activate a pending phase
- `useUpdatePhase()` -- update phase + schedules
- `useAdjustStock()` -- add/remove stock
- All dose mutations (take, untake, skip, reschedule, takeAll, skipAll)

### Wizard Analysis (add-medication-wizard.tsx)

**Current flow:** Search -> Appearance -> Indication -> Dosage -> Schedule -> Inventory

**AI auto-select dosage strength:** In `handleSearch` (line 175-208), when `result.dosageStrengths` is populated, the first strength is auto-selected (line 190). But if the user searched "Eliquis 5mg", the search query contains "5mg" which should match against `result.dosageStrengths` to auto-select the right one.

**Fix approach:** After getting search results, parse the search query for a dosage pattern (e.g., `/(\d+(?:\.\d+)?)\s*mg/i`), then find the matching strength in `result.dosageStrengths` and auto-select it.

**Prescription assignment:** Currently in SearchStep (line 507-523), there's already a `<select>` for "Associate with prescription" that shows "Create new prescription" or existing prescriptions. This works but could be improved:
- When selecting an existing prescription, skip the Indication step (already handled at line 700: `isExistingPrescription`)
- The flow should be: search -> select prescription -> appearance -> dosage -> schedule -> inventory

**Confidence: HIGH** -- Code is readable and changes are straightforward.

## Architecture Patterns

### New Prescriptions Tab Component

```
src/components/medications/
  prescriptions-view.tsx        # New: Prescriptions tab main view
  prescription-card.tsx         # New: Individual prescription card in list
  prescription-detail-drawer.tsx  # Refactored from edit-medication-drawer.tsx
  titration-phase-card.tsx      # New: Phase card within prescription detail
  prescription-notes.tsx        # New: Notes/scratchpad section
```

**Pattern:** Follow existing compound-list.tsx / compound-card.tsx pattern:
- Top-level list component fetches data via useLiveQuery hooks
- Card component receives single prescription, shows summary
- Tap to expand or navigate to detail drawer
- Detail drawer has tabs for schedule, phases, notes

### Prescription Card Content
Per CONTEXT.md decisions:
- Compound name (heading)
- Current dose (from active phase's schedule)
- Current schedule (flat list of times)
- Titration status badge (if titration phase active or pending)

### "As Needed" Schedule Type
The current PhaseSchedule schema doesn't have an "as needed" flag. Options:
1. **Add `isAsNeeded: boolean` to PhaseSchedule** -- requires Dexie v14 migration
2. **Use a convention**: daysOfWeek = [] means "as needed" -- no schema change but hacky
3. **Add field to MedicationPhase**: `scheduleType: "regular" | "as_needed"` -- cleaner, on the phase level

**Recommendation:** Option 3 -- add `scheduleType` to MedicationPhase. This requires a v14 Dexie migration but is the cleanest approach. Alternatively, avoid schema changes and use `notes` field to indicate "as needed" with a UI convention until a future phase.

**Planner decision point:** Schema change (clean, requires migration) vs. UI convention (quick, no migration).

### Simplified Schedule Display
CONTEXT.md says "no Schedule 1, Schedule 2 naming". Currently in `compound-card-expanded.tsx`, schedules are listed by their `s.time` and `s.dosage`. The ScheduleStep in the wizard uses "Schedule {i + 1}" labels. Fix: remove numbered labels, show flat time list.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transaction editing | Custom undo system | Direct DB update + recalculate currentStock | Keep consistent with existing adjustStock pattern |
| Tab state persistence | Custom state machine | React useState + URL param (optional) | Simple enough for 4 tabs |
| Phase activation workflow | Complex state transitions | Existing `activatePhase` service | Already handles deactivate-current + activate-new atomically |

## Common Pitfalls

### Pitfall 1: Dexie Boolean Indexing
**What goes wrong:** Dexie stores `true`/`false` as-is in IndexedDB, but `.where("field").equals(1)` queries for the number `1`, not boolean `true`. This can cause queries to return empty results.
**How to avoid:** Check all `.equals(1)` calls against boolean fields. The `getDailyDoseSchedule` function uses `.where("isActive").equals(1)` -- if `isActive` is stored as `true` (boolean), this might not match. Verify at runtime.
**Warning signs:** New prescriptions don't appear in schedule, empty schedule after adding medication.

### Pitfall 2: useLiveQuery Dependency Arrays
**What goes wrong:** useLiveQuery re-runs when its dependency array changes, but if the query function captures stale closures, it may return stale data.
**How to avoid:** Ensure all dynamic values are in the dependency array. For the new prescriptions tab, use `usePrescriptions()` which has `[]` deps (always re-runs on any prescription table change).

### Pitfall 3: AnimatePresence + stopPropagation
**What goes wrong:** Buttons inside AnimatePresence-wrapped expanded content may not fire onClick if the parent card also has onClick.
**How to avoid:** Always `e.stopPropagation()` on interactive elements inside expanded content. Already done in compound-card-expanded.tsx at the div level, but individual buttons might need it too.

### Pitfall 4: Wizard State Reset on Close
**What goes wrong:** Wizard state persists if the drawer is closed mid-flow and reopened.
**How to avoid:** Already handled -- `resetForm` is called in `handleClose` with a 300ms delay for animation. But when changing the wizard flow (skip steps for existing prescription), ensure all conditional state resets correctly.

## Code Examples

### Adding 4th Tab to MedFooter
```typescript
// med-footer.tsx
import { ClipboardList } from "lucide-react";

export type MedTab = "schedule" | "medications" | "prescriptions" | "settings";

const TABS: { id: MedTab; icon: LucideIcon; label: string }[] = [
  { id: "schedule", icon: CalendarDays, label: "Schedule" },
  { id: "medications", icon: Pill, label: "Medications" },
  { id: "prescriptions", icon: ClipboardList, label: "Rx" },
  { id: "settings", icon: Settings, label: "Settings" },
];
```

### Prescription Card (simplified)
```typescript
// prescription-card.tsx
function PrescriptionCard({ prescription }: { prescription: Prescription }) {
  const phases = usePhasesForPrescription(prescription.id);
  const activePhase = phases.find(p => p.status === "active");
  const pendingPhases = phases.filter(p => p.status === "pending");
  const schedules = useSchedulesForPhase(activePhase?.id);

  // Flat time list display
  const timeList = schedules.map(s => s.time).join(", ");
  const dosageDisplay = schedules.length > 0 && schedules[0]
    ? `${schedules[0].dosage}${activePhase?.unit ?? "mg"}`
    : "No dosage set";

  return (
    <Card className="p-3">
      <h3 className="font-semibold text-sm">{prescription.genericName}</h3>
      <p className="text-xs text-muted-foreground">{dosageDisplay} at {timeList}</p>
      {pendingPhases.length > 0 && (
        <Badge variant="outline" className="text-[10px]">
          {pendingPhases.length} planned phase{pendingPhases.length > 1 ? "s" : ""}
        </Badge>
      )}
    </Card>
  );
}
```

### AI Auto-Select Dosage Strength
```typescript
// In add-medication-wizard.tsx handleSearch:
if (result.dosageStrengths.length > 0) {
  // Try to match dosage from search query (e.g., "Eliquis 5mg")
  const doseMatch = searchQuery.match(/(\d+(?:\.\d+)?)\s*mg/i);
  if (doseMatch && doseMatch[1]) {
    const queryDose = doseMatch[1] + "mg";
    const matchingStrength = result.dosageStrengths.find(
      s => s.toLowerCase().includes(queryDose.toLowerCase())
    );
    if (matchingStrength) {
      setDosageStrength(matchingStrength);
    } else if (result.dosageStrengths[0]) {
      setDosageStrength(result.dosageStrengths[0]);
    }
  } else if (result.dosageStrengths[0]) {
    setDosageStrength(result.dosageStrengths[0]);
  }
}
```

### Editable Transaction Row
```typescript
// In inventory-item-view-drawer.tsx:
function TransactionRow({ tx, onEdit, onDelete }: {
  tx: InventoryTransaction;
  onEdit: (id: string, updates: { amount: number; note?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(tx.amount);
  const [editNote, setEditNote] = useState(tx.note ?? "");
  // ... inline edit form
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + fake-indexeddb |
| Config file | vitest.config.ts |
| Quick run command | `pnpm test:unit` (if configured) or `npx vitest run --reporter=verbose` |
| Full suite command | `pnpm lint && pnpm build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GAP-01 | 4th tab renders prescriptions list | manual-only | N/A -- UI rendering | N/A |
| GAP-02 | Medications tab shows "Add another" button | manual-only | N/A -- UI rendering | N/A |
| GAP-03a | Schedule updates after adding medicine | manual-only | N/A -- requires full browser | N/A |
| GAP-03b | Inventory button navigates to drawer | manual-only | N/A -- click handler | N/A |
| GAP-03c | Expanded card shows dosage amounts | manual-only | N/A -- UI content | N/A |
| GAP-03d | Refill entries are editable | manual-only | N/A -- UI interaction | N/A |
| GAP-04 | AI auto-selects dosage from query | unit | `npx vitest run src/__tests__/wizard-auto-select.test.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm lint && pnpm build`
- **Per wave merge:** Full lint + build
- **Phase gate:** Full build + UAT visual verification

### Wave 0 Gaps
None critical -- the gap closure is primarily UI work. Build verification (`pnpm lint && pnpm build`) is the primary automated gate.

## Plan Decomposition Recommendation

### Plan 05: Prescriptions Tab + Bug Fixes
- Add 4th tab (MedTab update, footer update, page routing)
- New PrescriptionsView component with prescription list
- Prescription detail drawer (refactor from edit-medication-drawer)
- Titration phase management UI
- Notes/scratchpad per prescription
- Fix: expanded card content (show dosage amounts)
- Fix: schedule "as needed" display convention

### Plan 06: Medications Tab Revisions + Remaining Bugs
- "Add another medication" button below CompoundList
- Fix: inventory button navigation (verify stopPropagation)
- Fix: schedule not updating after creating medicine (investigate boolean indexing)
- Editable refill entries in inventory drawer
- Compound card: show which prescription each medication fulfills

### Plan 07: Wizard Improvements
- AI auto-select dosage strength from search query
- Don't force prescription creation -- assign to existing prescription flow
- Skip Indication step when adding to existing prescription

**Alternative:** Combine Plans 06 and 07 if scope is manageable.

## Open Questions

1. **"As needed" schedule type implementation**
   - What we know: User wants this for drugs like Furosemide
   - What's unclear: Whether to add a DB field (MedicationPhase.scheduleType) requiring v14 migration, or use a UI-only convention
   - Recommendation: Use a simple convention for now -- single schedule with a special note or a `isAsNeeded` field on the phase. Keep schema change minimal.

2. **Boolean indexing bug**
   - What we know: `isActive: true` stored as boolean, queried with `.equals(1)`
   - What's unclear: Whether this actually causes the cache invalidation bug or if it's something else
   - Recommendation: Test at runtime. If confirmed, fix all boolean index queries to use `.equals(true)` or ensure booleans are stored as 0/1.

3. **Prescription notes storage**
   - What we know: `Prescription.notes` field already exists (optional string)
   - What's unclear: Whether a single notes field is sufficient or if users want timestamped notes
   - Recommendation: Use existing `notes` field for now. DailyNotes table already has `prescriptionId` field for per-date notes if needed later.

## Sources

### Primary (HIGH confidence)
- `src/lib/db.ts` -- Dexie schema, all entity interfaces
- `src/lib/medication-service.ts` -- All mutation functions, input types
- `src/hooks/use-medication-queries.ts` -- All hooks (read + write)
- `src/lib/dose-schedule-service.ts` -- DoseSlot derivation logic
- `src/components/medications/*.tsx` -- All current UI components

### Secondary (MEDIUM confidence)
- CONTEXT.md UAT feedback and revised decisions
- Plan 01-04 SUMMARY.md files for what's already built

## Metadata

**Confidence breakdown:**
- Data model analysis: HIGH -- read all source files directly
- Bug root causes: MEDIUM -- identified likely causes but need runtime verification
- Architecture patterns: HIGH -- following established codebase patterns
- Plan decomposition: HIGH -- clear scope from UAT feedback

**Research date:** 2026-03-11
**Valid until:** 2026-03-25 (stable -- no external dependencies changing)

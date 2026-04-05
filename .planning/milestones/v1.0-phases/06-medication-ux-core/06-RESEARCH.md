# Phase 6: Medication UX Core - Research

**Researched:** 2026-03-11
**Domain:** React UI rebuild — medication dashboard, compound-first views, dose logging with stock depletion, retroactive logging
**Confidence:** HIGH

## Summary

Phase 6 is a UI-layer rebuild on top of a solid service foundation completed in Phases 1-3. The service layer (medication-service.ts, dose-log-service.ts, dose-schedule-service.ts) already provides atomic takeDose/skipDose/untakeDose with stock depletion, fractional pill math, and DoseSlot derivation at read time. The existing hooks layer (use-medication-queries.ts) wraps all services with useLiveQuery for reads and useMutation for writes. No new Dexie tables or service functions are needed — this phase is purely UI component creation and restructuring.

The current /medications page has 5 tabs (Schedule, Status, Prescriptions, Supply, Settings) with separate PrescriptionsList and MedicationsList components, a drawer-based PrescriptionViewDrawer for editing, and a ScheduleView that groups doses by time but lacks inline Take/Skip buttons, progress summaries, or the compound-first model. The CONTEXT.md decisions consolidate this to 3 tabs (Schedule, Medications, Settings), merge the two list views into a single compound-first list with inline expand, and add immediate Take/Skip actions with undo toast directly in the schedule view.

**Primary recommendation:** Build incrementally — restructure tab layout first, then compound list with inline expand, then schedule dashboard with inline actions, then retroactive logging. Each is independently testable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Merge prescriptions + medications tabs into one "Medications" list — single list of compounds
- Compound card: compound name (heading), prescribed dose, active brand name, active stock level, next dose status
- Inline expand on tap — card expands in-place, no drawer overlay
- Region is secondary info — not shown at list level, only in expanded view
- 3-tab layout: Schedule, Medications, Settings. Status tab absorbed into Schedule
- Add medication: FAB on Medications tab + "Add first medication" prompt in empty schedule
- Brand switching: Dedicated "Switch active brand" action in expanded card with picker
- Take = immediate log at current time, 5-second auto-dismiss toast with Undo button
- Skip and Take both visible as buttons on each pending dose row
- Skip shows preset reasons: Forgot, Side effects, Ran out, Doctor advised, Don't need this dose + freeform
- Auto-suggest "Ran out" when stock is depleted/negative
- Mark All uses same immediate + undo pattern
- Tapping a taken dose opens detail view with Untake action
- No inventory = still log, toast says "Dose logged -- no stock tracked. Add inventory?"
- Haptic feedback via Vibration API on Take (success) and Skip (different pattern)
- Smooth state transitions: pending -> taken (green fade + checkmark) or skipped (dimmed + strikethrough)
- Pill shape and color fetched from AI during add flow, stored on inventory item, editable
- Core shapes: round tablet, oval tablet, capsule (two-tone), oblong
- Three-tier low stock alerts: toast warning + persistent badge + configurable threshold
- Negative stock allowed, don't block logging
- Retroactive access via WeekDaySelector — navigate to past date, see missed doses actionable
- Past date Take shows time picker pre-filled to scheduled time
- Today's Take is immediate (no time picker)
- No date limit on retroactive logging
- Schedule grouped by time slot with Mark All per slot
- Progress summary at top (today only): progress bar + "3/5 taken" + low stock warnings
- Next upcoming time slot highlighted with accent border/background
- Missed time slots inline but dimmed, still actionable
- "All done for today!" celebratory banner when complete
- Auto-scroll to next upcoming time slot
- Empty day: cat icon + "No medications scheduled for today"
- No adherence streak, no status dots on WeekDaySelector

### Claude's Discretion
- Loading skeleton design for schedule view
- Exact spacing, typography, and color choices
- Animation timing details beyond "use settings store values"
- How dose detail view is structured internally
- Pill icon SVG implementation details
- Cat illustration style for empty states

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MEDX-01 | Prescription-first views — compound identity as primary | Compound list component with inline expand; genericName as heading, brand as sub-label |
| MEDX-02 | Dose logging with schedule display and automatic stock depletion | Inline Take/Skip buttons on schedule rows; existing takeDose service handles atomic stock depletion |
| MEDX-03 | Retroactive dose logging — mark a dose taken at a specific past time | WeekDaySelector date navigation + time picker for past dates; existing service accepts arbitrary date/time |
| MEDX-04 | Multi-region inventory grouping — SA vs Germany brands | Expanded compound card shows all inventory items grouped by prescriptionId; region visible in detail |
| MEDX-05 | Fractional pill display — 0.5 tablet, 0.25 tablet shown clearly | calculatePillsConsumed already exists; UI needs fraction formatting helper ("1/2 tablet", "1/4 tablet") |
| MEDX-06 | Today's medication dashboard — immediate view of due/taken/pending | Rebuilt schedule-view with progress summary, time-slot grouping, next-slot highlight, inline actions |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 18 | ^18.3.1 | UI framework | Project standard |
| Next.js 14 | 14.2.15 | App Router, routing | Project standard |
| Dexie + dexie-react-hooks | ^4.0.8 / ^1.1.7 | IndexedDB + useLiveQuery | All reads use useLiveQuery (Phase 3 decision) |
| @tanstack/react-query | ^5.90.20 | useMutation for writes | Write operations only (Phase 3 decision) |
| Zustand | ^5.0.0 | Settings store | Animation timing, region config |
| motion (Framer Motion) | ^12.29.2 | Animations | Existing: footer transitions, state changes |
| shadcn/ui | N/A (components) | UI primitives | Card, Button, Drawer, Tabs, Toast |
| lucide-react | ^0.454.0 | Icons | Project standard |
| vaul | ^1.1.2 | Drawer component | Used by shadcn/ui Drawer |
| date-fns | ^4.1.0 | Date formatting | Already available |
| Tailwind CSS | ^3.4.14 | Styling | Project standard |

### No New Dependencies Needed
This phase requires no new npm packages. All UI can be built with existing primitives:
- Toast with Undo: shadcn toast (already has action element support)
- Time picker: native HTML `<input type="time">` (already used in dose-detail-dialog.tsx)
- Haptic feedback: `navigator.vibrate()` Web API (no library needed)
- Animations: motion library already installed
- Progress bar: Tailwind div with dynamic width (already done in status-view.tsx)

## Architecture Patterns

### Current File Structure (Medications)
```
src/
├── app/medications/page.tsx          # Page component, state management, tab routing
├── components/medications/
│   ├── schedule-view.tsx             # REBUILD: time-slot grouped schedule with inline actions
│   ├── status-view.tsx               # REMOVE: absorbed into schedule-view progress summary
│   ├── prescriptions-list.tsx        # REMOVE: merged into compound-list
│   ├── medications-list.tsx          # REMOVE: merged into compound-list
│   ├── med-footer.tsx                # UPDATE: 5 tabs -> 3 tabs
│   ├── pill-icon.tsx                 # EXTEND: oblong shape, two-tone capsule
│   ├── dose-detail-dialog.tsx        # UPDATE: add untake, time editing for retroactive
│   ├── mark-all-modal.tsx            # UPDATE: immediate+undo pattern
│   ├── week-day-selector.tsx         # KEEP: already supports date navigation
│   ├── add-medication-wizard.tsx     # KEEP: update for compound-first model
│   ├── edit-medication-drawer.tsx    # REFACTOR: drawer -> inline expand content
│   ├── inventory-item-view-drawer.tsx # KEEP: for inventory detail
│   ├── medication-settings-view.tsx  # KEEP: settings tab content
│   └── daily-notes-drawer.tsx        # KEEP: note management
├── hooks/
│   └── use-medication-queries.ts     # EXTEND: possibly new computed hooks
├── lib/
│   ├── medication-service.ts         # KEEP: no changes needed
│   ├── dose-log-service.ts           # KEEP: no changes needed
│   ├── dose-schedule-service.ts      # KEEP: no changes needed
│   └── medication-schedule-service.ts # KEEP: no changes needed
└── stores/
    └── settings-store.ts             # EXTEND: low stock threshold per compound
```

### New Components to Create
```
src/components/medications/
├── compound-list.tsx                 # Merged compound-first list (replaces prescriptions-list + medications-list)
├── compound-card.tsx                 # Individual compound card with inline expand
├── compound-card-expanded.tsx        # Expanded detail: all inventory, schedule, recent doses, brand switch
├── dose-row.tsx                      # Individual dose row with Take/Skip buttons
├── dose-progress-summary.tsx         # Progress bar + "3/5 taken" + low stock warnings (today only)
├── time-slot-group.tsx               # Time slot header + Mark All + dose rows
├── undo-toast.tsx                    # Auto-dismiss toast with Undo action (5s timer)
├── skip-reason-picker.tsx            # Preset reasons + freeform for skip action
├── brand-switch-picker.tsx           # Brand switcher for compound expanded view
├── retroactive-time-picker.tsx       # Time picker pre-filled to scheduled time for past dates
└── empty-schedule.tsx                # Cat illustration + "No medications scheduled"
```

### Pattern 1: Inline Take with Undo Toast
**What:** Immediate dose logging with 5-second reversible window
**When to use:** Every Take and Skip action in the schedule view
**Implementation:**

```typescript
// The core flow:
// 1. Call takeDose mutation immediately (optimistic from user perspective)
// 2. Show toast with 5-second countdown and Undo button
// 3. If Undo clicked within 5 seconds, call untakeDose
// Note: This is NOT optimistic UI — the write happens immediately.
// Undo = a second write (untakeDose), not a rollback.

const handleTake = async (slot: DoseSlot) => {
  // Haptic feedback
  if (navigator.vibrate) navigator.vibrate(50);

  await takeMutation.mutateAsync({
    prescriptionId: slot.prescriptionId,
    phaseId: slot.phaseId,
    scheduleId: slot.scheduleId,
    date: slot.scheduledDate,
    time: slot.localTime,
    dosageMg: slot.dosageMg,
  });

  // useLiveQuery auto-updates the UI (pending -> taken)

  toast({
    title: `${slot.prescription.genericName} taken`,
    description: slot.inventory
      ? `${slot.pillsPerDose} pill(s) deducted`
      : "No stock tracked. Add inventory?",
    action: <ToastAction onClick={() => handleUndo(slot)}>Undo</ToastAction>,
    duration: 5000,
  });
};
```

### Pattern 2: Compound-First Card with Inline Expand
**What:** Collapsible card showing compound identity with expandable detail
**When to use:** Medications tab compound list

```typescript
// Compound card structure:
// - Collapsed: [PillIcon] CompoundName | activeBrand | stock | nextDose
// - Expanded: inventory items list (grouped), schedule summary, recent 3-5 doses, actions

// Data fetching: All data via useLiveQuery hooks at the card level
// Expand state: local useState per card (not global)
// Animation: motion AnimatePresence for expand/collapse
```

### Pattern 3: Date-Aware Schedule Rendering
**What:** Schedule behavior changes based on whether viewing today or a past date
**When to use:** Schedule tab with WeekDaySelector

```typescript
const isToday = selectedDate.toDateString() === new Date().toDateString();
const isPast = selectedDate < new Date(new Date().toDateString());

// Today: Take = immediate, no time picker, show progress summary
// Past: Take = show time picker pre-filled to scheduled time, no progress summary
// Future: Read-only schedule preview
```

### Pattern 4: Existing useLiveQuery + useMutation Pattern
**What:** All reads reactive via useLiveQuery, writes via useMutation
**Critical:** No cache invalidation needed. useLiveQuery re-runs on any DB table change.

```typescript
// READ: useLiveQuery returns data directly (no loading state with default [])
const slots = useDailyDoseSchedule(dateStr);

// WRITE: useMutation wraps service call
const takeMut = useTakeDose();
await takeMut.mutateAsync(input);
// UI updates automatically via useLiveQuery reactivity
```

### Anti-Patterns to Avoid
- **Drawer for compound detail:** Decision explicitly says inline expand, not drawer/overlay
- **Separate tabs for prescriptions and supply:** Must be merged into single compound list
- **Manual cache invalidation:** useLiveQuery handles all reactivity (Phase 3 decision)
- **Loading spinners on read hooks:** useLiveQuery with default [] eliminates loading states
- **Nested transactions:** Dexie Pitfall 4 — service layer already handles this correctly, don't add transaction wrappers in UI
- **Direct service imports in components:** Always go through hooks layer (ESLint rule enforced)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast with auto-dismiss + action | Custom notification system | shadcn/ui Toast with action prop | Already has ToastAction element, 5s duration config |
| Time picker | Custom time selector | `<input type="time">` HTML native | Already used in dose-detail-dialog, mobile-friendly |
| Expand/collapse animation | Manual height calculation | motion AnimatePresence + layout | Already in project, handles mount/unmount |
| Haptic feedback | Custom vibration wrapper | `navigator.vibrate()` directly | One-liner API, no abstraction needed |
| Fractional pill display | Custom math | `calculatePillsConsumed` from dose-log-service | Already handles 4-decimal rounding |
| Stock computation | Manual sum of transactions | `currentStock` field on InventoryItem | Phase 3 keeps this field updated atomically in takeDose |
| Progress bar | Custom SVG | Tailwind div with dynamic width% | Already done in status-view.tsx |

## Common Pitfalls

### Pitfall 1: MedTab Type Must Be Updated Before Components
**What goes wrong:** Changing the tab layout without updating the MedTab type union causes TypeScript errors across multiple files
**Why it happens:** MedTab is exported from med-footer.tsx and imported in page.tsx
**How to avoid:** Update MedTab type first: `"schedule" | "medications" | "settings"`, then update page.tsx tab routing, then update med-footer.tsx TABS array
**Warning signs:** TypeScript errors about invalid tab values

### Pitfall 2: useLiveQuery Default Values Hide Loading States
**What goes wrong:** Components assume data is always present because useLiveQuery returns `[]` as default
**Why it happens:** Phase 3 decision: all array-returning hooks use `[]` default to eliminate loading
**How to avoid:** This is intentional. Don't add loading states. If no data, show empty state (e.g., cat illustration)
**Warning signs:** Adding isLoading checks to hooks that don't have them

### Pitfall 3: Vibration API Requires HTTPS or Localhost
**What goes wrong:** `navigator.vibrate()` silently fails in some contexts
**Why it happens:** API requires secure context (HTTPS), not available on all browsers
**How to avoid:** Always check `if (navigator.vibrate)` before calling. Works on Android Chrome (primary target), not on iOS Safari.
**Warning signs:** No haptic feedback on test device

### Pitfall 4: Undo After Take Must Reverse Stock Correctly
**What goes wrong:** Undo (untakeDose) doesn't reverse the inventory depletion
**Why it happens:** If calling untakeDose with wrong params or if inventory was changed between take and undo
**How to avoid:** untakeDose service already handles stock reversal correctly — just call it with same params as takeDose. The 5-second window is short enough that concurrent changes are very unlikely.
**Warning signs:** Stock count doesn't restore after undo

### Pitfall 5: Date String Format Inconsistency
**What goes wrong:** Schedule doesn't load for selected date
**Why it happens:** getDailyDoseSchedule expects "YYYY-MM-DD" format; month/day must be zero-padded
**How to avoid:** Use the existing dateStr computation pattern from page.tsx:
```typescript
const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
```
**Warning signs:** Empty schedule for dates that should have doses

### Pitfall 6: Existing Drawer Components Have Complex State
**What goes wrong:** PrescriptionViewDrawer (edit-medication-drawer.tsx, 797 lines) is deeply coupled to drawer lifecycle
**Why it happens:** It manages internal tabs, editing state, phase management all within a drawer
**How to avoid:** Don't try to refactor the drawer into inline expand in one step. Extract the content/data logic first, then create new inline expand component that uses the same hooks.
**Warning signs:** Trying to make the drawer component work as both drawer and inline — create fresh components instead

### Pitfall 7: Multiple Inventory Items Per Prescription
**What goes wrong:** Only showing one inventory item when multiple exist (SA + Germany)
**Why it happens:** getActiveInventoryForPrescription returns only the active one; there may be multiple
**How to avoid:** Use getInventoryForPrescription (all items) for the expanded compound card. Group by region/brand. Only the compound card header shows the active one.
**Warning signs:** Missing inventory items in expanded view

## Code Examples

### Fraction Display Helper
```typescript
// Convert pills consumed to human-readable fraction
function formatPillCount(pills: number): string {
  if (pills === 1) return "1 tablet";
  if (pills === 0.5) return "\u00BD tablet";
  if (pills === 0.25) return "\u00BC tablet";
  if (pills === 0.75) return "\u00BE tablet";
  if (pills === Math.floor(pills)) return `${pills} tablets`;
  // For other fractions, use decimal
  return `${pills} tablets`;
}
```

### Haptic Feedback Utility
```typescript
// Light vibration for Take (success)
function hapticTake() {
  if (navigator.vibrate) navigator.vibrate(50);
}

// Different pattern for Skip
function hapticSkip() {
  if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
}
```

### Auto-Scroll to Next Upcoming Slot
```typescript
// In schedule-view after render, scroll to next upcoming time slot
useEffect(() => {
  if (!isToday) return;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Find first slot that hasn't passed yet
  const nextSlot = slots.find(s => {
    const [h, m] = s.localTime.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0) >= nowMinutes && s.status === "pending";
  });

  if (nextSlot) {
    const el = document.getElementById(`time-slot-${nextSlot.localTime}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}, [slots, isToday]);
```

### Progress Summary Computation
```typescript
// Compute from DoseSlot array (from useDailyDoseSchedule)
function computeProgress(slots: DoseSlot[]) {
  const total = slots.length;
  const taken = slots.filter(s => s.status === "taken").length;
  const skipped = slots.filter(s => s.status === "skipped").length;
  const pending = total - taken - skipped;
  const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
  const allDone = pending === 0 && total > 0;
  return { total, taken, skipped, pending, pct, allDone };
}
```

## State of the Art

| Old Approach (Current) | New Approach (Phase 6) | Impact |
|------------------------|------------------------|--------|
| 5-tab layout (Schedule, Status, Prescriptions, Supply, Settings) | 3-tab layout (Schedule, Medications, Settings) | Simpler navigation, less cognitive load |
| Separate PrescriptionsList + MedicationsList | Single CompoundList with inline expand | Compound-first identity model |
| Drawer-based prescription detail | Inline card expansion | Faster interaction, no overlay context switch |
| Take action opens detail dialog first | Inline Take button, immediate action with undo toast | "Notification -> take -> log" flow is 1 tap instead of 3 |
| No progress summary in schedule | Progress bar + counts at top of schedule (today only) | At-a-glance adherence status |
| All dates treated same for Take action | Today = immediate; Past = time picker | Retroactive logging friction only where needed |
| Brand name as primary display | Compound/generic name as primary | Correct medical identity model |

## Open Questions

1. **Low stock threshold storage location**
   - What we know: CONTEXT says "configurable threshold per compound" in expanded card or edit view
   - What's unclear: Where to store threshold — on InventoryItem (already has refillAlertPills/refillAlertDays) or on Prescription
   - Recommendation: Use existing `refillAlertPills` field on InventoryItem. Already in schema, no migration needed. Per-brand threshold is more useful than per-compound since different brands have different pill counts.

2. **Pill icon AI data during add flow**
   - What we know: CONTEXT says pill shape/color fetched from AI during add, stored on inventory item
   - What's unclear: The AI medicine-search endpoint may not currently return pill appearance data
   - Recommendation: Extend the AI medicine-search prompt to request shape/color. Fallback to manual selection if AI doesn't return it. Mark as nice-to-have; manual pill customization is the MVP path.

3. **Cat illustration for empty states**
   - What we know: User wants cat icon/illustration for empty schedule
   - What's unclear: Whether to use a lucide icon (Cat exists), an SVG illustration, or an emoji
   - Recommendation: Use lucide `Cat` icon with opacity styling, similar to existing empty state patterns (e.g., `Pill` icon in medications-list empty state). Simple and consistent.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x + fake-indexeddb for unit; Playwright 1.58 for E2E |
| Config file | vitest.config.ts, playwright.config.ts |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm test:e2e` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEDX-01 | Compound list shows genericName as primary | E2E | `npx playwright test e2e/medication-wizard.spec.ts` | Partial (wizard exists, not compound list) |
| MEDX-02 | Take dose decrements stock atomically | unit | `pnpm test -- --run src/__tests__/dose-log-service.test.ts` | Wave 0 (service tests exist in migration/) |
| MEDX-03 | Retroactive dose with time picker | E2E | `npx playwright test e2e/medication-schedule.spec.ts` | Wave 0 |
| MEDX-04 | Multi-region inventory grouped under compound | E2E | `npx playwright test e2e/medication-compound.spec.ts` | Wave 0 |
| MEDX-05 | Fractional pills display correctly | unit | `pnpm test -- --run src/__tests__/fraction-display.test.ts` | Wave 0 |
| MEDX-06 | Dashboard shows due/taken/pending | E2E | `npx playwright test e2e/medication-dashboard.spec.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm lint && pnpm build` (TypeScript + lint validation)
- **Per wave merge:** `pnpm test && pnpm build`
- **Phase gate:** Full suite including E2E before verification

### Wave 0 Gaps
- [ ] No existing E2E tests for compound list view or schedule dashboard interactions
- [ ] No unit test for fraction display formatting
- [ ] Existing medication-wizard.spec.ts covers add flow but not compound-first display
- [ ] E2E tests need LOCAL_AGENT_MODE=true (already configured in playwright.config)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: medication-service.ts, dose-log-service.ts, dose-schedule-service.ts, use-medication-queries.ts — all service layer verified working
- Codebase analysis: existing UI components (schedule-view, prescriptions-list, medications-list, med-footer, pill-icon, dose-detail-dialog, mark-all-modal, week-day-selector) — all patterns and prop interfaces verified
- CONTEXT.md: User decisions locked for all major UX flows

### Secondary (MEDIUM confidence)
- Vibration API: Web standard, supported in Chrome for Android, not iOS Safari — acceptable for this PWA's Android-first target
- shadcn/ui Toast: ToastAction element already in use-toast.ts, supports custom action buttons with auto-dismiss

### Tertiary (LOW confidence)
- AI pill appearance data: medicine-search endpoint may need prompt extension; not verified whether current AI returns shape/color

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and patterns established in Phases 1-5
- Architecture: HIGH - clear understanding of existing code, CONTEXT decisions unambiguous
- Pitfalls: HIGH - derived from direct codebase analysis, not external sources
- Pill icon AI integration: LOW - API prompt extension needed, untested

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable — all dependencies locked, no external API changes expected)

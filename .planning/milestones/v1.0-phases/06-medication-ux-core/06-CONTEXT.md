# Phase 6: Medication UX Core - Context

**Gathered:** 2026-03-11
**Updated:** 2026-03-11 (post-UAT revision)
**Status:** In progress — plans 01-04 executed, gap closure needed

<domain>
## Phase Boundary

Full medication workflow UI — compound-first prescription views, dose logging with stock depletion, retroactive dose logging via date navigation, multi-region inventory display, and today's medication dashboard. This phase rebuilds the /medications page UX on top of the service layer completed in Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Data Model Hierarchy
- **Prescription is the root entity** — a doctor's order: compound, dose amount, schedule, titration phases
- **Medication fulfills a prescription** — physical product: brand, region, pill strength, inventory/stock
- **A prescription can exist without medications** (prescribed but not yet purchased)
- **A medication gets assigned to a prescription** — multiple medications can sit under one prescription, only one active (has stock)
- **When adding a medication**, user can also create the prescription inline if one doesn't exist for that compound
- **A prescription can also be created standalone** (without a medication)
- **Physical pill contents determine pills-per-dose** — e.g., 6.25mg dose with 3.125mg pills = 2 pills per dose

### 4-Tab Layout
- **4 tabs**: Schedule, Medications, Prescriptions, Settings
- **Schedule tab**: today's dose dashboard (unchanged from plans 01-04)
- **Medications tab**: compound/brand inventory, stock, refills, which prescription each medication is assigned to
- **Prescriptions tab**: manage prescriptions, current dosage config, titration phases, simplified schedules
- **Settings tab**: med preferences (unchanged)

### Prescriptions Tab
- **List of active prescriptions** — each showing compound name, current dose, current schedule, titration status
- **Titration phase management** — see current dosage, set up planned future phases (increase/decrease dose or frequency)
- **Titration is planned but activated ad-hoc** — user creates a phase config in advance, then manually activates when ready
- **Titration examples**: Spironolactone 3.125mg → 6.25mg per dose, OR same dose but twice daily instead of once
- **Notes/scratchpad per prescription** — add notes without editing prescription details (doctor instructions, side effect observations, etc.)
- **Schedule display is simplified** — flat list of times, same every day. Optional day selection for once-weekly drugs
- **"As needed" schedule type** — set a reminder time but expect frequent skips (e.g., Furosemide)

### Medications Tab (revised)
- **Compound card shows**: compound name (heading), active brand name, active stock level, region
- **Inline expand on tap** — shows all inventory items (brands/regions), refill history, edit stock
- **"Add another medication" button** below the medication list (in addition to FAB)
- **Medication assigned to a prescription** on add — but only active if no other stocked medication fulfills that prescription
- **Region is secondary info** — not shown at list level, only in expanded view
- **Brand switching**: Dedicated "Switch active brand" action in expanded card

### Schedule Simplification
- **No "Schedule 1, Schedule 2" naming** — just a flat list of time entries
- **Always requires at least 1 schedule entry** per prescription
- **Same times every day** by default — optional day-of-week selection for weekly drugs
- **"As needed" type** — single reminder time, no strict schedule

### Add Medication Wizard Fixes
- **AI auto-select dosage strength** — if user searches "Eliquis 5mg", auto-select the 5mg option from AI results
- **Don't force prescription creation** — adding a medication assigns it to an existing prescription, or creates one inline if needed

### Bug Fixes (from UAT)
- **Schedule not updating** after creating a medicine — cache invalidation bug, schedule tab must refresh
- **Inventory button doesn't navigate** — clicking inventory should open the inventory/expanded view
- **Expanded card shows wrong content** — should show actual dosage amounts, not "current phase" label
- **Can't edit refill entries** — need ability to correct inventory transaction mistakes

### Dose Logging Flow
- **Take = immediate log at current time** — tap Take, dose logged instantly, 5-second auto-dismiss toast with Undo button
- **Skip and Take both visible** as buttons on each pending dose row
- **Skip shows preset reasons**: Forgot, Side effects, Ran out, Doctor advised, Don't need this dose — plus freeform option
- **Auto-suggest "Ran out"** when stock is depleted/negative at skip time
- **Mark All uses same immediate + undo pattern** — all doses at a time slot logged at once, single undo toast reverses all
- **Tapping a taken dose** opens detail view showing when taken, which inventory, with Untake action
- **No inventory = still log** — dose logs successfully, toast says "Dose logged — no stock tracked. Add inventory?" with link
- **Haptic feedback** — light vibration on Take (success) and Skip (different pattern) via Vibration API
- **Smooth state transitions** — pending → taken (green fade + checkmark) or skipped (dimmed + strikethrough), using existing animation timing from settings store

### Pill Icon System
- **Pill shape and color fetched from AI** during medication add/search — AI returns approximate appearance description
- **Core shapes**: round tablet, oval tablet, capsule (two-tone), oblong
- **Stored on inventory item**, editable by user if AI got it wrong
- **Fractional display is nice-to-have** — only if the shape can be accurately "cut" visually. Otherwise show full pill shape + text like "½ tablet"
- **Accuracy = approximate** — right general shape and color, not pharmaceutical reference quality

### Low Stock Alerts
- **Three-tier system**: toast warning on depletion + persistent badge on compound card + configurable threshold warning
- **Threshold configured per compound** in compound's expanded card or edit view
- **Negative stock allowed** (Phase 3 decision) — don't block dose logging, just warn

### Retroactive Dose Logging
- **Access via WeekDaySelector** — navigate to past date, see that day's schedule with missed doses actionable
- **Past date Take shows time picker** pre-filled to scheduled time — "When did you take it?"
- **Today's Take is immediate** (no time picker) — optional time adjustment via dose detail after logging
- **No date limit** — can navigate back to any date since prescription was active (Phase 3 decision: no rolling window)

### Today's Dashboard (Schedule Tab)
- **Grouped by time slot** (08:00, 12:00, 20:00 etc.) with Mark All per slot
- **Progress summary at top** (today only): progress bar + "3/5 taken" + low stock warnings
- **Past dates**: no progress summary, just dose list with states
- **Next upcoming time slot highlighted** with accent border/background
- **Missed time slots inline but dimmed** — still actionable (take/skip), not collapsed
- **Celebratory banner** when all doses taken: "All done for today!" with checkmark
- **Auto-scroll to next upcoming time slot** when opening schedule
- **Empty day**: cat icon/illustration + "No medications scheduled for today"
- **No adherence streak** — avoids gamification pressure
- **No status dots on WeekDaySelector** — selector is for navigation only

### Claude's Discretion
- Loading skeleton design for schedule view
- Exact spacing, typography, and color choices
- Animation timing details beyond "use settings store values"
- How dose detail view is structured internally
- Pill icon SVG implementation details
- Cat illustration style for empty states

</decisions>

<specifics>
## Specific Ideas

- Cat icons/illustrations for empty states and friendly messages throughout the app — user preference, not just medications
- Medisafe-style daily dashboard — open app, see today's doses with states (pending/taken/skipped), mark all, edit individual (carried from Phase 3)
- Pill icons should reflect the actual physical pill shape and color, fetched from AI during add flow
- "I see the notification, go take the meds, then come back and log" — the common flow. Time picker friction should be avoided for today's doses

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pill-icon.tsx` (96 lines): Existing pill icon component — needs extension for shape/color variants
- `add-medication-wizard.tsx` (987 lines): Multi-step wizard — keep as-is, update for compound-first model
- `dose-detail-dialog.tsx` (258 lines): Dose detail view — extend with untake action and time editing
- `week-day-selector.tsx` (117 lines): Date picker — already supports date navigation, no date limit needed
- `mark-all-modal.tsx` (146 lines): Bulk dose action — update to immediate+undo pattern
- `schedule-view.tsx` (180 lines): Current schedule — rebuild with time-slot grouping and progress summary
- `edit-medication-drawer.tsx` (797 lines): Currently named PrescriptionViewDrawer — refactor into inline expand

### Established Patterns
- useLiveQuery for all reads (Phase 3) — schedule and medication list auto-update on DB changes
- useMutation with ServiceResult for writes (Phase 3) — dose take/skip/untake use this pattern
- Zustand settings store for animation timing (barTransitionDurationMs, scrollDurationMs, autoHideDelayMs)
- shadcn/ui components (Card, Dialog, Drawer, Button, Tabs) for UI primitives
- useScrollHide hook for header/footer auto-hide on scroll

### Integration Points
- `medication-service.ts`: takeDose, skipDose, untakeDose — atomic transactions already built
- `medication-schedule-service.ts`: dose schedule derivation at read time
- `use-medication-queries.ts`: React Query hooks for medication data
- `med-footer.tsx` (66 lines): Tab bar — update from 5 tabs to 3 tabs
- `medications-list.tsx` (162 lines) + `prescriptions-list.tsx` (134 lines): Merge into single compound list

</code_context>

<deferred>
## Deferred Ideas

- Pill icon AI integration (fetching shape/color from AI during add) — nice-to-have, manual selection is MVP
- Adherence streaks / gamification — explicitly rejected
- Status dots on WeekDaySelector — explicitly rejected

</deferred>

---

*Phase: 06-medication-ux-core*
*Context gathered: 2026-03-11*

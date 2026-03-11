# Phase 6: Medication UX Core - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Full medication workflow UI — compound-first prescription views, dose logging with stock depletion, retroactive dose logging via date navigation, multi-region inventory display, and today's medication dashboard. This phase rebuilds the /medications page UX on top of the service layer completed in Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Compound-First Views
- **Merge prescriptions + medications tabs into one "Medications" list** — single list of compounds, no separate tabs for prescription info vs inventory items
- **Compound card shows**: compound name (heading), prescribed dose (mg), active brand name, active stock level, next dose status
- **Inline expand on tap** — card expands in-place to show all inventory items, schedule info, last 3-5 dose history, edit/history actions. No drawer overlay
- **Region is secondary info** — not shown at list level, only visible in detail/expanded view. Region notes where a brand is from but isn't critical at a glance
- **3-tab layout**: Schedule (today's dashboard), Medications (merged compound list), Settings (med preferences). Status tab absorbed into Schedule
- **Add medication**: FAB on Medications tab + "Add first medication" prompt in empty schedule. Keep existing add-medication wizard as-is, updated for compound-first model
- **Brand switching**: Dedicated "Switch active brand" action in expanded card with picker (not simple tap-to-activate)

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

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-medication-ux-core*
*Context gathered: 2026-03-11*

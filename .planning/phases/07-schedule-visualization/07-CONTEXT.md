# Phase 7: Schedule Visualization - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a visual phase timeline to the prescription detail drawer showing titration and maintenance phases in chronological order. Users can see which phase is active, what changed between phases, and what's planned next. This is a read-only visualization — editing phases is already handled by the titrations tab.

</domain>

<decisions>
## Implementation Decisions

### Timeline layout
- Vertical timeline with a connecting line on the left
- Chronological order: planned/future phases at top, active in the middle, completed/past at bottom
- Auto-scroll to the active phase on open so the user lands on what's current
- Lives inside the prescription detail drawer as a "Phase Timeline" section

### Phase detail density
- Active phase: expanded by default — shows full schedule breakdown (times, dosages), date range, duration
- Completed phases: compact one-liner (name + date range + dosage summary like "75mg → 150mg · 2 weeks")
- Planned phases: compact (target dosage + planned start date)
- All non-active phases are tap-to-expand to see full schedule detail

### Active phase emphasis
- Green left border accent on the active phase node (matches established green-for-active pattern from Rx cards and titration cards)
- Active phase auto-expanded with full detail
- Completed phases use a filled dot (●), active uses a ring dot (◉), planned uses an empty dot (○)

### Transition indicators
- Between phases, show a small inline dosage change label: "▲ 75mg → 150mg" or "Schedule changed"
- Derived by comparing adjacent phases' total daily dosage or schedule times
- Lightweight — sits on the connecting line between nodes

### Claude's Discretion
- Exact spacing, font sizes, and timeline line styling
- Animation for expand/collapse of phase details
- How to handle prescriptions with only one phase (just show the single node, no timeline needed)
- Whether to show a "No phases" empty state or hide the section entirely

</decisions>

<canonical_refs>
## Canonical References

No external specs — requirements fully captured in decisions above.

### Existing phase display
- `src/components/medications/titration-phase-card.tsx` — Current phase card with status/type badges and schedule display. Reference for phase detail rendering.
- `src/components/medications/prescription-detail-drawer.tsx` — Where the timeline will be added. Has existing ScheduleSection and phase list.
- `src/components/medications/titrations-view.tsx` — PhaseEntryRow component shows phase schedules. Reusable pattern.

### Data layer
- `src/hooks/use-medication-queries.ts` — `usePhasesForPrescription`, `useSchedulesForPhase` hooks already exist
- `src/lib/db.ts` — MedicationPhase interface (type, status, startDate, endDate, unit, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TitrationPhaseCard`: Shows individual phases with status badges (active/pending/completed/cancelled) and type badges (maintenance/titration). Schedule display with time + dosage per day.
- `PhaseEntryRow` (in titrations-view): Compact phase display with schedule listing. Good reference for the expanded state.
- `usePhasesForPrescription` hook: Already loads all phases for a prescription.
- `useSchedulesForPhase` hook: Already loads schedules for a phase.
- Established color language: emerald/green = active, amber = titration, blue = maintenance, gray = completed.

### Established Patterns
- framer-motion `AnimatePresence` for expand/collapse (used throughout medication components)
- `cn()` utility for conditional classes
- Cards with rounded corners, subtle borders, muted backgrounds

### Integration Points
- `PrescriptionDetailDrawer` — the timeline section goes here, between "Current Schedule" and the existing phase cards
- The existing `TitrationPhaseCard` list can be replaced by the new timeline component
- No new data fetching needed — `usePhasesForPrescription` + `useSchedulesForPhase` cover everything

</code_context>

<specifics>
## Specific Ideas

- "I would like the current/latest information first" — active phase should be the focus point, auto-scrolled into view
- Planned phases above active (chronological top-to-bottom: future → current → past)
- Timeline node symbols: ○ planned, ◉ active, ● completed
- Dosage change labels between phases: "▲ 75mg → 150mg"
- Green left border accent on active phase (consistent with Rx card and titration card patterns)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-schedule-visualization*
*Context gathered: 2026-03-20*

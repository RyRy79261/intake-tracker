# Phase 7: Schedule Visualization - Research

**Researched:** 2026-03-20
**Domain:** UI component — vertical timeline visualization for medication phases
**Confidence:** HIGH

## Summary

This phase adds a visual phase timeline to the prescription detail drawer. It is a pure UI task: no new data fetching, no schema changes, no service layer work. All data is already available via `usePhasesForPrescription` and `useSchedulesForPhase` hooks. The implementation is a single new component (`PhaseTimeline`) that replaces the existing `PhasesSection` in `PrescriptionDetailDrawer`.

The project already uses `motion/react` (v12.29+) with `AnimatePresence` for expand/collapse throughout the medications module. The established pattern is `initial={{ height: 0, opacity: 0 }}` / `animate={{ height: "auto", opacity: 1 }}` with `overflow-hidden`. The timeline component should follow this exact pattern for tap-to-expand on non-active phases.

**Primary recommendation:** Build one new component (`PhaseTimeline`) with sub-components for timeline nodes, transition labels, and phase detail. Wire it into the existing `PrescriptionDetailDrawer` replacing `PhasesSection`. Keep the "Plan new phase" button at the bottom.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Vertical timeline with connecting line on the left
- Chronological order: planned/future at top, active in middle, completed/past at bottom
- Auto-scroll to active phase on open
- Lives inside prescription detail drawer as "Phase Timeline" section
- Active phase: expanded by default with full schedule breakdown (times, dosages), date range, duration
- Completed phases: compact one-liner (name + date range + dosage summary like "75mg -> 150mg . 2 weeks")
- Planned phases: compact (target dosage + planned start date)
- Non-active phases tap-to-expand for full schedule detail
- Green left border accent on active phase node
- Timeline node symbols: filled dot completed, ring dot active, empty dot planned
- Dosage change labels between phases: "triangle-up 75mg -> 150mg" or "Schedule changed"
- Transition labels derived by comparing adjacent phases

### Claude's Discretion
- Exact spacing, font sizes, and timeline line styling
- Animation for expand/collapse of phase details
- How to handle prescriptions with only one phase (show single node, no timeline needed)
- Whether to show a "No phases" empty state or hide the section entirely

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MEDX-07 | Schedule visualization -- maintenance vs titration phases displayed clearly | Full support: timeline component with phase type badges, status-based styling, dosage summaries, and transition labels between phases |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| motion | ^12.29.2 | Expand/collapse animations | Already used throughout medications module |
| React | ^18.3.1 | Component framework | Project framework |
| Tailwind CSS | 3.x | Styling | Project styling system |
| shadcn/ui | n/a | Badge, Card components | Project component library |
| lucide-react | n/a | Icons | Project icon library |

### Supporting (already available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dexie + useLiveQuery | n/a | Data hooks | `usePhasesForPrescription`, `useSchedulesForPhase` already exist |
| cn() utility | n/a | Conditional class merging | All conditional styling |

**Installation:** None required. All dependencies already installed.

## Architecture Patterns

### Recommended Component Structure
```
src/components/medications/
  phase-timeline.tsx          # New file: PhaseTimeline + sub-components
  prescription-detail-drawer.tsx  # Modified: swap PhasesSection for PhaseTimeline
```

### Pattern 1: PhaseTimeline Component Tree
**What:** Single file with exported `PhaseTimeline` and internal sub-components
**When to use:** Always -- this is the only new file

```typescript
// phase-timeline.tsx
// PhaseTimeline (main) -- receives phases[], prescriptionId, currentUnit
//   TimelineNode (per phase) -- dot + content + expand state
//   TransitionLabel (between nodes) -- dosage change indicator
//   PhaseDetailExpanded (expanded view) -- schedule list, date range, duration
//   PhaseDetailCompact (collapsed view) -- one-liner summary
```

### Pattern 2: Sorting and Grouping
**What:** Phases sorted chronologically for timeline display
**When to use:** Before rendering the timeline

```typescript
// Sort: planned (future) first, then active, then completed (oldest last)
// Use startDate as primary sort key (ascending = earliest at top)
// Within same startDate, use status as tiebreaker: pending > active > completed
const sorted = [...phases].sort((a, b) => {
  // Pending phases without startDate go to top
  // Then sort by startDate descending (newest first = future at top)
  return b.startDate - a.startDate;
});
```

Note: The user wants "planned/future phases at top, active in the middle, completed/past at bottom." Since phases are chronological and future phases have later startDates, sorting by `startDate` descending naturally achieves this ordering.

### Pattern 3: Auto-scroll to Active Phase
**What:** On drawer open, scroll the active phase node into view
**When to use:** When the timeline mounts

```typescript
const activeRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  // Small delay to ensure drawer animation completes
  const timer = setTimeout(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
  return () => clearTimeout(timer);
}, []);
```

### Pattern 4: Expand/Collapse Animation (established project pattern)
**What:** AnimatePresence with height 0->auto for tap-to-expand
**When to use:** Non-active phase nodes

```typescript
import { motion, AnimatePresence } from "motion/react";

<AnimatePresence>
  {isExpanded && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <PhaseDetailExpanded phase={phase} schedules={schedules} />
    </motion.div>
  )}
</AnimatePresence>
```

### Pattern 5: Transition Labels Between Phases
**What:** Compute dosage change between adjacent phases
**When to use:** Between every pair of timeline nodes

```typescript
function computeTransitionLabel(
  fromPhase: MedicationPhase,
  fromSchedules: PhaseSchedule[],
  toPhase: MedicationPhase,
  toSchedules: PhaseSchedule[]
): string {
  const fromTotal = fromSchedules
    .filter(s => s.enabled)
    .reduce((sum, s) => sum + s.dosage, 0);
  const toTotal = toSchedules
    .filter(s => s.enabled)
    .reduce((sum, s) => sum + s.dosage, 0);

  if (fromTotal !== toTotal) {
    const arrow = toTotal > fromTotal ? "\u25B2" : "\u25BC";
    return `${arrow} ${fromTotal}${fromPhase.unit} \u2192 ${toTotal}${toPhase.unit}`;
  }
  // If dosage same but schedules differ
  return "Schedule changed";
}
```

### Anti-Patterns to Avoid
- **Fetching schedules in a loop:** Do NOT call `useSchedulesForPhase` inside a `.map()`. Instead, create a sub-component per phase that individually calls the hook (React rules of hooks).
- **Heavy re-render on expand:** Keep expanded state local to each `TimelineNode`, not lifted to parent.
- **Ignoring cancelled phases:** Cancelled phases should still appear in the timeline (dimmed) -- they are part of the prescription history.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Expand/collapse animation | CSS transitions or manual height calc | `motion/react` AnimatePresence with height auto | Already used everywhere, handles unmount animation |
| Conditional classes | String concatenation | `cn()` utility | Project standard, handles falsy values |
| Phase data loading | Custom fetch logic | `usePhasesForPrescription` / `useSchedulesForPhase` | Already exist with useLiveQuery reactivity |

## Common Pitfalls

### Pitfall 1: Hook Rules in Timeline Rendering
**What goes wrong:** Calling `useSchedulesForPhase` inside a map/loop violates React hooks rules
**Why it happens:** Each phase needs its schedules, tempting to iterate
**How to avoid:** Extract a `TimelineNode` component that receives a single phase and calls `useSchedulesForPhase` internally
**Warning signs:** ESLint hooks rule violation, inconsistent schedule data

### Pitfall 2: Scroll Timing with Drawer Animation
**What goes wrong:** `scrollIntoView` fires before the drawer is fully open, scroll target not yet in DOM
**Why it happens:** Drawer uses animation, content isn't laid out immediately
**How to avoid:** Use `setTimeout` with ~300ms delay after mount, matching drawer animation duration
**Warning signs:** Active phase not visible on open, scroll does nothing

### Pitfall 3: Dosage Summary for Compact View
**What goes wrong:** Showing "0mg" or wrong unit when schedules haven't loaded yet
**Why it happens:** `useLiveQuery` returns `[]` as default before data loads
**How to avoid:** Handle empty schedules array gracefully -- show "Loading..." or defer render
**Warning signs:** Flash of "0mg" text on initial render

### Pitfall 4: Single-Phase Prescriptions
**What goes wrong:** Timeline looks odd with just one node and no connecting line
**Why it happens:** Most new prescriptions start with a single maintenance phase
**How to avoid:** For single-phase prescriptions, show just the phase detail without timeline chrome (no connecting line, no dots). Keep it clean.
**Warning signs:** Unnecessary visual noise for simple prescriptions

### Pitfall 5: Date Formatting Consistency
**What goes wrong:** Inconsistent date display across compact/expanded views
**Why it happens:** `startDate` and `endDate` are Unix timestamps (milliseconds)
**How to avoid:** Create a shared date formatter: `new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })`
**Warning signs:** "Invalid Date" or locale inconsistencies

## Code Examples

### Timeline Node Symbol Rendering
```typescript
function TimelineDot({ status }: { status: MedicationPhase["status"] }) {
  const dotClass = cn(
    "w-3 h-3 rounded-full border-2 flex-shrink-0",
    status === "completed" && "bg-muted-foreground border-muted-foreground",  // filled
    status === "active" && "bg-background border-emerald-500 ring-2 ring-emerald-500/30",  // ring
    status === "pending" && "bg-background border-muted-foreground/50",  // empty
    status === "cancelled" && "bg-muted border-muted-foreground/30",  // dimmed
  );
  return <div className={dotClass} />;
}
```

### Compact Phase Summary
```typescript
function formatCompactSummary(
  phase: MedicationPhase,
  schedules: PhaseSchedule[]
): string {
  const enabled = schedules.filter(s => s.enabled);
  const totalDosage = enabled.reduce((sum, s) => sum + s.dosage, 0);
  const dosageStr = `${totalDosage}${phase.unit}`;

  const start = new Date(phase.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const end = phase.endDate
    ? new Date(phase.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "present";

  // Calculate duration
  const endTs = phase.endDate ?? Date.now();
  const days = Math.round((endTs - phase.startDate) / (1000 * 60 * 60 * 24));
  const durationStr = days >= 7 ? `${Math.round(days / 7)} weeks` : `${days} days`;

  return `${dosageStr} · ${start} - ${end} · ${durationStr}`;
}
```

### Timeline Layout Structure
```typescript
// Vertical timeline with left-aligned connecting line
<div className="relative pl-6">
  {/* Connecting line */}
  <div className="absolute left-[5px] top-3 bottom-3 w-0.5 bg-border" />

  {sortedPhases.map((phase, index) => (
    <div key={phase.id}>
      {/* Transition label (between nodes, not before first) */}
      {index > 0 && (
        <TransitionLabel fromPhase={sortedPhases[index - 1]} toPhase={phase} />
      )}

      {/* Timeline node */}
      <div className="relative flex items-start gap-3 pb-4">
        {/* Dot - positioned on the connecting line */}
        <div className="absolute left-0 -translate-x-[calc(50%-5px)]">
          <TimelineDot status={phase.status} />
        </div>

        {/* Content */}
        <div className={cn(
          "flex-1 rounded-lg border p-3",
          phase.status === "active" && "border-l-2 border-l-emerald-500"
        )}>
          {/* Phase content here */}
        </div>
      </div>
    </div>
  ))}
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `framer-motion` import | `motion/react` import | motion v12 | Import path changed; project already uses new path |
| CSS-only timelines | motion-animated expand/collapse | Project convention | Consistent with rest of medications module |

**Note:** No deprecated APIs are involved. This is pure UI using established project patterns.

## Open Questions

1. **TransitionLabel schedule data**
   - What we know: Each `TimelineNode` sub-component calls `useSchedulesForPhase` for its own phase
   - What's unclear: The `TransitionLabel` between two nodes needs schedules from both the "from" and "to" phases
   - Recommendation: Have `TransitionLabel` also be a component that calls both `useSchedulesForPhase(fromPhaseId)` and `useSchedulesForPhase(toPhaseId)`, OR compute transition data inside each `TimelineNode` and pass it down. The former is simpler and follows hooks rules.

2. **"Plan new phase" button placement**
   - What we know: Currently at bottom of PhasesSection with a form that creates new phases
   - What's unclear: Should it stay below the timeline, or move elsewhere?
   - Recommendation: Keep at bottom of timeline section. The `NewPhaseForm` logic from `prescription-detail-drawer.tsx` should be preserved as-is.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via `pnpm test`) + Playwright E2E |
| Config file | vitest.config.ts, playwright.config.ts |
| Quick run command | `pnpm build` (type-check + build verification) |
| Full suite command | `pnpm build && pnpm test:e2e` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEDX-07 | Phase timeline renders with correct nodes, active emphasis, transition labels | manual-only | Visual UI component -- no unit test infrastructure for Dexie-dependent components | N/A |
| MEDX-07 | Build succeeds with new component | build | `pnpm build` | Existing |

**Manual-only justification:** This is a read-only UI visualization component. The project has no component-level test setup (no jsdom rendering tests for React components with Dexie hooks). Build verification confirms no type errors. Visual correctness requires manual/UAT inspection.

### Sampling Rate
- **Per task commit:** `pnpm build`
- **Per wave merge:** `pnpm build`
- **Phase gate:** `pnpm build` green + visual UAT in browser

### Wave 0 Gaps
None -- existing build infrastructure covers the verification needs. No new test files needed for a read-only visualization component.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/components/medications/prescription-detail-drawer.tsx` -- current PhasesSection structure
- Codebase analysis: `src/components/medications/titration-phase-card.tsx` -- existing phase card rendering
- Codebase analysis: `src/components/medications/prescription-card.tsx` -- AnimatePresence expand/collapse pattern
- Codebase analysis: `src/lib/db.ts` -- MedicationPhase and PhaseSchedule interfaces
- Codebase analysis: `src/hooks/use-medication-queries.ts` -- existing data hooks

### Secondary (MEDIUM confidence)
- motion/react v12 API -- confirmed via project imports and package.json

### Tertiary (LOW confidence)
None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all already installed and used
- Architecture: HIGH -- clear component structure, established patterns to follow
- Pitfalls: HIGH -- identified from direct codebase analysis (hooks rules, scroll timing, empty states)

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- no external dependencies changing)

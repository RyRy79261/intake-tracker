"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { useSchedulesForPhase } from "@/hooks/use-medication-queries";
import type { MedicationPhase } from "@/lib/db";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface PhaseTimelineProps {
  phases: MedicationPhase[];
  prescriptionId: string;
  currentUnit: string;
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  active: 1,
  completed: 2,
  cancelled: 3,
};

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  maintenance: {
    label: "Maintenance",
    className: "bg-blue-500 hover:bg-blue-600 text-white",
  },
  titration: {
    label: "Titration",
    className: "bg-amber-500 hover:bg-amber-600 text-white",
  },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-green-500 hover:bg-green-600 text-white",
  },
  pending: {
    label: "Pending",
    className: "bg-gray-400 hover:bg-gray-500 text-white",
  },
  completed: {
    label: "Completed",
    className: "bg-muted text-muted-foreground",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-400 hover:bg-red-500 text-white",
  },
};

// ============================================================================
// Helpers
// ============================================================================

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(startTs: number, endTs?: number): string {
  const end = endTs ?? Date.now();
  const days = Math.max(1, Math.round((end - startTs) / (1000 * 60 * 60 * 24)));
  return days >= 7 ? `${Math.round(days / 7)} weeks` : `${days} days`;
}

function formatFoodInstruction(instruction: string): string | null {
  if (instruction === "before") return "Take before eating";
  if (instruction === "after") return "Take after eating";
  return null;
}

function computeTotalDosage(
  schedules: { dosage: number; enabled: boolean }[]
): number {
  return schedules
    .filter((s) => s.enabled)
    .reduce((sum, s) => sum + s.dosage, 0);
}

// ============================================================================
// TimelineDot
// ============================================================================

function TimelineDot({ status }: { status: MedicationPhase["status"] }) {
  const base = "w-3 h-3 rounded-full border-2 flex-shrink-0";
  const variants: Record<string, string> = {
    active: "bg-background border-emerald-500 ring-2 ring-emerald-500/30",
    completed: "bg-muted-foreground border-muted-foreground",
    pending: "bg-background border-muted-foreground/50",
    cancelled: "bg-muted border-muted-foreground/30",
  };
  return <div className={cn(base, variants[status])} />;
}

// ============================================================================
// TransitionLabel
// ============================================================================

function TransitionLabel({
  fromPhaseId,
  toPhaseId,
  unit,
}: {
  fromPhaseId: string;
  toPhaseId: string;
  unit: string;
}) {
  const fromSchedules = useSchedulesForPhase(fromPhaseId);
  const toSchedules = useSchedulesForPhase(toPhaseId);

  const fromTotal = computeTotalDosage(fromSchedules);
  const toTotal = computeTotalDosage(toSchedules);

  if (fromTotal === toTotal && fromSchedules.length === toSchedules.length) {
    return null;
  }

  if (fromTotal !== toTotal) {
    const arrow = toTotal > fromTotal ? "\u25B2" : "\u25BC";
    return (
      <div className="text-[10px] text-muted-foreground py-1 pl-6">
        {arrow} {fromTotal}
        {unit} &rarr; {toTotal}
        {unit}
      </div>
    );
  }

  return (
    <div className="text-[10px] text-muted-foreground py-1 pl-6">
      Schedule changed
    </div>
  );
}

// ============================================================================
// PhaseDetailCompact
// ============================================================================

function PhaseDetailCompact({
  phase,
  totalDosage,
  unit,
}: {
  phase: MedicationPhase;
  totalDosage: number;
  unit: string;
}) {
  const dosageText = totalDosage > 0 ? `${totalDosage}${unit}` : "No dosage";
  const typeStyle = TYPE_BADGE[phase.type] ?? TYPE_BADGE.maintenance;

  if (phase.status === "completed" || phase.status === "cancelled") {
    const start = formatDate(phase.startDate);
    const end = phase.endDate ? formatDate(phase.endDate) : "present";
    const duration = formatDuration(phase.startDate, phase.endDate);
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={cn("text-[10px] px-1.5 py-0", typeStyle.className)}>
          {typeStyle.label}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {dosageText} &middot; {start} - {end} &middot; {duration}
        </span>
      </div>
    );
  }

  // pending
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge className={cn("text-[10px] px-1.5 py-0", typeStyle.className)}>
        {typeStyle.label}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {dosageText} &middot; starts {formatDate(phase.startDate)}
      </span>
    </div>
  );
}

// ============================================================================
// PhaseDetailExpanded
// ============================================================================

function PhaseDetailExpanded({
  phase,
  schedules,
  unit,
}: {
  phase: MedicationPhase;
  schedules: { time: string; dosage: number; enabled: boolean }[];
  unit: string;
}) {
  const typeStyle = TYPE_BADGE[phase.type] ?? TYPE_BADGE.maintenance;
  const statusStyle = STATUS_BADGE[phase.status] ?? STATUS_BADGE.pending;
  const enabled = schedules
    .filter((s) => s.enabled)
    .sort((a, b) => a.time.localeCompare(b.time));

  const foodText = formatFoodInstruction(phase.foodInstruction);
  const start = formatDate(phase.startDate);
  const end = phase.endDate ? formatDate(phase.endDate) : "present";
  const duration = formatDuration(phase.startDate, phase.endDate);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge className={cn("text-[10px] px-1.5 py-0", typeStyle.className)}>
          {typeStyle.label}
        </Badge>
        <Badge
          className={cn("text-[10px] px-1.5 py-0", statusStyle.className)}
        >
          {statusStyle.label}
        </Badge>
      </div>

      {enabled.length > 0 ? (
        <div className="space-y-0.5">
          {enabled.map((s, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              {s.time} - {s.dosage}
              {unit}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No schedules configured</p>
      )}

      {foodText && (
        <p className="text-xs text-muted-foreground/70">{foodText}</p>
      )}

      <p className="text-xs text-muted-foreground/70">
        {start} - {end}
      </p>
      <p className="text-xs text-muted-foreground/50">{duration}</p>
    </div>
  );
}

// ============================================================================
// TimelineNode
// ============================================================================

function TimelineNode({
  phase,
  isActive,
  defaultExpanded,
  activeRef,
}: {
  phase: MedicationPhase;
  isActive: boolean;
  defaultExpanded: boolean;
  activeRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const schedules = useSchedulesForPhase(phase.id);
  const totalDosage = computeTotalDosage(schedules);
  const unit = phase.unit;

  return (
    <div
      ref={isActive ? activeRef : undefined}
      className={cn(
        "relative pl-5 py-1.5 cursor-pointer rounded-md",
        isActive && "border-l-2 border-l-emerald-500 bg-emerald-500/5",
        phase.status === "cancelled" && "opacity-50"
      )}
      onClick={() => setIsExpanded((prev) => !prev)}
    >
      {/* Dot on the timeline */}
      <div className="absolute left-[-11px] top-3">
        <TimelineDot status={phase.status} />
      </div>

      {/* Content */}
      <AnimatePresence initial={false} mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <PhaseDetailExpanded
              phase={phase}
              schedules={schedules}
              unit={unit}
            />
          </motion.div>
        ) : (
          <motion.div
            key="compact"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <PhaseDetailCompact
              phase={phase}
              totalDosage={totalDosage}
              unit={unit}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// PhaseTimeline (exported)
// ============================================================================

export function PhaseTimeline({
  phases,
}: PhaseTimelineProps) {
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  if (phases.length === 0) return null;

  // Sort: descending by startDate, with status tiebreaker
  const sorted = [...phases].sort((a, b) => {
    const dateDiff = b.startDate - a.startDate;
    if (dateDiff !== 0) return dateDiff;
    return (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4);
  });

  // Single-phase: no timeline chrome
  if (sorted.length === 1) {
    const phase = sorted[0]!;
    return (
      <TimelineNode
        phase={phase}
        isActive={phase.status === "active"}
        defaultExpanded={true}
      />
    );
  }

  // Multiple phases: vertical timeline
  return (
    <div className="relative pl-6">
      {/* Vertical connecting line */}
      <div className="absolute left-[5px] top-3 bottom-3 w-0.5 bg-border" />

      {sorted.map((phase, index) => {
        const isActive = phase.status === "active";
        const prevPhase = index > 0 ? sorted[index - 1] : undefined;

        return (
          <div key={phase.id}>
            {/* Transition label between nodes */}
            {prevPhase && (
              <TransitionLabel
                fromPhaseId={prevPhase.id}
                toPhaseId={phase.id}
                unit={phase.unit}
              />
            )}
            <TimelineNode
              phase={phase}
              isActive={isActive}
              defaultExpanded={isActive}
              activeRef={isActive ? activeRef : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

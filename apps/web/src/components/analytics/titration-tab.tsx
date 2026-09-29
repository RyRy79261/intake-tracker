"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useLiveQuery } from "@/hooks/use-live-query";
import {
  ChevronDown,
  Pill,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
} from "lucide-react";
import { getPrescriptions, getPhasesForPrescription } from "@/lib/medication-service";
import {
  adherenceRate,
  bpTrend,
  weightTrend,
  fluidBalance,
  getRecordsByDomain,
} from "@/lib/analytics-service";
import { detectAnomalies } from "@/lib/analytics-stats";
import type { TimeRange, TrendDirection } from "@intake/types/analytics";
import type { Prescription, MedicationPhase, PhaseType } from "@/lib/db";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhaseSnapshot {
  phase: MedicationPhase;
  adherenceRate: number;
  adherenceTotal: number;
  bpAvg: { systolic: number; diastolic: number };
  bpTrend: TrendDirection;
  weightAvg: number;
  weightTrend: TrendDirection;
  fluidAvgBalance: number;
  anomalyCount: number;
  hasData: boolean;
}

interface PrescriptionReport {
  prescription: Prescription;
  phases: PhaseSnapshot[];
}

// ---------------------------------------------------------------------------
// Data hook
// ---------------------------------------------------------------------------

/**
 * The part of a phase that falls inside the selected range, or `undefined`
 * when the two don't overlap. Metrics are computed over this window so the
 * shared time selector actually scopes the tab.
 */
export function phaseWindow(phase: MedicationPhase, range: TimeRange): TimeRange | undefined {
  const start = Math.max(phase.startDate, range.start);
  const end = Math.min(phase.endDate ?? Date.now(), range.end);
  return end > start ? { start, end } : undefined;
}

function useTitrationData(range: TimeRange): PrescriptionReport[] | undefined {
  return useLiveQuery(async () => {
    const prescriptions = await getPrescriptions();
    const reports: PrescriptionReport[] = [];

    for (const rx of prescriptions) {
      const phases = await getPhasesForPrescription(rx.id);
      const snapshots: PhaseSnapshot[] = [];

      // getPhasesForPrescription already drops soft-deleted phases.
      for (const phase of phases) {
        // Phases outside the selected range aren't shown at all.
        const phaseRange = phaseWindow(phase, range);
        if (!phaseRange) continue;

        try {
          const [adhResult, bpResult, wtResult, fbResult, weightPoints] =
            await Promise.all([
              adherenceRate(phaseRange, rx.id),
              bpTrend(phaseRange),
              weightTrend(phaseRange),
              fluidBalance(phaseRange),
              getRecordsByDomain("weight", phaseRange),
            ]);

          const anomalies = detectAnomalies(weightPoints);
          const hasData =
            adhResult.value.total > 0 ||
            bpResult.value.readings.length > 0 ||
            wtResult.value.readings.length > 0;

          snapshots.push({
            phase,
            adherenceRate: adhResult.value.rate,
            adherenceTotal: adhResult.value.total,
            bpAvg: bpResult.value.avg,
            bpTrend: bpResult.value.trend.systolic,
            weightAvg: wtResult.value.avg,
            weightTrend: wtResult.value.trend,
            fluidAvgBalance: fbResult.value.avgBalance,
            anomalyCount: anomalies.length,
            hasData,
          });
        } catch {
          snapshots.push(emptySnapshot(phase));
        }
      }

      reports.push({ prescription: rx, phases: snapshots });
    }

    return reports;
  }, [range.start, range.end]);
}

function emptySnapshot(phase: MedicationPhase): PhaseSnapshot {
  return {
    phase,
    adherenceRate: 0,
    adherenceTotal: 0,
    bpAvg: { systolic: 0, diastolic: 0 },
    bpTrend: { slope: 0, direction: "stable", confidence: 0 },
    weightAvg: 0,
    weightTrend: { slope: 0, direction: "stable", confidence: 0 },
    fluidAvgBalance: 0,
    anomalyCount: 0,
    hasData: false,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function TrendArrow({ direction }: { direction: TrendDirection["direction"] }) {
  const Icon =
    direction === "rising" ? TrendingUp : direction === "falling" ? TrendingDown : Minus;
  const color =
    direction === "rising"
      ? "hsl(var(--bp))"
      : direction === "falling"
        ? "hsl(var(--weight))"
        : "hsl(var(--muted-fg))";
  return (
    <span className="inline-flex" style={{ color }} role="img" aria-label={`trend ${direction}`}>
      <Icon />
    </span>
  );
}

function AdherenceValue({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color =
    pct >= 90 ? "hsl(var(--weight))" : pct >= 70 ? "hsl(var(--sodium))" : "hsl(var(--bp))";
  return <span style={{ color }}>{pct}%</span>;
}

function PhaseTypeBadge({ type }: { type: PhaseType }) {
  return (
    <span
      className="wm-pill"
      style={{ "--c": `hsl(var(--${type === "titration" ? "sodium" : "water"}))` } as CSSProperties}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Phase snapshot card
// ---------------------------------------------------------------------------

function PhaseSnapshotCard({ snapshot }: { snapshot: PhaseSnapshot }) {
  const { phase } = snapshot;
  const isActive = phase.status === "active";
  const dateLabel = `${formatDate(phase.startDate)} - ${
    phase.endDate ? formatDate(phase.endDate) : "present"
  }`;

  const metrics: { key: string; label: string; value: ReactNode }[] = [];
  if (snapshot.hasData) {
    if (snapshot.adherenceTotal > 0) {
      metrics.push({ key: "ad", label: "Adherence", value: <AdherenceValue rate={snapshot.adherenceRate} /> });
    }
    if (snapshot.bpAvg.systolic > 0) {
      metrics.push({
        key: "bp",
        label: "Avg BP",
        value: (
          <>
            {Math.round(snapshot.bpAvg.systolic)}/{Math.round(snapshot.bpAvg.diastolic)}
            <TrendArrow direction={snapshot.bpTrend.direction} />
          </>
        ),
      });
    }
    if (snapshot.weightAvg > 0) {
      metrics.push({
        key: "wt",
        label: "Avg Weight",
        value: (
          <>
            {snapshot.weightAvg.toFixed(1)} kg
            <TrendArrow direction={snapshot.weightTrend.direction} />
          </>
        ),
      });
    }
    if (snapshot.fluidAvgBalance !== 0) {
      metrics.push({
        key: "fb",
        label: "Avg Fluid Balance",
        value: `${Math.round(snapshot.fluidAvgBalance)} ml`,
      });
    }
  }

  return (
    <div className={cn("wm-ph", isActive && "act")}>
      <div className="wm-ph-h">
        <PhaseTypeBadge type={phase.type} />
        {isActive && <span className="wm-pdot" role="img" aria-label="Active phase" />}
        <span className="dt">{dateLabel}</span>
      </div>

      {!snapshot.hasData && (
        <p className="wm-p mt-2">No health data recorded during this phase</p>
      )}

      {metrics.length > 0 && (
        <div className="wm-ph-m">
          {metrics.map((m) => (
            <div key={m.key}>
              <span className="k">{m.label}</span>
              <span className="v">{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {snapshot.anomalyCount > 0 && (
        <p className="wm-ph-an">
          <Activity aria-hidden="true" />
          {snapshot.anomalyCount} anomal{snapshot.anomalyCount === 1 ? "y" : "ies"} detected
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prescription section
// ---------------------------------------------------------------------------

function PrescriptionSection({ report }: { report: PrescriptionReport }) {
  const [expanded, setExpanded] = useState(report.prescription.isActive);

  return (
    <section className="wm-tx">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <Pill aria-hidden="true" />
        <span>
          {report.prescription.genericName}
          {!report.prescription.isActive && (
            <span className="font-normal text-muted-foreground"> (inactive)</span>
          )}
        </span>
        <ChevronDown className="chev" aria-hidden="true" />
      </button>

      {expanded && (
        <div className="wm-txb">
          {report.phases.length === 0 ? (
            <p className="wm-p">No phases in the selected range</p>
          ) : (
            report.phases.map((snapshot) => (
              <PhaseSnapshotCard key={snapshot.phase.id} snapshot={snapshot} />
            ))
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

export function TitrationTab({ range }: { range: TimeRange }) {
  const reports = useTitrationData(range);

  if (!reports) {
    return <p className="wm-p py-8 text-center">Loading titration data...</p>;
  }

  if (reports.length === 0) {
    return (
      <div className="wm-empty">
        <Pill aria-hidden="true" />
        <p className="t">No prescriptions to analyze</p>
        <p className="wm-p">Add prescriptions in the Medications tab to see titration reports</p>
      </div>
    );
  }

  return (
    <>
      {reports.map((report) => (
        <PrescriptionSection key={report.prescription.id} report={report} />
      ))}
    </>
  );
}

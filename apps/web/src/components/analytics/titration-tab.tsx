"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
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
import type { TimeRange, TrendDirection } from "@/lib/analytics-types";
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

function useTitrationData(): PrescriptionReport[] | undefined {
  return useLiveQuery(async () => {
    const prescriptions = await getPrescriptions();
    const reports: PrescriptionReport[] = [];

    for (const rx of prescriptions) {
      const phases = await getPhasesForPrescription(rx.id);
      const snapshots: PhaseSnapshot[] = [];

      for (const phase of phases) {
        const phaseRange: TimeRange = {
          start: phase.startDate,
          end: phase.endDate ?? Date.now(),
        };

        // Skip phases with zero-length range
        if (phaseRange.end <= phaseRange.start) {
          snapshots.push(emptySnapshot(phase));
          continue;
        }

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
  }, []);
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
  if (direction === "rising") {
    return <TrendingUp className="w-3.5 h-3.5 text-rose-500" />;
  }
  if (direction === "falling") {
    return <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />;
  }
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function AdherenceBadge({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color =
    pct >= 90
      ? "text-emerald-600 dark:text-emerald-400"
      : pct >= 70
        ? "text-amber-600 dark:text-amber-400"
        : "text-rose-600 dark:text-rose-400";
  return <span className={cn("font-mono text-sm font-medium", color)}>{pct}%</span>;
}

function PhaseTypeBadge({ type }: { type: PhaseType }) {
  return (
    <span
      className={cn(
        "text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider",
        type === "maintenance"
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
      )}
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

  if (!snapshot.hasData) {
    return (
      <div className="border rounded-lg p-3 bg-muted/30">
        <div className="flex items-center gap-2 mb-1">
          <PhaseTypeBadge type={phase.type} />
          {isActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          )}
          <span className="text-xs text-muted-foreground">{dateLabel}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          No health data recorded during this phase
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border rounded-lg p-3",
        isActive
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10"
          : "bg-muted/30",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <PhaseTypeBadge type={phase.type} />
        {isActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        )}
        <span className="text-xs text-muted-foreground">{dateLabel}</span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Adherence */}
        {snapshot.adherenceTotal > 0 && (
          <div>
            <span className="text-muted-foreground">Adherence</span>
            <div className="flex items-center gap-1 mt-0.5">
              <AdherenceBadge rate={snapshot.adherenceRate} />
            </div>
          </div>
        )}

        {/* BP */}
        {snapshot.bpAvg.systolic > 0 && (
          <div>
            <span className="text-muted-foreground">Avg BP</span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="font-mono text-sm">
                {Math.round(snapshot.bpAvg.systolic)}/{Math.round(snapshot.bpAvg.diastolic)}
              </span>
              <TrendArrow direction={snapshot.bpTrend.direction} />
            </div>
          </div>
        )}

        {/* Weight */}
        {snapshot.weightAvg > 0 && (
          <div>
            <span className="text-muted-foreground">Avg Weight</span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="font-mono text-sm">
                {snapshot.weightAvg.toFixed(1)} kg
              </span>
              <TrendArrow direction={snapshot.weightTrend.direction} />
            </div>
          </div>
        )}

        {/* Fluid balance */}
        {snapshot.fluidAvgBalance !== 0 && (
          <div>
            <span className="text-muted-foreground">Avg Fluid Balance</span>
            <div className="mt-0.5">
              <span className="font-mono text-sm">
                {Math.round(snapshot.fluidAvgBalance)} ml
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Anomalies */}
      {snapshot.anomalyCount > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <Activity className="w-3 h-3" />
          <span>
            {snapshot.anomalyCount} anomal{snapshot.anomalyCount === 1 ? "y" : "ies"} detected
          </span>
        </div>
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
    <Card className="bg-white/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
      <CardHeader className="pt-3 pb-1 px-3">
        <Button
          variant="ghost"
          className="w-full flex items-center justify-between p-0 h-auto hover:bg-transparent"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <Pill className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              {report.prescription.genericName}
            </CardTitle>
            {!report.prescription.isActive && (
              <span className="text-[10px] text-muted-foreground">(inactive)</span>
            )}
          </div>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </Button>
      </CardHeader>

      {expanded && (
        <CardContent className="px-3 pb-3 space-y-2">
          {report.phases.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No phases configured
            </p>
          ) : (
            report.phases.map((snapshot) => (
              <PhaseSnapshotCard key={snapshot.phase.id} snapshot={snapshot} />
            ))
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

export function TitrationTab({ range }: { range: TimeRange }) {
  const reports = useTitrationData();

  if (!reports) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading titration data...
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Pill className="w-8 h-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          No prescriptions to analyze
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Add prescriptions in the Medications tab to see titration reports
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <PrescriptionSection key={report.prescription.id} report={report} />
      ))}
    </div>
  );
}

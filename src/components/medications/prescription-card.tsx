"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  usePhasesForPrescription,
  useSchedulesForPhase,
} from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";

interface PrescriptionCardProps {
  prescription: Prescription;
  onSelect: (p: Prescription) => void;
}

function formatDosageSummary(
  schedules: { dosage: number; time: string }[],
  unit: string
): string {
  if (schedules.length === 0) return "No schedule";

  const dosages = schedules.map((s) => s.dosage);
  const allSame = dosages.every((d) => d === dosages[0]);

  if (allSame) {
    const freq =
      schedules.length === 1
        ? "once daily"
        : schedules.length === 2
          ? "twice daily"
          : `${schedules.length}x daily`;
    return `${dosages[0]}${unit} ${freq}`;
  }

  // Different dosages: "6.25mg / 3.125mg daily"
  return dosages.map((d) => `${d}${unit}`).join(" / ") + " daily";
}

function formatFoodInstruction(instruction: string): string | null {
  if (instruction === "before") return "Take before eating";
  if (instruction === "after") return "Take after eating";
  return null;
}

export function PrescriptionCard({
  prescription,
  onSelect,
}: PrescriptionCardProps) {
  const phases = usePhasesForPrescription(prescription.id);
  const activePhase = phases.find((p) => p.status === "active");
  const hasPendingPhase = phases.some((p) => p.status === "pending");
  const schedules = useSchedulesForPhase(activePhase?.id);

  const unit = activePhase?.unit ?? "mg";
  const dosageSummary = formatDosageSummary(
    schedules
      .filter((s) => s.enabled)
      .map((s) => ({ dosage: s.dosage, time: s.time })),
    unit
  );

  const timeList = schedules
    .filter((s) => s.enabled)
    .map((s) => s.time)
    .sort()
    .join(", ");

  const foodText = activePhase
    ? formatFoodInstruction(activePhase.foodInstruction)
    : null;

  return (
    <Card
      className="p-3 cursor-pointer hover:bg-muted/40 transition-colors active:scale-[0.98]"
      onClick={() => onSelect(prescription)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold truncate">
            {prescription.genericName}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dosageSummary}
          </p>
          {timeList && (
            <p className="text-xs text-muted-foreground">{timeList}</p>
          )}
          {foodText && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {foodText}
            </p>
          )}
          {prescription.indication && (
            <p className="text-xs text-muted-foreground/50 mt-1">
              {prescription.indication}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {hasPendingPhase && (
            <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-600 text-white">
              Titration planned
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

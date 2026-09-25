"use client";

import { Clock } from "lucide-react";
import {
  useInventoryForPrescription,
  usePhasesForPrescription,
  useSchedulesForPhase,
} from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";
import { DAY_LABELS_LONG } from "@/components/medications/titrations/types";
import { averageDailyDosage } from "@/lib/medication-ui-utils";
import { formatComboDose } from "@intake/core/compound";

export function MaintenanceRow({ prescription }: { prescription: Prescription }) {
  const phases = usePhasesForPrescription(prescription.id);
  const maintenancePhase = phases.find(
    (p) => p.type === "maintenance" && p.status === "active",
  );
  const schedules = useSchedulesForPhase(maintenancePhase?.id);
  const inventoryItems = useInventoryForPrescription(prescription.id);

  if (!maintenancePhase || schedules.length === 0) return null;

  // Weekday-weighted, like the refill estimates: a Mon/Wed/Fri schedule adds
  // 3/7 of its dose to the daily figure, not all of it.
  const everyDay = schedules.every((s) => s.daysOfWeek.length === 7);
  const dailyDose = averageDailyDosage(schedules);
  // Combination drugs are labelled per compound from the active brand's
  // tablets; with no combo brand stocked the summed dose is shown.
  const activeBrand = inventoryItems.find((i) => i.isActive && !i.isArchived);
  const fmtDose = (mg: number, unit: string) => formatComboDose(mg, unit, activeBrand);

  return (
    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{prescription.genericName}</span>
        <span className="text-[10px] text-muted-foreground">
          {everyDay ? "" : "avg "}
          {fmtDose(dailyDose, maintenancePhase.unit)}/day
        </span>
      </div>
      {prescription.indication && (
        <span className="text-[10px] text-muted-foreground">{prescription.indication}</span>
      )}
      <div className="mt-1.5 space-y-0.5">
        {schedules.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{s.time}</span>
            <span className="font-medium text-foreground">
              {fmtDose(s.dosage, maintenancePhase.unit)}
            </span>
            {s.daysOfWeek.length < 7 && (
              <span className="text-[10px]">
                ({s.daysOfWeek.map((d) => DAY_LABELS_LONG[d]).join(", ")})
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

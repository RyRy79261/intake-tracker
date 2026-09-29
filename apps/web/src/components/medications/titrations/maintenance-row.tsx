"use client";

import {
  useInventoryForPrescription,
  usePhasesForPrescription,
  useSchedulesForPhase,
} from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";
import { DAY_LABELS_LONG } from "@/components/medications/titrations/types";
import { sortDaysForDisplay } from "@/lib/date-utils";
import { useSettingsStore } from "@/stores/settings-store";
import { averageDailyDosage } from "@/lib/medication-ui-utils";
import { formatComboDose } from "@intake/core/compound";

export function MaintenanceRow({ prescription }: { prescription: Prescription }) {
  const phases = usePhasesForPrescription(prescription.id);
  const maintenancePhase = phases.find(
    (p) => p.type === "maintenance" && p.status === "active",
  );
  const schedules = useSchedulesForPhase(maintenancePhase?.id);
  const inventoryItems = useInventoryForPrescription(prescription.id);
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);

  if (!maintenancePhase || schedules.length === 0) return null;

  // Weekday-weighted, like the refill estimates: a Mon/Wed/Fri schedule adds
  // 3/7 of its dose to the daily figure, not all of it.
  const everyDay = schedules.every((s) => s.daysOfWeek.length === 7);
  const dailyDose = averageDailyDosage(schedules);
  // Combination drugs are labelled per compound from the active brand's
  // tablets; with no combo brand stocked the summed dose is shown.
  const activeBrand = inventoryItems.find((i) => i.isActive && !i.isArchived);
  const fmtDose = (mg: number, unit: string) => formatComboDose(mg, unit, activeBrand);

  const daysText = (days: number[]) =>
    days.length === 7
      ? "Every day"
      : sortDaysForDisplay(days, weekStartsOn).map((d) => DAY_LABELS_LONG[d]).join(", ");

  return (
    <div className="flex flex-col gap-[3px] border-t border-line py-2 first-of-type:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <b className="font-semibold">{prescription.genericName}</b>
        <span className="whitespace-nowrap font-mono text-[0.8125rem] text-muted-foreground">
          {everyDay ? "" : "avg "}
          {fmtDose(dailyDose, maintenancePhase.unit)}/day
        </span>
      </div>
      {schedules.map((s) => (
        <p key={s.id} className="text-[0.8125rem] text-muted-foreground">
          <span className="font-mono">{s.time}</span>{" "}
          <span className="font-medium text-foreground">{fmtDose(s.dosage, maintenancePhase.unit)}</span>
          {" · "}
          {daysText(s.daysOfWeek)}
        </p>
      ))}
    </div>
  );
}

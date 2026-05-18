"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Plus, X } from "lucide-react";
import { usePhasesForPrescription, useSchedulesForPhase } from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";
import type { RxEntry } from "./types";

export function RxEntryCard({
  entry,
  prescriptions,
  existingRxIds,
  onSelectPrescription,
  onUpdate,
  onRemove,
  onAddSchedule,
  onRemoveSchedule,
  onUpdateSchedule,
}: {
  entry: RxEntry;
  entryIdx: number;
  prescriptions: Prescription[];
  existingRxIds: string[];
  onSelectPrescription: (rxId: string) => void;
  onUpdate: (update: Partial<RxEntry>) => void;
  onRemove: () => void;
  onAddSchedule: () => void;
  onRemoveSchedule: (schedIdx: number) => void;
  onUpdateSchedule: (
    schedIdx: number,
    update: Partial<RxEntry["schedules"][number]>,
  ) => void;
}) {
  const selectedRx = prescriptions.find((p) => p.id === entry.prescriptionId);

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Select
          value={entry.prescriptionId || ""}
          onValueChange={(val) => onSelectPrescription(val)}
        >
          <SelectTrigger className="flex-1 h-9 text-sm">
            <SelectValue placeholder="Select prescription..." />
          </SelectTrigger>
          <SelectContent>
            {prescriptions.map((rx) => (
              <SelectItem
                key={rx.id}
                value={rx.id}
                disabled={existingRxIds.includes(rx.id) && rx.id !== entry.prescriptionId}
              >
                {rx.genericName}
                {rx.indication ? ` (${rx.indication})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onRemove}
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>

      {selectedRx && (
        <PrefillFromMaintenance
          prescriptionId={selectedRx.id}
          onPrefill={(schedules) => onUpdate({ schedules })}
        />
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Titration doses
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 text-teal-600 dark:text-teal-400"
            onClick={onAddSchedule}
          >
            <Plus className="w-3 h-3 mr-0.5" />
            Add time
          </Button>
        </div>

        {entry.schedules.map((sched, schedIdx) => (
          <div
            key={schedIdx}
            className="flex items-center gap-2 bg-muted/30 rounded-lg p-2"
          >
            <Input
              type="time"
              value={sched.time}
              onChange={(e) => onUpdateSchedule(schedIdx, { time: e.target.value })}
              className="w-28 h-8 text-sm"
            />
            <Input
              type="number"
              step="any"
              placeholder="mg"
              value={sched.dosage}
              onChange={(e) =>
                onUpdateSchedule(schedIdx, { dosage: e.target.value })
              }
              className="w-20 h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground">mg</span>
            {entry.schedules.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 ml-auto"
                onClick={() => onRemoveSchedule(schedIdx)}
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PrefillFromMaintenance({
  prescriptionId,
  onPrefill,
}: {
  prescriptionId: string;
  onPrefill: (schedules: RxEntry["schedules"]) => void;
}) {
  const phases = usePhasesForPrescription(prescriptionId);
  const maintenancePhase = phases.find(
    (p) => p.type === "maintenance" && p.status === "active",
  );
  const schedules = useSchedulesForPhase(maintenancePhase?.id);

  if (!maintenancePhase || schedules.length === 0) return null;

  const handlePrefill = () => {
    onPrefill(
      schedules.map((s) => ({
        time: s.time,
        daysOfWeek: s.daysOfWeek,
        dosage: String(s.dosage),
      })),
    );
  };

  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
      <div className="space-y-0.5">
        <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wider">
          Current maintenance
        </span>
        {schedules.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 text-[11px] text-blue-600 dark:text-blue-400"
          >
            <Clock className="w-3 h-3" />
            <span>{s.time}</span>
            <span>{s.dosage}{maintenancePhase.unit}</span>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px] gap-1 shrink-0 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
        onClick={handlePrefill}
      >
        Copy to titration
      </Button>
    </div>
  );
}

export function EditPhaseScheduleLoader({
  phaseId,
  onLoad,
}: {
  phaseId: string;
  entryIdx: number;
  onLoad: (schedules: RxEntry["schedules"]) => void;
}) {
  const schedules = useSchedulesForPhase(phaseId);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (schedules.length === 0 || loaded) return;
    onLoad(
      schedules.map((s) => ({
        time: s.time,
        daysOfWeek: s.daysOfWeek,
        dosage: String(s.dosage),
      })),
    );
    setLoaded(true);
    // onLoad is an inline callback from the parent — including it in deps
    // would re-run on every parent render. We only need to react to data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, loaded]);

  return null;
}

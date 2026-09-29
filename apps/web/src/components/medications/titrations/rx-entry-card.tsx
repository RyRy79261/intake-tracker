"use client";

import { useEffect, useState } from "react";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@intake/ui/select";
import { Plus, Trash2 } from "lucide-react";
import {
  useInventoryForPrescription,
  usePhasesForPrescription,
  useSchedulesForPhase,
} from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";
import type { RxEntry } from "@/components/medications/titrations/types";
import { findActiveBrand } from "@/lib/dose-preview";
import { DoseAmountInput, DosePreviewLine } from "@/components/medications/dose-amount-field";

// Titration phases are always saved in mg (titration-drawer).
const TITRATION_UNIT = "mg";

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
  // The brand each dose is counted against: a combo dose is entered as its
  // tablets, and every dose gets a live "= N tablets of X" readout.
  const activeBrand = findActiveBrand(useInventoryForPrescription(selectedRx?.id));

  return (
    <div className="flex flex-col gap-2 border border-line p-2">
      <div className="flex items-center gap-2">
        <Select
          value={entry.prescriptionId || ""}
          onValueChange={(val) => onSelectPrescription(val)}
        >
          <SelectTrigger className="flex-1">
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
          className="h-10 w-11 shrink-0"
          aria-label="Remove prescription from plan"
          onClick={onRemove}
        >
          <Trash2 className="text-muted-foreground" />
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
          <span className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground">
            TITRATION DOSES
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddSchedule}
          >
            <Plus />
            Add time
          </Button>
        </div>

        {entry.schedules.map((sched, schedIdx) => (
          <div key={schedIdx} className="space-y-1 border border-line bg-panel p-2">
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={sched.time}
                onChange={(e) => onUpdateSchedule(schedIdx, { time: e.target.value })}
                aria-label="Time"
                className="w-28 font-mono"
              />
              <DoseAmountInput
                dosage={sched.dosage}
                onDosageChange={(dosage) => onUpdateSchedule(schedIdx, { dosage })}
                unit={TITRATION_UNIT}
                brand={activeBrand}
                className="w-24 font-mono"
              />
              {entry.schedules.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-10 w-11 shrink-0"
                  aria-label={`Remove ${sched.time}`}
                  onClick={() => onRemoveSchedule(schedIdx)}
                >
                  <Trash2 className="text-muted-foreground" />
                </Button>
              )}
            </div>
            <DosePreviewLine dosage={sched.dosage} unit={TITRATION_UNIT} brand={activeBrand} />
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
    <div className="flex items-center justify-between gap-2 border border-dashed border-line p-2">
      <div className="space-y-0.5">
        <span className="text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground">
          Current maintenance
        </span>
        {schedules.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
            <span className="font-mono">{s.time}</span>
            <span className="font-mono text-foreground">{s.dosage}{maintenancePhase.unit}</span>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
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

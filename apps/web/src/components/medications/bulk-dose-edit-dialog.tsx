"use client";

import { useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@intake/ui/drawer";
import { PillIconWithBadge } from "@/components/medications/pill-icon";
import { useUntakeAllDoses, useEditAllDoseTimes } from "@/hooks/use-medication-queries";
import { useTodayKey } from "@/hooks/use-today-key";
import { hapticTake, hapticSkip, formatDoseAmount, getCurrentTimeHHMM } from "@/lib/medication-ui-utils";
import { toast } from "@intake/ui/use-toast";
import { X, RotateCcw, Clock } from "lucide-react";
import { RetroactiveTimePicker } from "@/components/medications/retroactive-time-picker";
import type { DoseSlot } from "@/hooks/use-medication-queries";

interface BulkDoseEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  time: string;
  slots: DoseSlot[];
  date: string;
}

function formatTime12(time24: string): string {
  const parts = time24.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatLoggedTime(ts: number): string {
  const d = new Date(ts);
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${formatClock(ts)}, ${dateStr}`;
}

/**
 * Each slot is written separately, so a batch can partly fail. Name the
 * failed doses and keep the drawer open so the user can retry.
 */
function reportFailures(verb: string, slots: DoseSlot[], failedScheduleIds: string[]) {
  const names = slots
    .filter((s) => failedScheduleIds.includes(s.scheduleId))
    .map((s) => s.prescription.genericName);
  toast({
    title: `Failed to ${verb} ${failedScheduleIds.length} dose(s)`,
    description: names.join(", "),
    variant: "destructive",
  });
}

export function BulkDoseEditDialog({ open, onOpenChange, time, slots, date }: BulkDoseEditDialogProps) {
  const [editPickerOpen, setEditPickerOpen] = useState(false);

  const untakeAllMut = useUntakeAllDoses();
  const editAllMut = useEditAllDoseTimes<DoseSlot>();
  const todayKey = useTodayKey();

  if (slots.length === 0) return null;

  const takenSlots = slots.filter((s) => s.status === "taken");
  const hasTaken = takenSlots.length > 0;

  // Default the Edit Record picker to the time the batch was logged at.
  const firstLog = takenSlots[0]?.existingLog?.actionTimestamp;
  const batchLoggedTime = firstLog ? formatClock(firstLog) : getCurrentTimeHHMM();

  // There is deliberately no SKIP ALL here: this drawer only opens for a
  // group with nothing left pending, so a bulk skip could only convert
  // already-taken doses. Skip All lives on the group header and acts on
  // pending/missed doses only.

  const handleUntakeAll = async () => {
    hapticSkip();
    try {
      const outcome = await untakeAllMut.mutateAsync(
        takenSlots.map((s) => ({
          prescriptionId: s.prescriptionId,
          phaseId: s.phaseId,
          scheduleId: s.scheduleId,
          date: s.scheduledDate,
          time: s.localTime,
          dosageMg: s.dosageMg,
        })),
      );
      if (outcome.failed.length > 0) {
        reportFailures("reverse", takenSlots, outcome.failed.map((f) => f.entry.scheduleId));
        return;
      }
    } catch {
      toast({ title: "Failed to reverse doses", variant: "destructive" });
      return;
    }
    toast({ title: `All ${formatTime12(time)} doses reversed` });
    onOpenChange(false);
  };

  const handleEditRecordConfirm = async (newTime: string) => {
    hapticTake();
    try {
      const outcome = await editAllMut.mutateAsync({ entries: takenSlots, date, time, newTime });
      if (outcome.failed.length > 0) {
        reportFailures("update", takenSlots, outcome.failed.map((f) => f.entry.scheduleId));
        return;
      }
    } catch {
      toast({ title: "Failed to update dose times", variant: "destructive" });
      return;
    }
    toast({ title: `${formatTime12(time)} dose time updated` });
    onOpenChange(false);
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]" aria-describedby={undefined}>
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="w-8" />
              <DrawerTitle className="text-lg font-bold">{formatTime12(time)}</DrawerTitle>
              <button
                onClick={() => onOpenChange(false)}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dose list */}
            <div className="space-y-3 mb-6 max-h-[50vh] overflow-y-auto">
              {slots.map((slot) => {
                const doseLabel = formatDoseAmount(slot);
                return (
                  <div key={`${slot.scheduleId}-${slot.localTime}`} className="flex items-center gap-3">
                    <PillIconWithBadge
                      shape={slot.inventory?.pillShape || "round"}
                      color={slot.inventory?.pillColor || "#ccc"}
                      size={36}
                      status={slot.status === "missed" ? "pending" : slot.status}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight">
                        {slot.prescription.genericName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{doseLabel}</p>
                      {slot.status === "taken" && slot.existingLog?.actionTimestamp && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                          Taken at {formatLoggedTime(slot.existingLog.actionTimestamp)}
                        </p>
                      )}
                      {slot.status === "skipped" && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {slot.existingLog?.skipReason || "Skipped"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex justify-center gap-6">
              <button
                onClick={handleUntakeAll}
                disabled={!hasTaken}
                className="flex flex-col items-center gap-1.5 disabled:opacity-40"
              >
                <div className="w-12 h-12 rounded-full border-2 border-red-500 dark:border-red-400 bg-red-500 dark:bg-red-500 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-red-500 dark:text-red-400">UN-TAKE</span>
              </button>

              <button
                onClick={() => setEditPickerOpen(true)}
                disabled={!hasTaken}
                className="flex flex-col items-center gap-1.5 disabled:opacity-40"
              >
                <div className="w-12 h-12 rounded-full border-2 border-gray-400 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-gray-400" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">EDIT RECORD</span>
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <RetroactiveTimePicker
        open={editPickerOpen}
        onOpenChange={setEditPickerOpen}
        defaultTime={batchLoggedTime}
        compoundName="all doses"
        onConfirm={handleEditRecordConfirm}
        notAfterNow={date === todayKey}
      />
    </>
  );
}

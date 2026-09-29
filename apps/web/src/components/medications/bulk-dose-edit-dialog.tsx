"use client";

import { useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@intake/ui/drawer";
import { Button } from "@intake/ui/button";
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
        <DrawerContent className="max-h-[85vh] bg-panel" aria-describedby={undefined}>
          <div className="px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <DrawerTitle className="font-mono text-base font-semibold">{formatTime12(time)}</DrawerTitle>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="-mr-2 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Dose list */}
            <div className="mb-3 max-h-[50vh] overflow-y-auto border border-line bg-background">
              {slots.map((slot) => {
                const doseLabel = formatDoseAmount(slot);
                return (
                  <div
                    key={`${slot.scheduleId}-${slot.localTime}`}
                    className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-2.5 border-t border-line/60 p-2.5 first:border-t-0"
                  >
                    <PillIconWithBadge
                      shape={slot.inventory?.pillShape || "round"}
                      color={slot.inventory?.pillColor || "#ccc"}
                      size={34}
                      status={slot.status === "missed" ? "pending" : slot.status}
                    />
                    <div className="min-w-0">
                      <p className="text-[0.9375rem] font-semibold leading-snug">
                        {slot.prescription.genericName}
                      </p>
                      <p className="text-[0.8125rem] leading-snug text-muted-foreground">{doseLabel}</p>
                      {slot.status === "taken" && slot.existingLog?.actionTimestamp && (
                        <p className="mt-0.5 text-[0.8125rem] font-semibold text-meds">
                          Taken at {formatLoggedTime(slot.existingLog.actionTimestamp)}
                        </p>
                      )}
                      {slot.status === "skipped" && (
                        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                          {slot.existingLog?.skipReason || "Skipped"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={handleUntakeAll}
                disabled={!hasTaken}
                className="border-bp text-bp hover:text-bp"
              >
                <RotateCcw aria-hidden="true" />
                <span>UN-TAKE</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => setEditPickerOpen(true)}
                disabled={!hasTaken}
              >
                <Clock aria-hidden="true" />
                <span>EDIT RECORD</span>
              </Button>
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

"use client";

import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@intake/ui/drawer";
import { Button } from "@intake/ui/button";
import { PillIcon } from "@/components/medications/pill-icon";
import { useTakeDose, useUntakeDose, useSkipDose, useRescheduleDose } from "@/hooks/use-medication-queries";
import { hapticTake, hapticSkip, formatDoseAmount } from "@/lib/medication-ui-utils";
import { isCombo, formatComboDose, formatCompoundFull } from "@intake/core/compound";
import { Info, X, RotateCcw, Clock, Calendar, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@intake/ui/use-toast";
import { RetroactiveTimePicker } from "@/components/medications/retroactive-time-picker";
import type { DoseSlot } from "@/hooks/use-medication-queries";

interface DoseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: DoseSlot | null;
  isToday: boolean;
  /** The slot is on a day after today: nothing can be taken or skipped yet. */
  isFuture?: boolean;
}

export function DoseDetailDialog({
  open,
  onOpenChange,
  slot,
  isToday,
  isFuture = false,
}: DoseDetailDialogProps) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [retroactivePickerOpen, setRetroactivePickerOpen] = useState(false);

  const takeMut = useTakeDose();
  const untakeMut = useUntakeDose();
  const skipMut = useSkipDose();
  const rescheduleMut = useRescheduleDose();

  if (!slot) return null;

  const { status, prescription, phase, schedule, inventory } = slot;

  const handleTake = async () => {
    if (isToday) {
      hapticTake();
      await takeMut.mutateAsync({
        prescriptionId: slot.prescriptionId,
        phaseId: slot.phaseId,
        scheduleId: slot.scheduleId,
        date: slot.scheduledDate,
        time: slot.localTime,
        dosageMg: slot.dosageMg,
      });
      onOpenChange(false);
    } else {
      // Past date -- open time picker
      setRetroactivePickerOpen(true);
    }
  };

  const handleRetroactiveTakeConfirm = async (takenAtTime: string) => {
    hapticTake();
    await takeMut.mutateAsync({
      prescriptionId: slot.prescriptionId,
      phaseId: slot.phaseId,
      scheduleId: slot.scheduleId,
      date: slot.scheduledDate,
      time: slot.localTime, // always the scheduled time: it is the slot key
      dosageMg: slot.dosageMg,
      takenAtTime, // the picked time is when it was actually taken
    });
    onOpenChange(false);
  };

  const handleUntake = async () => {
    hapticSkip();
    await untakeMut.mutateAsync({
      prescriptionId: slot.prescriptionId,
      phaseId: slot.phaseId,
      scheduleId: slot.scheduleId,
      date: slot.scheduledDate,
      time: slot.localTime,
      dosageMg: slot.dosageMg,
    });
    toast({ title: `${prescription.genericName} dose reversed` });
    onOpenChange(false);
  };

  const handleSkip = async () => {
    hapticSkip();
    await skipMut.mutateAsync({
      prescriptionId: slot.prescriptionId,
      phaseId: slot.phaseId,
      scheduleId: slot.scheduleId,
      date: slot.scheduledDate,
      time: slot.localTime,
      dosageMg: slot.dosageMg,
    });
    onOpenChange(false);
  };

  const handleReschedule = async () => {
    if (!rescheduleTime) return;
    await rescheduleMut.mutateAsync({
      prescriptionId: slot.prescriptionId,
      phaseId: slot.phaseId,
      scheduleId: slot.scheduleId,
      date: slot.scheduledDate,
      time: slot.localTime,
      newTime: rescheduleTime,
      dosageMg: slot.dosageMg,
    });
    setShowReschedule(false);
    onOpenChange(false);
  };

  const actionTime = slot.existingLog?.actionTimestamp
    ? new Date(slot.existingLog.actionTimestamp).toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      })
    : null;

  const doseAmountLabel = formatDoseAmount(slot);
  // Strength shown next to the brand name in the header — the scheduled dose,
  // per compound for a combination drug as the brand's tablets scaled by the
  // pill count (not the full per-pill content, which would misrepresent
  // fractional doses).
  const headerStrength = formatComboDose(schedule.dosage, phase.unit, inventory);

  const dateLabel = new Date(slot.scheduledDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh] bg-panel" aria-describedby={undefined}>
          <div className="px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
            {/* Header with pill icon */}
            <div className="mb-4 grid grid-cols-[48px_minmax(0,1fr)] items-center gap-3 border-b border-line pb-3">
              <PillIcon shape={inventory?.pillShape || "round"} color={inventory?.pillColor || "#ccc"} size={48} />
              <div className="min-w-0">
                <DrawerTitle className="text-base font-semibold leading-snug">
                  {inventory?.brandName || prescription.genericName} {headerStrength} ({prescription.genericName})
                </DrawerTitle>
                {actionTime && (
                  <p className={cn(
                    "mt-0.5 text-[0.8125rem] font-semibold",
                    status === "taken" && "text-meds",
                    status === "skipped" && "text-muted-foreground",
                  )}>
                    {status === "taken" ? `Taken at ${actionTime}` : `Skipped at ${actionTime}`}
                  </p>
                )}
              </div>
            </div>

            {/* Info section */}
            <div className="mb-4 space-y-2 text-sm text-muted-foreground [&_svg]:shrink-0">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Scheduled for {slot.localTime}, {dateLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4" />
                <span>
                  Take {doseAmountLabel}
                  {phase.foodInstruction !== "none" && ` ${phase.foodInstruction} eating`}
                  {phase.foodNote && ` ${phase.foodNote}`}
                </span>
              </div>
              {isCombo(inventory) && (
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  <span>
                    {inventory!.brandName}: {formatCompoundFull(inventory!.compounds, phase.unit)} per pill
                  </span>
                </div>
              )}
              {status === "taken" && inventory && !isCombo(inventory) && (
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  <span>
                    {inventory.brandName} {inventory.strength}{phase.unit}
                  </span>
                </div>
              )}
              {status === "skipped" && slot.existingLog?.skipReason && (
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  <span>Reason: {slot.existingLog.skipReason}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {!showReschedule && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-2">
                {/* Future days get the same guard as the schedule row: no
                    Take/Skip yet. UNTAKE stays so a dose already logged on a
                    future day can still be reversed. */}
                {!isFuture && status !== "skipped" && (
                  <Button variant="outline" onClick={handleSkip}>
                    <X aria-hidden="true" />
                    <span>SKIP</span>
                  </Button>
                )}

                {status === "taken" ? (
                  <Button variant="outline" onClick={handleUntake} className="border-bp text-bp hover:text-bp">
                    <RotateCcw aria-hidden="true" />
                    <span>UNTAKE</span>
                  </Button>
                ) : !isFuture && (
                  <Button onClick={handleTake}>
                    <Check aria-hidden="true" />
                    <span>TAKE</span>
                  </Button>
                )}

                {isToday && (
                  <Button variant="outline" onClick={() => setShowReschedule(true)}>
                    <Clock aria-hidden="true" />
                    <span>RESCHEDULE</span>
                  </Button>
                )}
              </div>
            )}

            {showReschedule && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Reschedule to:</p>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  aria-label="Reschedule to"
                  className="h-12 w-full rounded-none border border-input bg-background px-3 text-center font-mono text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setShowReschedule(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={!rescheduleTime}
                    onClick={handleReschedule}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <RetroactiveTimePicker
        open={retroactivePickerOpen}
        onOpenChange={setRetroactivePickerOpen}
        defaultTime={slot.localTime}
        compoundName={prescription.genericName}
        onConfirm={handleRetroactiveTakeConfirm}
      />
    </>
  );
}

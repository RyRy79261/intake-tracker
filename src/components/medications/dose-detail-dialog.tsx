"use client";

import { useState } from "react";
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { PillIcon } from "./pill-icon";
import { useTakeDose, useUntakeDose, useSkipDose, useRescheduleDose } from "@/hooks/use-medication-queries";
import { hapticTake, hapticSkip, formatPillCount } from "@/lib/medication-ui-utils";
import { Info, X, RotateCcw, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { RetroactiveTimePicker } from "./retroactive-time-picker";
import type { DoseSlot } from "@/hooks/use-medication-queries";

interface DoseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: DoseSlot | null;
  isToday: boolean;
}

export function DoseDetailDialog({
  open,
  onOpenChange,
  slot,
  isToday,
}: DoseDetailDialogProps) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [retroactivePickerOpen, setRetroactivePickerOpen] = useState(false);

  const takeMut = useTakeDose();
  const untakeMut = useUntakeDose();
  const skipMut = useSkipDose();
  const rescheduleMut = useRescheduleDose();

  if (!slot) return null;

  const { status, prescription, phase, schedule, inventory, pillsPerDose } = slot;

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

  const handleRetroactiveTakeConfirm = async (time: string) => {
    hapticTake();
    await takeMut.mutateAsync({
      prescriptionId: slot.prescriptionId,
      phaseId: slot.phaseId,
      scheduleId: slot.scheduleId,
      date: slot.scheduledDate,
      time,
      dosageMg: slot.dosageMg,
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

  const pillLabel = pillsPerDose != null
    ? formatPillCount(pillsPerDose)
    : "1 tablet";

  const dateLabel = new Date(slot.scheduledDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <div className="p-6">
            {/* Header with pill icon */}
            <div className="flex flex-col items-center text-center mb-6">
              <PillIcon shape={inventory?.pillShape || "round"} color={inventory?.pillColor || "#ccc"} size={48} />
              <h2 className="text-lg font-bold mt-3">
                {inventory?.brandName || prescription.genericName} {schedule.dosage}{phase.unit} ({prescription.genericName})
              </h2>
              {actionTime && (
                <p className={cn(
                  "text-sm font-medium mt-1",
                  status === "taken" && "text-emerald-600 dark:text-emerald-400",
                  status === "skipped" && "text-muted-foreground",
                )}>
                  {status === "taken" ? `Taken at ${actionTime}` : `Skipped at ${actionTime}`}
                </p>
              )}
            </div>

            {/* Info section */}
            <div className="space-y-2 mb-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Scheduled for {slot.localTime}, {dateLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4" />
                <span>
                  {schedule.dosage}{phase.unit}, take {pillLabel}
                  {phase.foodInstruction !== "none" && ` ${phase.foodInstruction} eating`}
                  {phase.foodNote && ` ${phase.foodNote}`}
                </span>
              </div>
              {status === "taken" && inventory && (
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
              <div className="flex justify-center gap-6">
                {status !== "skipped" && (
                  <button onClick={handleSkip} className="flex flex-col items-center gap-1.5">
                    <div className="w-12 h-12 rounded-full border-2 border-teal-600 dark:border-teal-400 flex items-center justify-center">
                      <X className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <span className="text-xs font-medium text-teal-600 dark:text-teal-400">SKIP</span>
                  </button>
                )}

                {status === "taken" ? (
                  <button onClick={handleUntake} className="flex flex-col items-center gap-1.5">
                    <div className="w-12 h-12 rounded-full border-2 border-red-500 dark:border-red-400 bg-red-500 dark:bg-red-500 flex items-center justify-center">
                      <RotateCcw className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs font-medium text-red-500 dark:text-red-400">UNTAKE</span>
                  </button>
                ) : (
                  <button onClick={handleTake} className="flex flex-col items-center gap-1.5">
                    <div className="w-12 h-12 rounded-full border-2 border-teal-600 dark:border-teal-400 bg-teal-600 dark:bg-teal-500 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium text-teal-600 dark:text-teal-400">TAKE</span>
                  </button>
                )}

                {isToday && (
                  <button
                    onClick={() => setShowReschedule(true)}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="w-12 h-12 rounded-full border-2 border-gray-400 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-gray-400" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">RESCHEDULE</span>
                  </button>
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
                  className="w-full px-3 py-2 rounded-lg border bg-background"
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowReschedule(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-teal-600 hover:bg-teal-700"
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

"use client";

import { useState } from "react";
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { PillIcon } from "./pill-icon";
import { useTakeDose, useUntakeDose, useSkipDose, useRescheduleDose } from "@/hooks/use-medication-queries";
import type { DoseLog, Prescription, PhaseSchedule, MedicationPhase, InventoryItem } from "@/lib/db";
import { Info, Trash2, Pencil, X, RotateCcw, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleWithDetails } from "@/lib/medication-schedule-service";

interface DoseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ScheduleWithDetails | null;
  doseLog: DoseLog | undefined;
  date: string;
  onDelete?: () => void;
  onEditSchedule?: (mode: "this" | "all") => void;
}

export function DoseDetailDialog({
  open,
  onOpenChange,
  entry,
  doseLog,
  date,
  onDelete,
  onEditSchedule,
}: DoseDetailDialogProps) {
  const [showEditOptions, setShowEditOptions] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleTime, setRescheduleTime] = useState("");

  const takeMut = useTakeDose();
  const untakeMut = useUntakeDose();
  const skipMut = useSkipDose();
  const rescheduleMut = useRescheduleDose();

  if (!entry) return null;

  const { prescription, phase, schedule, inventory } = entry;

  const status = doseLog?.status ?? "pending";
  const time = schedule.time;

  const handleTake = async () => {
    await takeMut.mutateAsync({
      prescriptionId: prescription.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date,
      time,
      dosageAmount: phase.dosageAmount,
    });
    onOpenChange(false);
  };

  const handleUntake = async () => {
    await untakeMut.mutateAsync({
      prescriptionId: prescription.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date,
      time,
      dosageAmount: phase.dosageAmount,
    });
    onOpenChange(false);
  };

  const handleSkip = async () => {
    await skipMut.mutateAsync({
      prescriptionId: prescription.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date,
      time,
      dosageAmount: phase.dosageAmount,
    });
    onOpenChange(false);
  };

  const handleReschedule = async () => {
    if (!rescheduleTime) return;
    await rescheduleMut.mutateAsync({
      prescriptionId: prescription.id,
      phaseId: phase.id,
      scheduleId: schedule.id,
      date,
      time,
      newTime: rescheduleTime,
      dosageAmount: phase.dosageAmount,
    });
    setShowReschedule(false);
    onOpenChange(false);
  };

  const actionTime = doseLog?.actionTimestamp
    ? new Date(doseLog.actionTimestamp).toLocaleString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="icon" className="text-muted-foreground">
              <Info className="w-4 h-4" />
            </Button>
            <div className="flex gap-2">
              {onDelete && (
                <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={onDelete}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              {onEditSchedule && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  onClick={() => setShowEditOptions(true)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center text-center mb-6">
            <PillIcon shape={inventory?.pillShape || "round"} color={inventory?.pillColor || "#ccc"} size={48} />
            <h2 className="text-lg font-bold mt-3">
              {inventory?.brandName || prescription.genericName} {phase.dosageStrength} ({prescription.genericName})
            </h2>
            {actionTime && (
              <p className={cn(
                "text-sm font-medium mt-1",
                status === "taken" && "text-emerald-600 dark:text-emerald-400",
                status === "skipped" && "text-muted-foreground"
              )}>
                {status === "taken" ? `Taken at ${actionTime}` : `Skipped at ${actionTime}`}
              </p>
            )}
          </div>

          <div className="space-y-2 mb-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Scheduled for {time}, {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
            </div>
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" />
              <span>
                {phase.dosageStrength}, take {phase.dosageAmount} Pill(s)
                {phase.foodInstruction !== "none" && ` ${phase.foodInstruction} eating`}
                {phase.foodNote && ` ${phase.foodNote}`}
              </span>
            </div>
          </div>

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
                  <div className="w-12 h-12 rounded-full border-2 border-teal-600 dark:border-teal-400 bg-teal-600 dark:bg-teal-500 flex items-center justify-center">
                    <RotateCcw className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs font-medium text-teal-600 dark:text-teal-400">UN-TAKE</span>
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

              <button
                onClick={() => setShowReschedule(true)}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="w-12 h-12 rounded-full border-2 border-gray-400 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-gray-400" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">RESCHEDULE</span>
              </button>
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

          {showEditOptions && onEditSchedule && (
            <div className="mt-4 pt-4 border-t space-y-1">
              <p className="text-xs text-muted-foreground mb-2">
                Edit {inventory?.brandName || prescription.genericName} {phase.dosageStrength} ({prescription.genericName})
              </p>
              <Button
                variant="ghost"
                className="w-full justify-start text-sm"
                onClick={() => { onEditSchedule("this"); setShowEditOptions(false); }}
              >
                Only this dose
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-sm"
                onClick={() => { onEditSchedule("all"); setShowEditOptions(false); }}
              >
                All future doses
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

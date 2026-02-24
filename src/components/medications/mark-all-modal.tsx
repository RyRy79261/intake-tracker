"use client";

import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { PillIcon } from "./pill-icon";
import { useTakeAllDoses, useSkipAllDoses, useDoseLogsForDate } from "@/hooks/use-medication-queries";
import type { ScheduleWithDetails } from "@/lib/medication-schedule-service";
import type { DoseLog, DoseStatus } from "@/lib/db";
import { X, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarkAllModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  time: string;
  entries: ScheduleWithDetails[];
  date: string;
}

export function MarkAllModal({ open, onOpenChange, time, entries, date }: MarkAllModalProps) {
  const { data: doseLogs = [] } = useDoseLogsForDate(date);
  const takeAllMut = useTakeAllDoses();
  const skipAllMut = useSkipAllDoses();

  const getDoseStatus = (prescriptionId: string, phaseId: string, schedId: string): DoseLog | undefined => {
    return doseLogs.find(
      (l) => l.prescriptionId === prescriptionId && l.phaseId === phaseId && l.scheduleId === schedId && l.scheduledTime === time
    );
  };

  const handleTakeAll = async () => {
    const pending = entries.filter((e) => {
      const log = getDoseStatus(e.prescription.id, e.phase.id, e.schedule.id);
      return !log || log.status === "pending";
    });
    await takeAllMut.mutateAsync({
      entries: pending.map((e) => ({
        prescriptionId: e.prescription.id,
        phaseId: e.phase.id,
        scheduleId: e.schedule.id,
        dosageAmount: e.phase.dosageAmount,
      })),
      date,
      time,
    });
    onOpenChange(false);
  };

  const handleSkipAll = async () => {
    const pending = entries.filter((e) => {
      const log = getDoseStatus(e.prescription.id, e.phase.id, e.schedule.id);
      return !log || log.status === "pending";
    });
    await skipAllMut.mutateAsync({
      entries: pending.map((e) => ({
        prescriptionId: e.prescription.id,
        phaseId: e.phase.id,
        scheduleId: e.schedule.id,
        dosageAmount: e.phase.dosageAmount,
      })),
      date,
      time,
    });
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">{time}</h2>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto mb-6">
            {entries.map((entry) => {
              const log = getDoseStatus(entry.prescription.id, entry.phase.id, entry.schedule.id);
              const status: DoseStatus = log?.status ?? "pending";
              const med = entry.prescription;
              const phase = entry.phase;
              const inventory = entry.inventory;
              
              const actionTime = log?.actionTimestamp
                ? new Date(log.actionTimestamp).toLocaleString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                  })
                : null;

              return (
                <div
                  key={entry.schedule.id}
                  className="flex items-start gap-3 px-3 py-3 rounded-lg"
                >
                  <PillIcon shape={inventory?.pillShape || "round"} color={inventory?.pillColor || "#ccc"} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">
                      {inventory?.brandName || med.genericName} {phase.dosageStrength} ({med.genericName})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {phase.dosageStrength}, Take {phase.dosageAmount} Pill(s)
                      {phase.foodInstruction !== "none" && ` ${phase.foodInstruction} eating`}
                    </p>
                    {phase.notes && (
                      <p className="text-xs text-muted-foreground">{phase.notes}</p>
                    )}
                    {actionTime && (
                      <p className={cn(
                        "text-xs mt-1",
                        status === "taken" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                      )}>
                        {status === "taken" ? `Taken at ${actionTime}` : status === "skipped" ? `Skipped at ${actionTime}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center gap-6 pb-4">
            <button onClick={handleSkipAll} className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full border-2 border-teal-600 dark:border-teal-400 flex items-center justify-center">
                <X className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <span className="text-xs font-medium text-teal-600 dark:text-teal-400">SKIP ALL</span>
            </button>

            <button onClick={handleTakeAll} className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full border-2 border-teal-600 dark:border-teal-400 bg-teal-600 dark:bg-teal-500 flex items-center justify-center">
                <Check className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-medium text-teal-600 dark:text-teal-400">TAKE ALL</span>
            </button>

            <button className="flex flex-col items-center gap-1.5 opacity-50">
              <div className="w-14 h-14 rounded-full border-2 border-gray-400 flex items-center justify-center">
                <Clock className="w-6 h-6 text-gray-400" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">RESCHEDULE</span>
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PillIconWithBadge } from "./pill-icon";
import { useDoseLogsWithDetailsForDate } from "@/hooks/use-medication-queries";
import type { DoseLog, DoseStatus } from "@/lib/db";
import type { DoseLogWithDetails } from "@/lib/dose-log-service";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function formatActionTime(timestamp: number): string {
  const d = new Date(timestamp);
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const dateStr = isToday
    ? "today"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${time}, ${dateStr}`;
}

function isTimeOverdue(time24: string): boolean {
  const parts = time24.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const now = new Date();
  const schedMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > schedMinutes;
}

interface ScheduleViewProps {
  selectedDate: Date;
  onDoseClick: (entry: DoseLogWithDetails) => void;
  onMarkAll: (time: string, entries: DoseLogWithDetails[]) => void;
  onAddMed: () => void;
}

export function ScheduleView({ selectedDate, onDoseClick, onMarkAll, onAddMed }: ScheduleViewProps) {
  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  const { data: logsWithDetails = [], isLoading } = useDoseLogsWithDetailsForDate(dateStr);

  const timeGroups = useMemo(() => {
    const groups = new Map<string, DoseLogWithDetails[]>();
    
    for (const detail of logsWithDetails) {
      // Determine what time this log should be grouped under.
      // If it was rescheduled, use the rescheduledTo time, otherwise the scheduledTime.
      const time = (detail.log.status === "rescheduled" && detail.log.rescheduledTo)
        ? detail.log.rescheduledTo
        : detail.log.scheduledTime;
        
      const existing = groups.get(time) || [];
      existing.push(detail);
      groups.set(time, existing);
    }

    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
    return sortedGroups.map(([time, entries]) => ({ time, entries }));
  }, [logsWithDetails]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (timeGroups.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium mb-2">No medications scheduled</p>
        <p className="text-sm mb-4">Add a prescription to get started</p>
        <Button onClick={onAddMed} variant="outline" className="gap-2">
          <Plus className="w-4 h-4" />
          Add a prescription
        </Button>
      </div>
    );
  }

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <div className="space-y-6 pb-24">
      {timeGroups.map(({ time, entries }) => {
        // Find if all entries at this time are completed (taken or skipped)
        const allDone = entries.every((e) => e.log.status === "taken" || e.log.status === "skipped");
        const overdue = isToday && isTimeOverdue(time) && !allDone;

        return (
          <div key={time}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={cn(
                "text-xl font-bold",
                overdue ? "text-red-500" : ""
              )}>
                {time}
              </h3>
              {!allDone && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => onMarkAll(time, entries)}
                >
                  Mark All Doses
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {entries.map((entry) => {
                const { log, prescription, phase, schedule, inventory } = entry;
                const status: DoseStatus = log.status;
                const pillsToTake = inventory?.strength ? schedule.dosage / inventory.strength : 1;

                return (
                  <button
                    key={log.id}
                    onClick={() => onDoseClick(entry)}
                    className={cn(
                      "w-full text-left rounded-xl border p-3 transition-colors",
                      "hover:bg-muted/50 active:scale-[0.99]",
                      status === "taken" && "bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
                      status === "skipped" && "bg-gray-50/50 border-gray-200 dark:bg-gray-950/20 dark:border-gray-800 opacity-70",
                      status === "pending" && "bg-card border-border",
                      status === "rescheduled" && "bg-card border-border opacity-50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <PillIconWithBadge
                        shape={inventory?.pillShape || "round"}
                        color={inventory?.pillColor || "#ccc"}
                        size={36}
                        status={status}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight">
                          {inventory?.brandName || prescription.genericName} {schedule.dosage}{phase.unit} ({prescription.genericName})
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Take {pillsToTake} Pill(s)
                          {phase.foodInstruction !== "none" && ` ${phase.foodInstruction} eating`}
                        </p>
                        {phase.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{phase.notes}</p>
                        )}
                        {log.actionTimestamp && status === "taken" && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                            Taken at {formatActionTime(log.actionTimestamp)}
                          </p>
                        )}
                        {log.actionTimestamp && status === "skipped" && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {log.skipReason || "Skipped"} at {formatActionTime(log.actionTimestamp)}
                          </p>
                        )}
                        {status === "rescheduled" && log.rescheduledTo && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                            Rescheduled to {log.rescheduledTo}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <button
        onClick={onAddMed}
        className="fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg flex items-center justify-center transition-colors active:scale-95"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}

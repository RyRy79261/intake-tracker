"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PillIconWithBadge } from "./pill-icon";
import { useDailySchedule, useDoseLogsForDate } from "@/hooks/use-medication-queries";
import type { DoseLog, DoseStatus } from "@/lib/db";
import type { ScheduleWithDetails } from "@/lib/medication-schedule-service";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

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
  return `${time}, ${dateStr}, ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function isTimeOverdue(time24: string): boolean {
  const [h, m] = time24.split(":").map(Number);
  const now = new Date();
  const schedMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > schedMinutes;
}

function getDoseStatus(
  prescriptionId: string,
  phaseId: string,
  scheduleId: string,
  time: string,
  doseLogs: DoseLog[]
): DoseLog | undefined {
  return doseLogs.find(
    (l) =>
      l.prescriptionId === prescriptionId &&
      l.phaseId === phaseId &&
      l.scheduleId === scheduleId &&
      l.scheduledTime === time
  );
}

interface ScheduleViewProps {
  selectedDate: Date;
  onDoseClick: (entry: ScheduleWithDetails, log: DoseLog | undefined) => void;
  onMarkAll: (time: string, entries: ScheduleWithDetails[]) => void;
  onAddMed: () => void;
}

export function ScheduleView({ selectedDate, onDoseClick, onMarkAll, onAddMed }: ScheduleViewProps) {
  const dayOfWeek = selectedDate.getDay();
  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  const { data: scheduleMap, isLoading: schedLoading } = useDailySchedule(dayOfWeek);
  const { data: doseLogs = [], isLoading: logsLoading } = useDoseLogsForDate(dateStr);

  const isLoading = schedLoading || logsLoading;

  const timeGroups = useMemo(() => {
    if (!scheduleMap) return [];
    
    // Create a mutable copy of the schedule map
    const groups = new Map<string, ScheduleWithDetails[]>();
    
    for (const [time, entries] of Array.from(scheduleMap.entries())) {
      groups.set(time, [...entries]);
    }

    // Process dose logs for rescheduled doses
    for (const log of doseLogs) {
      if (log.status === "rescheduled" && log.rescheduledTo) {
        // Remove from original time
        const originalEntries = groups.get(log.scheduledTime);
        if (originalEntries) {
          const filtered = originalEntries.filter(e => 
            !(e.prescription.id === log.prescriptionId && 
              e.phase.id === log.phaseId && 
              e.schedule.id === log.scheduleId)
          );
          if (filtered.length > 0) {
            groups.set(log.scheduledTime, filtered);
          } else {
            groups.delete(log.scheduledTime);
          }
          
          // Find the entry to move
          const entryToMove = originalEntries.find(e => 
            e.prescription.id === log.prescriptionId && 
            e.phase.id === log.phaseId && 
            e.schedule.id === log.scheduleId
          );
          
          // Add to new time
          if (entryToMove) {
            const newTimeEntries = groups.get(log.rescheduledTo) || [];
            // Only add if not already there (prevent duplicates if multiple logs somehow)
            if (!newTimeEntries.some(e => e.schedule.id === entryToMove.schedule.id)) {
              newTimeEntries.push(entryToMove);
            }
            groups.set(log.rescheduledTo, newTimeEntries);
          }
        }
      }
    }

    // Sort by time
    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
    return sortedGroups.map(([time, entries]) => ({ time, entries }));
  }, [scheduleMap, doseLogs]);

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
        <p className="text-sm mb-4">Add a medication to get started</p>
        <Button onClick={onAddMed} variant="outline" className="gap-2">
          <Plus className="w-4 h-4" />
          Add a med
        </Button>
      </div>
    );
  }

  const isToday =
    selectedDate.toDateString() === new Date().toDateString();

  return (
    <div className="space-y-6 pb-24">
      {timeGroups.map(({ time, entries }) => {
        const allDone = entries.every((e) => {
          const log = getDoseStatus(e.prescription.id, e.phase.id, e.schedule.id, time, doseLogs);
          return log?.status === "taken" || log?.status === "skipped";
        });
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
                const log = getDoseStatus(entry.prescription.id, entry.phase.id, entry.schedule.id, time, doseLogs);
                const status: DoseStatus = log?.status ?? "pending";
                const med = entry.prescription;
                const phase = entry.phase;
                const inventory = entry.inventory;

                return (
                  <button
                    key={`${entry.schedule.id}-${time}`}
                    onClick={() => onDoseClick(entry, log)}
                    className={cn(
                      "w-full text-left rounded-xl border p-3 transition-colors",
                      "hover:bg-muted/50 active:scale-[0.99]",
                      status === "taken" && "bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
                      status === "skipped" && "bg-gray-50/50 border-gray-200 dark:bg-gray-950/20 dark:border-gray-800 opacity-70",
                      status === "pending" && "bg-card border-border"
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
                          {inventory?.brandName || med.genericName} {phase.dosageStrength} ({med.genericName})
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {phase.dosageStrength}, Take {phase.dosageAmount} Pill(s)
                          {phase.foodInstruction !== "none" && ` ${phase.foodInstruction} eating`}
                        </p>
                        {phase.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{phase.notes}</p>
                        )}
                        {log?.actionTimestamp && status === "taken" && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                            Taken at {formatActionTime(log.actionTimestamp)}
                          </p>
                        )}
                        {log?.actionTimestamp && status === "skipped" && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {log.skipReason || "Skipped"} at {formatActionTime(log.actionTimestamp)}
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

"use client";

import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AddMedicationFormState,
  ScheduleEntry,
} from "@/hooks/use-add-medication-form";
import { type FieldChange, ALL_DAYS, DAY_LABELS_SHORT } from "@/components/medications/add-medication-steps/types";
import { weekDayOrder } from "@/lib/date-utils";
import { useSettingsStore } from "@/stores/settings-store";

export function ScheduleStep({
  formState, onFieldChange,
}: {
  formState: AddMedicationFormState;
  onFieldChange: FieldChange;
}) {
  const { schedules } = formState;
  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const setSchedules = (next: ScheduleEntry[]) => onFieldChange("schedules", next);

  const updateSchedule = (index: number, updates: Partial<ScheduleEntry>) => {
    const next = [...schedules];
    const existing = next[index];
    if (existing) {
      next[index] = { ...existing, ...updates };
      setSchedules(next);
    }
  };

  const addScheduleEntry = () => {
    setSchedules([...schedules, { time: "20:30", daysOfWeek: [...ALL_DAYS] }]);
  };

  const removeSchedule = (index: number) => {
    if (schedules.length <= 1) return;
    setSchedules(schedules.filter((_, i) => i !== index));
  };

  const toggleDay = (schedIndex: number, day: number) => {
    const sched = schedules[schedIndex];
    if (!sched) return;
    const days = sched.daysOfWeek.includes(day)
      ? sched.daysOfWeek.filter((d) => d !== day)
      : [...sched.daysOfWeek, day].sort();
    updateSchedule(schedIndex, { daysOfWeek: days });
  };

  return (
    <div className="flex flex-col gap-1.5">
      {schedules.map((sched, i) => (
        <div key={i} className="flex flex-col gap-2 border border-line bg-background p-2">
          <div className="flex items-end gap-1.5">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[0.8125rem] text-muted-foreground">Time</span>
              <Input
                type="time"
                value={sched.time}
                onChange={(e) => updateSchedule(i, { time: e.target.value })}
                className="font-mono"
              />
            </label>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-11 shrink-0"
              onClick={() => removeSchedule(i)}
              disabled={schedules.length <= 1}
              aria-label={`Remove ${sched.time}`}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-[3px]" role="group" aria-label="Days">
            {weekDayOrder(weekStartsOn).map((dayIndex) => (
              <button
                key={dayIndex}
                type="button"
                aria-pressed={sched.daysOfWeek.includes(dayIndex)}
                onClick={() => toggleDay(i, dayIndex)}
                className={cn(
                  "min-h-11 border text-xs font-medium",
                  sched.daysOfWeek.includes(dayIndex)
                    ? "border-foreground bg-foreground text-background"
                    : "border-line text-muted-foreground hover:bg-foreground/6",
                )}
              >
                {DAY_LABELS_SHORT[dayIndex]}
              </button>
            ))}
          </div>
        </div>
      ))}

      <Button variant="outline" onClick={addScheduleEntry} className="mt-1 w-full">
        <Plus />
        Add time
      </Button>
    </div>
  );
}

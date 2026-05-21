"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AddMedicationFormState,
  ScheduleEntry,
} from "@/hooks/use-add-medication-form";
import { type FieldChange, ALL_DAYS, DAY_LABELS_SHORT } from "@/components/medications/add-medication-steps/types";

export function ScheduleStep({
  formState, onFieldChange,
}: {
  formState: AddMedicationFormState;
  onFieldChange: FieldChange;
}) {
  const { schedules } = formState;
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
    setSchedules([...schedules, { time: "20:30", daysOfWeek: [...ALL_DAYS], dosage: 1 }]);
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
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">When should this medication be taken?</p>

      {schedules.map((sched, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type="time"
            value={sched.time}
            onChange={(e) => updateSchedule(i, { time: e.target.value })}
            className="w-28 shrink-0"
          />
          <div className="flex gap-0.5 flex-1">
            {DAY_LABELS_SHORT.map((label, dayIndex) => (
              <button
                key={dayIndex}
                onClick={() => toggleDay(i, dayIndex)}
                className={cn(
                  "flex-1 py-1 rounded text-[10px] font-medium transition-colors",
                  sched.daysOfWeek.includes(dayIndex)
                    ? "bg-teal-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {schedules.length > 1 && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeSchedule(i)}>
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addScheduleEntry} className="w-full gap-1.5">
        <Plus className="w-3.5 h-3.5" />
        Add time
      </Button>
    </div>
  );
}

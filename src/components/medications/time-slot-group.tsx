"use client";

import { Button } from "@/components/ui/button";
import { DoseRow } from "./dose-row";
import { cn } from "@/lib/utils";
import type { DoseSlot } from "@/hooks/use-medication-queries";

interface TimeSlotGroupProps {
  time: string;
  slots: DoseSlot[];
  isToday: boolean;
  isFuture: boolean;
  isNextUpcoming: boolean;
  onTake: (slot: DoseSlot) => void;
  onRetroactiveTake: (slot: DoseSlot, time: string) => void;
  onSkip: (slot: DoseSlot) => void;
  onDoseClick: (slot: DoseSlot) => void;
  onMarkAll: (time: string, slots: DoseSlot[]) => void;
}

function formatTime12(time24: string): string {
  const parts = time24.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function isTimeOverdue(time24: string): boolean {
  const parts = time24.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() > h * 60 + m;
}

export function TimeSlotGroup({
  time,
  slots,
  isToday,
  isFuture,
  isNextUpcoming,
  onTake,
  onRetroactiveTake,
  onSkip,
  onDoseClick,
  onMarkAll,
}: TimeSlotGroupProps) {
  const hasPending = slots.some((s) => s.status === "pending" || s.status === "missed");
  const allDone = slots.every((s) => s.status === "taken" || s.status === "skipped");
  const overdue = isToday && isTimeOverdue(time) && hasPending;

  return (
    <div
      id={`time-slot-${time}`}
      className={cn(
        "rounded-xl",
        isNextUpcoming && "border-l-[3px] border-l-teal-500 bg-teal-50/30 dark:bg-teal-950/10 pl-3",
        !isNextUpcoming && allDone && "opacity-80",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <h3
          className={cn(
            "text-lg font-bold",
            overdue ? "text-red-500" : "text-foreground"
          )}
        >
          {formatTime12(time)}
        </h3>
        {!isFuture && hasPending && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-7"
            onClick={() => onMarkAll(time, slots.filter((s) => s.status === "pending" || s.status === "missed"))}
          >
            Mark All
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {slots.map((slot) => (
          <DoseRow
            key={`${slot.scheduleId}-${slot.localTime}`}
            slot={slot}
            isToday={isToday}
            isFuture={isFuture}
            onTake={onTake}
            onRetroactiveTake={onRetroactiveTake}
            onSkip={onSkip}
            onDoseClick={onDoseClick}
          />
        ))}
      </div>
    </div>
  );
}

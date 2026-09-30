"use client";

import { Button } from "@intake/ui/button";
import { DoseRow } from "@/components/medications/dose-row";
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
  onSkipAll: (time: string, slots: DoseSlot[]) => void;
  onEditAll: (time: string, slots: DoseSlot[]) => void;
  onEditTime: (slot: DoseSlot, time: string) => void;
}

function formatTime12(time24: string): string {
  const parts = time24.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * The prototype's `.btn.sm`: 32px outlined, compact type. An invisible
 * ::before reaches 6px above and below so the tap target is 44px (the
 * header is 44px tall); not sideways, so Skip All and Mark All never overlap.
 */
const slotButton =
  "relative h-8 px-2.5 text-[0.8125rem] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']";

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
  onSkipAll,
  onEditAll,
  onEditTime,
}: TimeSlotGroupProps) {
  // Bulk Take/Skip only ever act on the slots still waiting for a decision;
  // already-logged doses are changed one at a time or via Edit All.
  const openSlots = slots.filter((s) => s.status === "pending" || s.status === "missed");
  const hasPending = openSlots.length > 0;
  const hasTaken = slots.some((s) => s.status === "taken");
  const allDone = slots.every((s) => s.status === "taken" || s.status === "skipped");
  const overdue = isToday && isTimeOverdue(time) && hasPending;

  return (
    <div
      id={`time-slot-${time}`}
      data-next={isNextUpcoming || undefined}
      className={cn(
        "border border-line bg-panel",
        isNextUpcoming && "shadow-[inset_3px_0_0_hsl(var(--meds))]",
        !isNextUpcoming && allDone && "opacity-85",
      )}
    >
      <div className="flex min-h-11 items-center gap-2 border-b border-line bg-chrome px-2.5">
        <h3
          className={cn(
            "font-mono text-base font-semibold",
            overdue ? "text-bp" : "text-foreground"
          )}
        >
          {formatTime12(time)}
        </h3>
        {!isFuture && hasPending && (
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className={slotButton}
              onClick={() => onSkipAll(time, openSlots)}
            >
              Skip All
            </Button>
            <Button
              size="sm"
              className={slotButton}
              onClick={() => onMarkAll(time, openSlots)}
            >
              Mark All
            </Button>
          </div>
        )}
        {!isFuture && !hasPending && hasTaken && (
          <Button
            variant="outline"
            size="sm"
            className={cn(slotButton, "ml-auto")}
            onClick={() => onEditAll(time, slots)}
          >
            Edit All
          </Button>
        )}
      </div>

      <div>
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
            onEditTime={onEditTime}
          />
        ))}
      </div>
    </div>
  );
}

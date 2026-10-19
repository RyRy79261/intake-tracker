"use client";

import { Button } from "@intake/ui/button";
import { DoseRow } from "@/components/medications/dose-row";
import { cn } from "@/lib/utils";
import { formatDoseTime } from "@/lib/medication-ui-utils";
import type { DoseSlot } from "@/hooks/use-medication-queries";

interface TimeSlotGroupProps {
  time: string;
  slots: DoseSlot[];
  isFuture: boolean;
  /** The current time: the header is primary within 60 minutes of the slot. */
  now: number;
  /** Today only: the slot is due within the hour (shown on the header). */
  isToday: boolean;
  onOpenDose: (slot: DoseSlot) => void;
  onTake: (slot: DoseSlot) => void;
  onTakeLongPress: (slot: DoseSlot) => void;
  onMarkAll: (time: string) => void;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The prototype's `.btn.sm`: 32px outlined, compact type. An invisible
 * ::before reaches 6px above and below so the tap target is 44px.
 */
const slotButton =
  "relative h-8 px-2.5 text-[0.8125rem] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']";

/**
 * One card per dose time. The header shows the time (primary when it is
 * within an hour of now, the missed colour when a dose in it is missed) and,
 * for two or more doses, "Mark all doses" (not on a future day: its only
 * bulk action is Reschedule, which is not built yet). A slot with one dose
 * has no header button: its row does the work.
 */
export function TimeSlotGroup({
  time,
  slots,
  isFuture,
  isToday,
  now,
  onOpenDose,
  onTake,
  onTakeLongPress,
  onMarkAll,
}: TimeSlotGroupProps) {
  const dueAt = Math.min(...slots.map((s) => s.dueAt));
  const near = isToday && Math.abs(now - dueAt) <= HOUR_MS;
  const missed = slots.some((s) => s.status === "missed");
  const allDone = slots.every((s) => s.status === "taken" || s.status === "skipped");

  return (
    <div
      id={`time-slot-${time}`}
      data-testid="time-slot"
      data-time={time}
      data-near={near || undefined}
      className={cn(
        "scroll-mt-14 border border-line bg-panel",
        near && "shadow-[inset_3px_0_0_hsl(var(--meds))]",
        !near && allDone && "opacity-85",
      )}
    >
      <div className="flex min-h-11 items-center gap-2 border-b border-line bg-chrome px-2.5">
        <h3
          data-testid="slot-time"
          className={cn(
            "font-mono text-base font-semibold",
            missed ? "text-sodium" : near ? "text-meds" : "text-foreground",
          )}
        >
          {formatDoseTime(time)}
        </h3>
        {/* A future day has no bulk action until Reschedule ships (PR 2). */}
        {slots.length >= 2 && !isFuture && (
          <Button
            variant="outline"
            size="sm"
            className={cn(slotButton, "ml-auto")}
            onClick={() => onMarkAll(time)}
          >
            Mark all doses
          </Button>
        )}
      </div>

      <div>
        {slots.map((slot) => (
          <DoseRow
            key={slot.scheduleId}
            slot={slot}
            isFuture={isFuture}
            onOpen={onOpenDose}
            onTake={onTake}
            onTakeLongPress={onTakeLongPress}
          />
        ))}
      </div>
    </div>
  );
}

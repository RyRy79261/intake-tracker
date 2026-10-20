"use client";

import { useEffect, useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@intake/ui/drawer";
import { Button } from "@intake/ui/button";
import { cn } from "@/lib/utils";
import { toLocalDateKey } from "@/lib/date-utils";
import { useNow } from "@/hooks/use-now";
import { pickedInstant } from "@/components/medications/taken-time-sheet";
import {
  doseDisplayName,
  formatDoseDate,
  formatDoseInstant,
} from "@/lib/medication-ui-utils";
import {
  getRescheduleWarnings,
  type DoseRescheduleWarning,
  type DoseSlot,
} from "@/hooks/use-medication-queries";

const MINUTE_MS = 60_000;

/** The quick picks: minutes to add. */
const QUICK_PICKS = [
  { label: "+15 min", minutes: 15 },
  { label: "+30 min", minutes: 30 },
  { label: "+1 hour", minutes: 60 },
  { label: "+2 hours", minutes: 120 },
] as const;

interface RescheduleSheetProps {
  open: boolean;
  /** The doses to move (open doses only). */
  slots: DoseSlot[];
  /**
   * A dose of a day after today: the quick picks and the default count from
   * the scheduled time, not from now.
   */
  future: boolean;
  /** Closing without a choice (Cancel, Esc, a tap outside) writes nothing. */
  onCancel: () => void;
  onConfirm: (remindAt: number) => void;
}

function hhmm(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The start value: the current reminder time while it is ahead, else 30 minutes on. */
export function defaultRescheduleAt(slots: readonly DoseSlot[], future: boolean, now: number): number {
  const ahead = slots.map((s) => s.remindAt).filter((r): r is number => r !== undefined && r > now);
  if (ahead.length > 0) return Math.min(...ahead);
  return quickPickBase(slots, future, now) + 30 * MINUTE_MS;
}

/** What a quick pick adds to: now, or on a future day the scheduled time. */
function quickPickBase(slots: readonly DoseSlot[], future: boolean, now: number): number {
  if (!future || slots.length === 0) return now;
  return Math.min(...slots.map((s) => s.scheduledAt));
}

/** The text of one warning, with the medicine's name. */
export function rescheduleWarningText(
  warning: DoseRescheduleWarning,
  slots: readonly DoseSlot[],
): string {
  if (warning.kind === "past") return "This time has passed. The reminder fires at once.";
  const slot = slots.find((s) => s.prescriptionId === warning.prescriptionId);
  const name = slot ? doseDisplayName(slot) : "medicine";
  return `This is after your next ${name} dose at ${formatDoseInstant(warning.nextDoseAt)}.`;
}

/**
 * "Reschedule for": move the dose (or every open dose of a slot) to a new
 * date and time. Quick picks add 15 minutes to 2 hours; "Today" and
 * "Tomorrow" set the day; the pickers allow any date and time. There is no
 * limit. A time that has passed, or one after the next dose of the same
 * medicine, shows a warning, but Reschedule is always allowed.
 */
export function RescheduleSheet({ open, slots, future, onCancel, onConfirm }: RescheduleSheetProps) {
  const now = useNow();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  const [warnings, setWarnings] = useState<DoseRescheduleWarning[]>([]);

  // Reset on each open, so a value picked for another dose never carries over.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const start = defaultRescheduleAt(slots, future, Date.now());
      setDate(toLocalDateKey(start));
      setTime(hhmm(start));
      setWarnings([]);
    }
  }

  const at = pickedInstant(date, time);

  // The same warning function as the save, so the user sees it first.
  useEffect(() => {
    if (!open || at === null) return;
    let live = true;
    getRescheduleWarnings(slots.map(keyOf), at, Date.now())
      .then((w) => live && setWarnings(w))
      .catch(() => live && setWarnings([]));
    return () => {
      live = false;
    };
  }, [open, at, slots, now]);

  const setInstant = (instant: number) => {
    setDate(toLocalDateKey(instant));
    setTime(hhmm(instant));
  };
  const today = toLocalDateKey(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = toLocalDateKey(tomorrowDate);
  const base = quickPickBase(slots, future, now);

  const chip =
    "h-10 rounded-none border border-input bg-background px-2 font-mono text-[0.8125rem] text-foreground hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    // A drawer, not a dialog: it opens over the dose dialog and the "Mark all
    // doses" modal, which are drawers too, so their focus traps stack.
    <Drawer open={open} onOpenChange={(next) => !next && onCancel()}>
      <DrawerContent
        data-domain="meds"
        data-testid="reschedule-sheet"
        className="bg-panel md:mx-auto md:w-full md:max-w-lg"
        aria-describedby={undefined}
      >
        <div className="grid gap-3 px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
          <DrawerTitle className="text-base font-semibold">Reschedule for</DrawerTitle>

          <div className="grid grid-cols-4 gap-2">
            {QUICK_PICKS.map((pick) => (
              <button
                key={pick.label}
                type="button"
                className={chip}
                onClick={() => setInstant(base + pick.minutes * MINUTE_MS)}
              >
                {pick.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[0.8125rem] text-muted-foreground">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Reschedule date"
                className="h-12 w-full rounded-none border border-input bg-background px-2 font-mono text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <label className="grid gap-1 text-[0.8125rem] text-muted-foreground">
              Time
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-label="Reschedule time"
                className="h-12 w-full rounded-none border border-input bg-background px-2 text-center font-mono text-xl text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={date === today}
              className={cn(chip, date === today && "border-meds text-meds")}
              onClick={() => setDate(today)}
            >
              Today
            </button>
            <button
              type="button"
              aria-pressed={date === tomorrow}
              className={cn(chip, date === tomorrow && "border-meds text-meds")}
              onClick={() => setDate(tomorrow)}
            >
              Tomorrow
            </button>
          </div>

          {at === null ? (
            <p className="text-[0.8125rem] text-bp">Enter a date and a time.</p>
          ) : (
            // The resolved instant: a time that does not exist (DST) shows shifted.
            <p className="text-[0.8125rem] text-muted-foreground" data-testid="reschedule-resolved">
              Reminder at <span className="font-mono text-foreground">{formatDoseInstant(at)}</span>,{" "}
              {formatDoseDate(toLocalDateKey(at))}
            </p>
          )}
          {at !== null &&
            warnings.map((w) => (
              <p key={`${w.kind}-${w.prescriptionId}`} role="status" className="text-[0.8125rem] text-sodium">
                {rescheduleWarningText(w, slots)}
              </p>
            ))}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button disabled={at === null} onClick={() => at !== null && onConfirm(at)}>
              Reschedule
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function keyOf(slot: DoseSlot) {
  return {
    prescriptionId: slot.prescriptionId,
    phaseId: slot.phaseId,
    scheduleId: slot.scheduleId,
    date: slot.scheduledDate,
    time: slot.localTime,
    dosageMg: slot.dosageMg,
  };
}

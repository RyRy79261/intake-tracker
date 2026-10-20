"use client";

import { useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@intake/ui/drawer";
import { Button } from "@intake/ui/button";
import { formatDoseInstant } from "@/lib/medication-ui-utils";
import { toLocalDateKey } from "@/lib/date-utils";
import { useNow } from "@/hooks/use-now";

/** What the user picked in "When did you take your meds?". */
export type TakenTimeChoice =
  | { kind: "now" }
  | { kind: "at"; at: number }
  | { kind: "skip" };

interface TakenTimeSheetProps {
  open: boolean;
  /** Closing without a choice (Cancel, Esc, a tap outside) writes nothing. */
  onCancel: () => void;
  onChoose: (choice: TakenTimeChoice) => void;
  /** "When did you take your meds?" or "When did you take Brand?". */
  title: string;
  /** The default for "Take at a specific time": when the dose was due. */
  dueAt: number;
  /** Change time of a taken dose: no Skip, and Save keeps the dose taken. */
  retime?: boolean;
  /** The picker's starting value, when not the due time (Change time: the taken time). */
  initialAt?: number;
}

function hhmm(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The instant a picked date and wall time stand for, on the device's clock.
 * A time that does not exist (the DST spring-forward hour) resolves forward,
 * as `Date` does. Null for an incomplete value.
 */
export function pickedInstant(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const at = new Date(`${date}T${time}:00`).getTime();
  return Number.isFinite(at) ? at : null;
}

/**
 * "When did you take your meds?": Take now, Take at a specific time (a date
 * and a time, no limit: a time after now only warns) or Skip. Opens when a
 * dose is taken after its late window, and on a long press of Take.
 */
export function TakenTimeSheet({
  open,
  onCancel,
  onChoose,
  title,
  dueAt,
  retime = false,
  initialAt,
}: TakenTimeSheetProps) {
  const now = useNow();
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [wasOpen, setWasOpen] = useState(false);

  // Reset on each open, so a value picked for another dose never carries over.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const start = initialAt ?? dueAt;
      setPicking(false);
      setDate(toLocalDateKey(start));
      setTime(hhmm(start));
    }
  }

  const at = pickedInstant(date, time);
  const inFuture = at !== null && at > now + 60_000;

  return (
    // A drawer, not a dialog: it opens over the dose dialog and the "Mark all
    // doses" modal, which are drawers too, so their focus traps stack.
    <Drawer open={open} onOpenChange={(next) => !next && onCancel()}>
      <DrawerContent data-domain="meds" className="bg-panel md:mx-auto md:w-full md:max-w-lg" aria-describedby={undefined}>
        <div className="grid gap-3 px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
          <DrawerTitle className="text-base font-semibold">{title}</DrawerTitle>

          {!picking ? (
            <div className="grid gap-2">
              <Button onClick={() => onChoose({ kind: "now" })}>
                Take now ({formatDoseInstant(now)})
              </Button>
              <Button variant="outline" onClick={() => setPicking(true)}>
                Take at a specific time
              </Button>
              {!retime && (
                <Button variant="outline" onClick={() => onChoose({ kind: "skip" })}>
                  Skip
                </Button>
              )}
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-[0.8125rem] text-muted-foreground">
                  Date
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="Date taken"
                    className="h-12 w-full rounded-none border border-input bg-background px-2 font-mono text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                </label>
                <label className="grid gap-1 text-[0.8125rem] text-muted-foreground">
                  Time
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    aria-label="Time taken"
                    className="h-12 w-full rounded-none border border-input bg-background px-2 text-center font-mono text-xl text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                </label>
              </div>
              {at === null && <p className="text-[0.8125rem] text-bp">Enter a date and a time.</p>}
              {inFuture && (
                <p className="text-[0.8125rem] text-sodium" role="status">
                  This time is in the future.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setPicking(false)}>
                  Back
                </Button>
                <Button disabled={at === null} onClick={() => at !== null && onChoose({ kind: "at", at })}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

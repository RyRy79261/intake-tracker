"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@intake/ui/dialog";
import { bottomSheetClass } from "@/components/medications/sheet-classes";
import { Button } from "@intake/ui/button";
import { useState } from "react";
import { useNowTick } from "@intake/ui/use-now-tick";
import { getCurrentTimeHHMM } from "@/lib/medication-ui-utils";

interface RetroactiveTimePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTime: string;
  compoundName: string;
  onConfirm: (time: string) => void;
  /**
   * The dose being logged is on today's date, so a time later than the
   * current clock would record a dose in the future. Past-date pickers leave
   * this off: any time of that day is valid.
   */
  notAfterNow?: boolean;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function RetroactiveTimePicker({
  open,
  onOpenChange,
  defaultTime,
  compoundName,
  onConfirm,
  notAfterNow = false,
}: RetroactiveTimePickerProps) {
  const [selectedTime, setSelectedTime] = useState(defaultTime);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset the input to the default only on the closed -> open transition, so
  // a stale value from a previous dose never carries over, but a parent
  // re-render with a fresh "now" default never clobbers what the user typed.
  // Radix only fires onOpenChange for its own events, not for controlled
  // `open` prop changes, so the reset keys off `open` directly.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelectedTime(defaultTime);
  }

  // Keep the "not after now" ceiling current while the dialog stays open.
  useNowTick(30_000);
  const maxTime = notAfterNow ? getCurrentTimeHHMM() : undefined;
  const isWellFormed = HHMM.test(selectedTime);
  const isValid = isWellFormed && (maxTime === undefined || selectedTime <= maxTime);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={bottomSheetClass} aria-describedby={undefined}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-base font-semibold">
            When did you take {compoundName}?
          </DialogTitle>
        </DialogHeader>

        <div>
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            max={maxTime}
            aria-label="Time taken"
            aria-invalid={!isValid}
            className="h-12 w-full rounded-none border border-input bg-background px-3 text-center font-mono text-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {!isValid && (
            <p className="mt-2 text-[0.8125rem] text-bp">
              {isWellFormed ? "That time hasn't happened yet" : "Enter a time"}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={!isValid}
            onClick={() => {
              if (!isValid) return;
              onConfirm(selectedTime);
              onOpenChange(false);
            }}
          >
            Log Dose
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

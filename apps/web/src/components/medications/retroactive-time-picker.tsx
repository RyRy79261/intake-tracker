"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@intake/ui/dialog";
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
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-center">
            When did you take {compoundName}?
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            max={maxTime}
            aria-invalid={!isValid}
            className="w-full px-3 py-2 rounded-lg border bg-background text-center text-lg"
          />
          {!isValid && (
            <p className="mt-2 text-center text-xs text-destructive">
              {isWellFormed ? "That time hasn't happened yet" : "Enter a time"}
            </p>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
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
            className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
          >
            Log Dose
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

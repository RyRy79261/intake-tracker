"use client";

import { useId } from "react";
import { Input } from "@intake/ui/input";
import { Label } from "@intake/ui/label";
import { addDaysToKey } from "@intake/core/schedule-window";
import { formatDoseDate } from "@/lib/medication-ui-utils";
import type { ScheduleChangeOutcome } from "@/hooks/use-medication-queries";

/**
 * Whether an "Apply from" date can be saved: today or later. A past date
 * would rewrite logged history, so it is not offered.
 */
export function isApplyFromValid(value: string, todayKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= todayKey;
}

/** "today", "tomorrow" or "Sunday, Oct 25". */
export function formatChangeDay(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "today";
  if (dateKey === addDaysToKey(todayKey, 1)) return "tomorrow";
  return formatDoseDate(dateKey);
}

/** The toast text after an "Apply from" save. */
export function describeScheduleChange(outcome: ScheduleChangeOutcome, todayKey: string): string {
  if (outcome.deferredTo) {
    const day = formatChangeDay(outcome.deferredTo, todayKey);
    return outcome.applyFrom === todayKey && outcome.deferredTo === addDaysToKey(todayKey, 1)
      ? "Today's dose is already logged. The change starts tomorrow."
      : `A dose is already logged. The change starts ${day}.`;
  }
  if (outcome.applyFrom === todayKey) return "The change starts today.";
  return `The change starts ${formatChangeDay(outcome.applyFrom, todayKey)}. Days before it keep their schedule.`;
}

/** The "Apply from" date of a schedule edit (Medisafe "edit the med"). */
export function ApplyFromField({
  value,
  onChange,
  todayKey,
}: {
  value: string;
  onChange: (value: string) => void;
  todayKey: string;
}) {
  const id = useId();
  const valid = isApplyFromValid(value, todayKey);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[0.8125rem] font-normal text-muted-foreground">
        Apply from
      </Label>
      <Input
        id={id}
        type="date"
        value={value}
        min={todayKey}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 font-mono"
        aria-invalid={!valid}
      />
      {valid ? (
        <p className="text-[0.8125rem] text-muted-foreground">
          Days before {formatChangeDay(value, todayKey)} keep the old schedule.
        </p>
      ) : (
        <p role="alert" className="text-[0.8125rem] text-bp">
          Pick today or a later date.
        </p>
      )}
    </div>
  );
}

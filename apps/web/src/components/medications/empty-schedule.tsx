"use client";

import { Pill, Plus } from "lucide-react";
import { Button } from "@intake/ui/button";

interface EmptyScheduleProps {
  onAddMed?: () => void;
  /** Today: "No meds today!"; another day: "No meds on this day". */
  isToday?: boolean;
}

export function EmptySchedule({ onAddMed, isToday = true }: EmptyScheduleProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-7 text-center">
      <Pill className="h-12 w-12 opacity-50" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-lg font-semibold">{isToday ? "No meds today!" : "No meds on this day"}</p>
      {onAddMed && (
        <Button className="mt-2" onClick={onAddMed}>
          <Plus aria-hidden="true" />
          Add a prescription
        </Button>
      )}
    </div>
  );
}

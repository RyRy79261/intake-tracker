"use client";

import { Pill, Plus } from "lucide-react";
import { Button } from "@intake/ui/button";

interface EmptyScheduleProps {
  onAddMed?: () => void;
}

export function EmptySchedule({ onAddMed }: EmptyScheduleProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-7 text-center">
      <Pill className="h-12 w-12 opacity-50" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-lg font-semibold">No medications scheduled for today</p>
      {onAddMed && (
        <Button className="mt-2" onClick={onAddMed}>
          <Plus aria-hidden="true" />
          Add a prescription
        </Button>
      )}
    </div>
  );
}

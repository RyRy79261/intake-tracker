"use client";

import { Cat } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyScheduleProps {
  onAddMed?: () => void;
}

export function EmptySchedule({ onAddMed }: EmptyScheduleProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <Cat className="w-16 h-16 text-muted-foreground/40 mb-4" />
      <p className="text-muted-foreground text-sm">
        No medications scheduled for today
      </p>
      {onAddMed && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onAddMed}
        >
          Add a prescription
        </Button>
      )}
    </div>
  );
}

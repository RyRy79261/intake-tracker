"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useSchedulesForPhase,
  useActivatePhase,
  useDeletePhase,
} from "@/hooks/use-medication-queries";
import type { MedicationPhase } from "@/lib/db";

interface TitrationPhaseCardProps {
  phase: MedicationPhase;
  isOnly: boolean;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-500 hover:bg-green-600 text-white" },
  pending: { label: "Pending", className: "bg-gray-400 hover:bg-gray-500 text-white" },
  completed: { label: "Completed", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", className: "bg-red-400 hover:bg-red-500 text-white" },
};

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  maintenance: { label: "Maintenance", className: "bg-blue-500 hover:bg-blue-600 text-white" },
  titration: { label: "Titration", className: "bg-amber-500 hover:bg-amber-600 text-white" },
};

function formatFoodInstruction(instruction: string): string | null {
  if (instruction === "before") return "Take before eating";
  if (instruction === "after") return "Take after eating";
  return null;
}

export function TitrationPhaseCard({ phase, isOnly }: TitrationPhaseCardProps) {
  const schedules = useSchedulesForPhase(phase.id);
  const activatePhase = useActivatePhase();
  const deletePhase = useDeletePhase();

  const isDimmed = phase.status === "completed" || phase.status === "cancelled";
  const typeStyle = TYPE_STYLES[phase.type] ?? { label: "Maintenance", className: "bg-blue-500 hover:bg-blue-600 text-white" };
  const statusStyle = STATUS_STYLES[phase.status] ?? { label: "Pending", className: "bg-gray-400 hover:bg-gray-500 text-white" };

  const enabledSchedules = schedules.filter((s) => s.enabled).sort((a, b) => a.time.localeCompare(b.time));

  const scheduleText = enabledSchedules.length > 0
    ? enabledSchedules.map((s) => `${s.time} - ${s.dosage}${phase.unit}`).join(", ")
    : "No schedules";

  const foodText = formatFoodInstruction(phase.foodInstruction);

  const handleActivate = () => {
    if (window.confirm("This will deactivate the current phase. Continue?")) {
      activatePhase.mutate(phase.id);
    }
  };

  const handleDelete = () => {
    if (window.confirm("Delete this pending phase?")) {
      deletePhase.mutate(phase.id);
    }
  };

  return (
    <Card className={`p-3 ${isDimmed ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <Badge className={`text-[10px] px-1.5 py-0 ${typeStyle.className}`}>
          {typeStyle.label}
        </Badge>
        <Badge className={`text-[10px] px-1.5 py-0 ${statusStyle.className}`}>
          {statusStyle.label}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">{scheduleText}</p>
      {foodText && (
        <p className="text-xs text-muted-foreground/70 mt-0.5">{foodText}</p>
      )}

      {phase.status === "pending" && (
        <div className="flex gap-2 mt-2">
          {!isOnly && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={handleActivate}
              disabled={activatePhase.isPending}
            >
              Activate
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={deletePhase.isPending}
          >
            Delete
          </Button>
        </div>
      )}
    </Card>
  );
}

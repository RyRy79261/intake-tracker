"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PillIcon } from "./pill-icon";
import { useMedications } from "@/hooks/use-medication-queries";
import type { Medication } from "@/lib/db";
import { Loader2, Plus, Pill } from "lucide-react";
import { cn } from "@/lib/utils";

interface MedicationsListProps {
  onAddMed: () => void;
  onEditMed: (medication: Medication) => void;
}

export function MedicationsList({ onAddMed, onEditMed }: MedicationsListProps) {
  const { data: medications = [], isLoading } = useMedications();

  const { active, inactive } = useMemo(() => {
    const active: Medication[] = [];
    const inactive: Medication[] = [];
    for (const med of medications) {
      if (med.isActive) active.push(med);
      else inactive.push(med);
    }
    return { active, inactive };
  }, [medications]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (medications.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Pill className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">No medications</p>
        <p className="text-sm mb-4">Add your first medication to start tracking</p>
        <Button onClick={onAddMed} className="gap-2 bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4" />
          Add a med
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {active.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Active meds
          </h3>
          <div className="space-y-1">
            {active.map((med) => (
              <MedicationRow key={med.id} medication={med} onClick={() => onEditMed(med)} />
            ))}
          </div>
        </div>
      )}

      {inactive.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Inactive meds
          </h3>
          <div className="space-y-1">
            {inactive.map((med) => (
              <MedicationRow key={med.id} medication={med} onClick={() => onEditMed(med)} />
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={onAddMed}
        className="w-full gap-2 bg-teal-600 hover:bg-teal-700 text-white"
        size="lg"
      >
        Add a med
      </Button>
    </div>
  );
}

function MedicationRow({ medication: med, onClick }: { medication: Medication; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors active:scale-[0.99]"
    >
      <PillIcon shape={med.pillShape} color={med.pillColor} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="font-semibold text-sm truncate">
            {med.brandName} {med.dosageStrength} ({med.genericName})
          </p>
          <span className="text-xs text-muted-foreground shrink-0">{med.dosageStrength}</span>
        </div>
        <p className={cn(
          "text-xs mt-0.5",
          med.currentStock === 0 ? "text-red-500 font-medium" : "text-muted-foreground"
        )}>
          {med.currentStock} Pill(s) left
        </p>
      </div>
    </button>
  );
}

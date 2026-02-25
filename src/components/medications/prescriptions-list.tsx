"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { usePrescriptions } from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";
import { Loader2, Plus, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrescriptionsListProps {
  onAddCompound: () => void;
  onEditCompound: (prescription: Prescription) => void;
}

export function PrescriptionsList({ onAddCompound, onEditCompound }: PrescriptionsListProps) {
  const { data: prescriptions = [], isLoading } = usePrescriptions();

  const { active, inactive } = useMemo(() => {
    const active: Prescription[] = [];
    const inactive: Prescription[] = [];
    for (const med of prescriptions) {
      if (med.isActive) active.push(med);
      else inactive.push(med);
    }
    return { active, inactive };
  }, [prescriptions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (prescriptions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FlaskConical className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">No prescriptions</p>
        <p className="text-sm mb-4">Add your first prescription to start tracking</p>
        <Button onClick={onAddCompound} className="gap-2 bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4" />
          Add a prescription
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {active.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Active Prescriptions
          </h3>
          <div className="space-y-1">
            {active.map((med) => (
              <PrescriptionRow key={med.id} prescription={med} onClick={() => onEditCompound(med)} />
            ))}
          </div>
        </div>
      )}

      {inactive.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Inactive Prescriptions
          </h3>
          <div className="space-y-1">
            {inactive.map((med) => (
              <PrescriptionRow key={med.id} prescription={med} onClick={() => onEditCompound(med)} />
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={onAddCompound}
        className="w-full gap-2 bg-teal-600 hover:bg-teal-700 text-white"
        size="lg"
      >
        Add a prescription
      </Button>
    </div>
  );
}

function PrescriptionRow({ prescription: med, onClick }: { prescription: Prescription; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors active:scale-[0.99]"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">
        <FlaskConical className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="font-semibold text-sm truncate">
            {med.genericName}
          </p>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {med.indication || "No indication"}
        </p>
      </div>
    </button>
  );
}

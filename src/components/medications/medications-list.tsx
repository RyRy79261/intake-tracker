"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PillIcon } from "./pill-icon";
import { usePrescriptions, useInventoryForPrescription } from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";
import { Loader2, Plus, Pill } from "lucide-react";
import { cn } from "@/lib/utils";

interface MedicationsListProps {
  onAddMed: () => void;
  onEditMed: (prescription: Prescription) => void;
}

export function MedicationsList({ onAddMed, onEditMed }: MedicationsListProps) {
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
              <PrescriptionRow key={med.id} prescription={med} onClick={() => onEditMed(med)} />
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
              <PrescriptionRow key={med.id} prescription={med} onClick={() => onEditMed(med)} />
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

function PrescriptionRow({ prescription: med, onClick }: { prescription: Prescription; onClick: () => void }) {
  const { data: inventoryList = [] } = useInventoryForPrescription(med.id);
  const activeInventory = inventoryList.find((i) => i.isActive) || inventoryList[0];

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors active:scale-[0.99]"
    >
      <PillIcon shape={activeInventory?.pillShape || "round"} color={activeInventory?.pillColor || "#ccc"} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="font-semibold text-sm truncate">
            {activeInventory?.brandName || med.genericName}
          </p>
          <span className="text-xs text-muted-foreground shrink-0">{med.genericName}</span>
        </div>
        <p className={cn(
          "text-xs mt-0.5",
          (activeInventory?.currentStock || 0) === 0 ? "text-red-500 font-medium" : "text-muted-foreground"
        )}>
          {activeInventory?.currentStock || 0} Pill(s) left
        </p>
      </div>
    </button>
  );
}

"use client";

import { Cat, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrescriptionCard } from "@/components/medications/prescription-card";
import { usePrescriptions } from "@/hooks/use-medication-queries";

interface PrescriptionsViewProps {
  onAddMed: () => void;
}

export function PrescriptionsView({ onAddMed }: PrescriptionsViewProps) {
  const prescriptions = usePrescriptions();

  const active = prescriptions
    .filter((p) => p.isActive)
    .sort((a, b) => a.genericName.localeCompare(b.genericName));

  if (active.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <Cat className="w-16 h-16 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground text-sm mb-4">
          No prescriptions yet
        </p>
        <Button variant="outline" size="sm" onClick={onAddMed}>
          Add your first prescription
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-24 px-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {active.map((prescription) => (
          <PrescriptionCard key={prescription.id} prescription={prescription} />
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={onAddMed} className="w-full">
        <Plus className="w-4 h-4 mr-2" /> Add prescription
      </Button>
    </div>
  );
}

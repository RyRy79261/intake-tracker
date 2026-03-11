"use client";

import { Cat, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MedicationCard } from "@/components/medications/compound-card";
import { usePrescriptions, useAllInventoryItems } from "@/hooks/use-medication-queries";

interface CompoundListProps {
  onAddMed: () => void;
}

export function CompoundList({ onAddMed }: CompoundListProps) {
  const prescriptions = usePrescriptions();
  const inventoryItems = useAllInventoryItems();

  // Build prescription lookup
  const prescriptionMap = new Map(
    prescriptions.map((p) => [p.id, p])
  );

  // Sort by brand name, filter out archived
  const sorted = [...inventoryItems]
    .filter((i) => !i.isArchived)
    .sort((a, b) => a.brandName.localeCompare(b.brandName));

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <Cat className="w-16 h-16 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground text-sm mb-4">
          No medications yet
        </p>
        <Button variant="outline" size="sm" onClick={onAddMed}>
          Add your first medication
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-24 px-4">
      {sorted.map((item) => (
        <MedicationCard
          key={item.id}
          item={item}
          prescription={prescriptionMap.get(item.prescriptionId)}
        />
      ))}

      <Button variant="outline" size="sm" onClick={onAddMed} className="w-full">
        <Plus className="w-4 h-4 mr-2" /> Add another medication
      </Button>
    </div>
  );
}

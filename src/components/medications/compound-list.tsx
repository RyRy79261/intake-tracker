"use client";

import { Cat, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompoundCard } from "@/components/medications/compound-card";
import { usePrescriptions } from "@/hooks/use-medication-queries";

interface CompoundListProps {
  onAddMed: () => void;
}

export function CompoundList({ onAddMed }: CompoundListProps) {
  const prescriptions = usePrescriptions();

  // Sort alphabetically by genericName
  const sorted = [...prescriptions].sort((a, b) =>
    a.genericName.localeCompare(b.genericName)
  );

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
    <div className="space-y-3 pb-24 px-4 pt-4">
      {sorted.map((prescription) => (
        <CompoundCard key={prescription.id} prescription={prescription} />
      ))}

      <Button variant="outline" size="sm" onClick={onAddMed} className="w-full">
        <Plus className="w-4 h-4 mr-2" /> Add another medication
      </Button>

      {/* FAB button */}
      <button
        onClick={onAddMed}
        className="fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg flex items-center justify-center transition-colors active:scale-95"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Cat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrescriptionCard } from "@/components/medications/prescription-card";
import { PrescriptionDetailDrawer } from "@/components/medications/prescription-detail-drawer";
import { usePrescriptions } from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";

interface PrescriptionsViewProps {
  onAddMed: () => void;
}

export function PrescriptionsView({ onAddMed }: PrescriptionsViewProps) {
  const prescriptions = usePrescriptions();
  const [selectedPrescription, setSelectedPrescription] =
    useState<Prescription | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Filter active only, sort alphabetically
  const active = prescriptions
    .filter((p) => p.isActive)
    .sort((a, b) => a.genericName.localeCompare(b.genericName));

  const handleSelect = (p: Prescription) => {
    setSelectedPrescription(p);
    setDetailOpen(true);
  };

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
    <div className="space-y-3 pb-24 px-4 pt-4">
      {active.map((prescription) => (
        <PrescriptionCard
          key={prescription.id}
          prescription={prescription}
          onSelect={handleSelect}
        />
      ))}

      <PrescriptionDetailDrawer
        prescription={selectedPrescription}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

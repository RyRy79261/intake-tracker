"use client";

import { useState } from "react";
import { Pill, Plus } from "lucide-react";
import { Button } from "@intake/ui/button";
import { PrescriptionCard } from "@/components/medications/prescription-card";
import { CollapseHead, addFullClass } from "@/components/medications/ward-bits";
import { usePrescriptions } from "@/hooks/use-medication-queries";
import { rxSpanPlan } from "@/lib/rx-span-plan";
import { cn } from "@/lib/utils";
import type { Prescription } from "@/lib/db";

interface PrescriptionsViewProps {
  onAddMed: () => void;
}

/**
 * The Rx tab: a 2-column grid of compact, equal-height prescription cards.
 * Tapping a card expands it in place; the expanded card spans both columns,
 * and so does a card its expansion leaves alone on a row (`rxSpanPlan`).
 */
export function PrescriptionsView({ onAddMed }: PrescriptionsViewProps) {
  const prescriptions = usePrescriptions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inactiveOpen, setInactiveOpen] = useState(false);

  const byName = (a: { genericName: string }, b: { genericName: string }) =>
    a.genericName.localeCompare(b.genericName);
  const active = prescriptions.filter((p) => p.isActive).sort(byName);
  // Deactivated prescriptions stay reachable so they can be reactivated,
  // edited or deleted (the card's drawer holds the Active toggle).
  const inactive = prescriptions.filter((p) => !p.isActive).sort(byName);

  if (active.length === 0 && inactive.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-3 py-7 text-center">
        <Pill className="h-12 w-12 opacity-50" strokeWidth={1.5} aria-hidden="true" />
        <p className="text-lg font-semibold">No prescriptions yet</p>
        <Button className="mt-2" onClick={onAddMed}>
          <Plus aria-hidden="true" />
          Add your first prescription
        </Button>
      </div>
    );
  }

  const grid = (list: Prescription[]) => {
    const plan = rxSpanPlan(list.map((p) => p.id), expandedId);
    return (
      <div className="grid grid-cols-2 items-stretch gap-2" data-testid="rx-grid">
        {list.map((prescription, i) => {
          const isExpanded = expandedId === prescription.id;
          return (
            <PrescriptionCard
              key={prescription.id}
              prescription={prescription}
              expanded={isExpanded}
              onToggleExpanded={() => setExpandedId(isExpanded ? null : prescription.id)}
              className={cn(plan[i] && "col-span-2")}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="pb-6">
      {active.length > 0 ? (
        grid(active)
      ) : (
        <p className="text-[0.8125rem] text-muted-foreground">No active prescriptions.</p>
      )}

      {inactive.length > 0 && (
        <section>
          <CollapseHead open={inactiveOpen} onToggle={() => setInactiveOpen(!inactiveOpen)}>
            INACTIVE ({inactive.length})
          </CollapseHead>
          {inactiveOpen && grid(inactive)}
        </section>
      )}

      <Button variant="outline" onClick={onAddMed} className={addFullClass}>
        <Plus aria-hidden="true" /> Add prescription
      </Button>
    </div>
  );
}

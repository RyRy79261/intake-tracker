"use client";

import { useState, useMemo } from "react";
import { Cat, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrescriptionCard } from "@/components/medications/prescription-card";
import { usePrescriptions } from "@/hooks/use-medication-queries";

interface PrescriptionsViewProps {
  onAddMed: () => void;
}

export function PrescriptionsView({ onAddMed }: PrescriptionsViewProps) {
  const prescriptions = usePrescriptions();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const active = prescriptions
    .filter((p) => p.isActive)
    .sort((a, b) => a.genericName.localeCompare(b.genericName));

  // Compute which cards should span full width:
  // - Expanded cards always span 2 cols
  // - A card left alone on its row (because its neighbor expanded) also spans 2
  // - Odd last item stays at 1 col (it's naturally alone)
  const spanMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (expandedId === null) return map;

    const expandedIdx = active.findIndex((p) => p.id === expandedId);
    if (expandedIdx === -1) return map;

    // The expanded card spans full width
    map.set(expandedId, true);

    // Walk through items computing grid positions
    // Each full-width card takes a whole row, half-width takes half
    let col = 0;
    for (let i = 0; i < active.length; i++) {
      const id = active[i]!.id;
      const isExpanded = id === expandedId;
      const isLast = i === active.length - 1;

      if (isExpanded) {
        // If we're at col 1 (right half), the item at col 0 is alone
        // That previous item should span full width too (unless it's the last)
        if (col === 1) {
          const prevId = active[i - 1]?.id;
          if (prevId && !map.has(prevId)) {
            map.set(prevId, true);
          }
        }
        col = 0; // expanded takes full row, next starts at col 0
      } else {
        // Check if this half-width item will be alone on its row
        // because the next item is expanded (will start a new row)
        if (col === 0) {
          const nextItem = active[i + 1];
          const nextIsExpanded = nextItem?.id === expandedId;
          if (nextIsExpanded && !isLast) {
            map.set(id, true);
            // stays at col 0 for next
          } else {
            col = 1;
          }
        } else {
          col = 0;
        }
      }
    }

    return map;
  }, [active, expandedId]);

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
        {active.map((prescription) => {
          const isExpanded = expandedId === prescription.id;
          const spanFull = isExpanded || spanMap.has(prescription.id);
          return (
            <PrescriptionCard
              key={prescription.id}
              prescription={prescription}
              expanded={isExpanded}
              onToggleExpanded={() => setExpandedId(isExpanded ? null : prescription.id)}
              className={spanFull ? "col-span-2" : ""}
            />
          );
        })}
      </div>

      <Button variant="outline" size="sm" onClick={onAddMed} className="w-full">
        <Plus className="w-4 h-4 mr-2" /> Add prescription
      </Button>
    </div>
  );
}

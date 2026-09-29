"use client";

import { useState, type ReactNode } from "react";
import { Pill, Plus } from "lucide-react";
import { Button } from "@intake/ui/button";
import { MedicationCard } from "@/components/medications/compound-card";
import { CollapseHead, SecHead, addFullClass } from "@/components/medications/ward-bits";
import { InteractionSearch } from "@/components/medications/interaction-search";
import { useAuthGate } from "@/components/auth-guard";
import { usePrescriptions, useAllInventoryItems } from "@/hooks/use-medication-queries";
import type { InventoryItem, Prescription } from "@/lib/db";
import { isLive } from "@intake/core/lifecycle";

interface CompoundListProps {
  onAddMed: () => void;
}

export function CompoundList({ onAddMed }: CompoundListProps) {
  const prescriptions = usePrescriptions();
  const inventoryItems = useAllInventoryItems();
  const showAi = useAuthGate();
  const [outOfStockOpen, setOutOfStockOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const prescriptionMap = new Map(
    prescriptions.map((p) => [p.id, p])
  );

  const liveItems = inventoryItems.filter(isLive);
  const nonArchived = liveItems.filter((i) => !i.isArchived);
  // Archived brands stay reachable so they can be unarchived or deleted.
  const archived = liveItems
    .filter((i) => i.isArchived)
    .sort((a, b) => a.brandName.localeCompare(b.brandName));

  if (nonArchived.length === 0 && archived.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-3 py-7 text-center">
        <Pill className="h-12 w-12 opacity-50" strokeWidth={1.5} aria-hidden="true" />
        <p className="text-lg font-semibold">No medications yet</p>
        <Button className="mt-2" onClick={onAddMed}>
          <Plus aria-hidden="true" />
          Add your first medication
        </Button>
      </div>
    );
  }

  // Split into categories
  const active: InventoryItem[] = [];
  const inactive: InventoryItem[] = [];
  const outOfStock: InventoryItem[] = [];

  for (const item of nonArchived) {
    const stock = item.currentStock ?? 0;
    // A brand of a deactivated prescription is not in active use.
    const rxActive = prescriptionMap.get(item.prescriptionId)?.isActive !== false;
    if (stock <= 0) {
      outOfStock.push(item);
    } else if (item.isActive && rxActive) {
      active.push(item);
    } else {
      inactive.push(item);
    }
  }

  // Active: alphabetical by brand name
  active.sort((a, b) => a.brandName.localeCompare(b.brandName));

  // Inactive: group by prescription compound name, alphabetical within
  const inactiveByCompound = groupByPrescription(inactive, prescriptionMap);

  // Out of stock: alphabetical
  outOfStock.sort((a, b) => a.brandName.localeCompare(b.brandName));

  const card = (item: InventoryItem) => (
    <MedicationCard
      key={item.id}
      item={item}
      prescription={prescriptionMap.get(item.prescriptionId)}
    />
  );

  return (
    <div className="pb-6">
      {showAi && <InteractionSearch />}

      {/* Active medications — always expanded */}
      {active.length > 0 && (
        <section>
          <SecHead>Active</SecHead>
          {active.map(card)}
        </section>
      )}

      {/* Other medications — grouped by compound */}
      {inactiveByCompound.length > 0 && (
        <section>
          <SecHead>Other</SecHead>
          {inactiveByCompound.map(({ compoundName, items }) => (
            <CompoundGroup key={compoundName} compoundName={compoundName} items={items} card={card} />
          ))}
        </section>
      )}

      {/* Out of stock — collapsible */}
      {outOfStock.length > 0 && (
        <section>
          <CollapseHead open={outOfStockOpen} onToggle={() => setOutOfStockOpen(!outOfStockOpen)}>
            OUT OF STOCK ({outOfStock.length})
          </CollapseHead>
          {outOfStockOpen && outOfStock.map(card)}
        </section>
      )}

      {/* Archived — collapsible */}
      {archived.length > 0 && (
        <section>
          <CollapseHead open={archivedOpen} onToggle={() => setArchivedOpen(!archivedOpen)}>
            ARCHIVED ({archived.length})
          </CollapseHead>
          {archivedOpen && archived.map(card)}
        </section>
      )}

      <Button variant="outline" onClick={onAddMed} className={addFullClass}>
        <Plus aria-hidden="true" /> Add another medication
      </Button>
    </div>
  );
}

// Group inactive items by prescription compound name
function groupByPrescription(
  items: InventoryItem[],
  prescriptionMap: Map<string, Prescription>,
): { compoundName: string; items: InventoryItem[] }[] {
  const groups = new Map<string, InventoryItem[]>();

  for (const item of items) {
    const rx = prescriptionMap.get(item.prescriptionId);
    const name = rx?.genericName ?? "Unknown";
    const existing = groups.get(name);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(name, [item]);
    }
  }

  // Sort groups alphabetically, items within each group alphabetically
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([compoundName, groupItems]) => ({
      compoundName,
      items: groupItems.sort((a, b) => a.brandName.localeCompare(b.brandName)),
    }));
}

function CompoundGroup({
  compoundName,
  items,
  card,
}: {
  compoundName: string;
  items: InventoryItem[];
  card: (item: InventoryItem) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <CollapseHead sub open={open} onToggle={() => setOpen(!open)}>
        {compoundName} · {items.length} {items.length === 1 ? "medication" : "medications"}
      </CollapseHead>
      {open && items.map(card)}
    </div>
  );
}

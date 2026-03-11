"use client";

import { useState } from "react";
import { Cat, ChevronDown, Plus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { MedicationCard } from "@/components/medications/compound-card";
import { usePrescriptions, useAllInventoryItems } from "@/hooks/use-medication-queries";
import type { InventoryItem, Prescription } from "@/lib/db";

interface CompoundListProps {
  onAddMed: () => void;
}

export function CompoundList({ onAddMed }: CompoundListProps) {
  const prescriptions = usePrescriptions();
  const inventoryItems = useAllInventoryItems();
  const [outOfStockOpen, setOutOfStockOpen] = useState(false);

  const prescriptionMap = new Map(
    prescriptions.map((p) => [p.id, p])
  );

  const nonArchived = inventoryItems.filter((i) => !i.isArchived);

  if (nonArchived.length === 0) {
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

  // Split into categories
  const active: InventoryItem[] = [];
  const inactive: InventoryItem[] = [];
  const outOfStock: InventoryItem[] = [];

  for (const item of nonArchived) {
    const stock = item.currentStock ?? 0;
    if (stock <= 0) {
      outOfStock.push(item);
    } else if (item.isActive) {
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

  return (
    <div className="space-y-4 pb-24 px-4">
      {/* Active medications — always expanded */}
      {active.length > 0 && (
        <section>
          <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 ml-1">
            Active
          </h3>
          <div className="space-y-2">
            {active.map((item) => (
              <MedicationCard
                key={item.id}
                item={item}
                prescription={prescriptionMap.get(item.prescriptionId)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Other medications — grouped by compound */}
      {inactiveByCompound.length > 0 && (
        <section>
          <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 ml-1">
            Other
          </h3>
          <div className="space-y-2">
            {inactiveByCompound.map(({ compoundName, items }) => (
              <CompoundGroup
                key={compoundName}
                compoundName={compoundName}
                items={items}
                prescriptionMap={prescriptionMap}
              />
            ))}
          </div>
        </section>
      )}

      {/* Out of stock — collapsible */}
      {outOfStock.length > 0 && (
        <section>
          <Button
            variant="ghost"
            className="flex items-center gap-1.5 w-full justify-start h-auto px-1 py-0 mb-2"
            onClick={() => setOutOfStockOpen(!outOfStockOpen)}
          >
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Out of stock ({outOfStock.length})
            </span>
            <motion.div
              animate={{ rotate: outOfStockOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </motion.div>
          </Button>
          <AnimatePresence>
            {outOfStockOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden space-y-2"
              >
                {outOfStock.map((item) => (
                  <MedicationCard
                    key={item.id}
                    item={item}
                    prescription={prescriptionMap.get(item.prescriptionId)}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      <Button variant="outline" size="sm" onClick={onAddMed} className="w-full">
        <Plus className="w-4 h-4 mr-2" /> Add another medication
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
  prescriptionMap,
}: {
  compoundName: string;
  items: InventoryItem[];
  prescriptionMap: Map<string, Prescription>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <Button
        variant="ghost"
        className="flex items-center gap-2 w-full justify-start h-auto p-2 rounded-lg"
        onClick={() => setOpen(!open)}
      >
        <div className="flex-1 min-w-0 text-left">
          <span className="text-xs font-medium">{compoundName}</span>
          <span className="text-[10px] text-muted-foreground ml-2">
            {items.length} {items.length === 1 ? "medication" : "medications"}
          </span>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden space-y-2 mt-1"
          >
            {items.map((item) => (
              <MedicationCard
                key={item.id}
                item={item}
                prescription={prescriptionMap.get(item.prescriptionId)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

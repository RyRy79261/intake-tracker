"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PillIcon } from "./pill-icon";
import { useAllInventoryItems, usePrescriptions } from "@/hooks/use-medication-queries";
import type { InventoryItem, Prescription } from "@/lib/db";
import { Loader2, Plus, Pill, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MedicationsListProps {
  onAddMed: () => void;
  onEditMed: (prescription: Prescription) => void;
}

export function MedicationsList({ onAddMed, onEditMed }: MedicationsListProps) {
  const { data: inventoryItems = [], isLoading: invLoading } = useAllInventoryItems();
  const { data: prescriptions = [], isLoading: pLoading } = usePrescriptions();
  const [showArchived, setShowArchived] = useState(false);

  const isLoading = invLoading || pLoading;

  const { active, inStock, outOfStock, archived } = useMemo(() => {
    const active: InventoryItem[] = [];
    const inStock: InventoryItem[] = [];
    const outOfStock: InventoryItem[] = [];
    const archived: InventoryItem[] = [];

    for (const item of inventoryItems) {
      if (item.isArchived) {
        archived.push(item);
      } else if (item.isActive) {
        active.push(item);
      } else if ((item.currentStock ?? 0) > 0) {
        inStock.push(item);
      } else {
        outOfStock.push(item);
      }
    }
    return { active, inStock, outOfStock, archived };
  }, [inventoryItems]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (inventoryItems.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Pill className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium mb-2">No supply</p>
        <p className="text-sm mb-4">Add medication supply to start tracking</p>
        <Button onClick={onAddMed} className="gap-2 bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4" />
          Add supply
        </Button>
      </div>
    );
  }

  const getPrescription = (id: string) => prescriptions.find(p => p.id === id);

  return (
    <div className="space-y-6 pb-24">
      {active.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Active Phase
          </h3>
          <div className="space-y-1">
            {active.map((item) => {
              const p = getPrescription(item.prescriptionId);
              if (!p) return null;
              return <InventoryRow key={item.id} item={item} prescription={p} onClick={() => onEditMed(p)} />;
            })}
          </div>
        </div>
      )}

      {inStock.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            In Supply
          </h3>
          <div className="space-y-1">
            {inStock.map((item) => {
              const p = getPrescription(item.prescriptionId);
              if (!p) return null;
              return <InventoryRow key={item.id} item={item} prescription={p} onClick={() => onEditMed(p)} />;
            })}
          </div>
        </div>
      )}

      {outOfStock.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Out of Supply
          </h3>
          <div className="space-y-1">
            {outOfStock.map((item) => {
              const p = getPrescription(item.prescriptionId);
              if (!p) return null;
              return <InventoryRow key={item.id} item={item} prescription={p} onClick={() => onEditMed(p)} />;
            })}
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 w-full hover:text-foreground transition-colors"
          >
            {showArchived ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Archived
          </button>
          {showArchived && (
            <div className="space-y-1">
              {archived.map((item) => {
                const p = getPrescription(item.prescriptionId);
                if (!p) return null;
                return <InventoryRow key={item.id} item={item} prescription={p} onClick={() => onEditMed(p)} />;
              })}
            </div>
          )}
        </div>
      )}

      <Button
        onClick={onAddMed}
        className="w-full gap-2 bg-teal-600 hover:bg-teal-700 text-white"
        size="lg"
      >
        Add supply
      </Button>
    </div>
  );
}

function InventoryRow({ item, prescription, onClick }: { item: InventoryItem; prescription: Prescription; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors active:scale-[0.99]",
        item.isArchived && "opacity-60"
      )}
    >
      <PillIcon shape={item.pillShape || "round"} color={item.pillColor || "#ccc"} size={28} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="font-semibold text-sm truncate">
            {item.brandName || prescription.genericName}
          </p>
          <span className="text-xs text-muted-foreground shrink-0">{prescription.genericName}</span>
        </div>
        <p className={cn(
          "text-xs mt-0.5",
          item.currentStock === 0 ? "text-red-500 font-medium" : "text-muted-foreground"
        )}>
          {item.currentStock} Pill(s) left
        </p>
      </div>
    </button>
  );
}

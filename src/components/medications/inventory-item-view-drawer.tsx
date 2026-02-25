"use client";

import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PillIcon } from "./pill-icon";
import { 
  usePhasesForPrescription,
  useInventoryForPrescription,
} from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";
import { Loader2, Archive, ArchiveRestore, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateInventoryItem, adjustStock, deleteInventoryItem } from "@/lib/medication-service";

interface InventoryItemViewDrawerProps {
  prescription: Prescription | null; // We pass prescription here, but we also need the specific inventory item. For now, we'll fetch the active inventory item for this prescription.
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InventoryItemViewDrawer({ prescription, open, onOpenChange }: InventoryItemViewDrawerProps) {
  if (!prescription) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh] flex flex-col">
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>{prescription.genericName} Stock</DrawerTitle>
          <p className="text-sm text-muted-foreground">{prescription.indication}</p>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="details" className="w-full h-full flex flex-col">
            <div className="px-4 pt-4 shrink-0 border-b">
              <TabsList className="w-full grid grid-cols-2 h-auto p-1 bg-muted/50 rounded-lg mb-4">
                <TabsTrigger value="details" className="py-2 text-xs">Details</TabsTrigger>
                <TabsTrigger value="manage" className="py-2 text-xs">Manage</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <TabsContent value="details" className="mt-0 space-y-6">
                <DetailsTab prescription={prescription} />
              </TabsContent>

              <TabsContent value="manage" className="mt-0">
                <ManageTab prescription={prescription} onOpenChange={onOpenChange} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function DetailsTab({ prescription }: { prescription: Prescription }) {
  const { data: inventory = [], isLoading: invLoading } = useInventoryForPrescription(prescription.id);
  const { data: phases = [], isLoading: phasesLoading } = usePhasesForPrescription(prescription.id);

  if (invLoading || phasesLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeItem = inventory.find(i => i.isActive) || inventory[0];
  const activePhase = phases.find(p => p.status === "active");

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {activeItem ? (
          <div className="p-4 rounded-xl border bg-card space-y-4">
            <div className="flex items-start gap-4">
              <PillIcon shape={activeItem.pillShape} color={activeItem.pillColor} size={40} />
              <div>
                <p className="font-medium">{activeItem.brandName || prescription.genericName}</p>
                <p className="text-sm text-muted-foreground">
                  {activeItem.currentStock} pills remaining
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-muted-foreground text-xs mb-1">Color</p>
                <p className="font-medium capitalize">{activeItem.pillColor}</p>
              </div>
              <div className="p-2 bg-muted/50 rounded-lg">
                <p className="text-muted-foreground text-xs mb-1">Shape</p>
                <p className="font-medium capitalize">{activeItem.pillShape}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No inventory items found.</p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Current Phase</h3>
        {activePhase ? (
          <div className="p-4 rounded-xl border bg-card/50">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                activePhase.type === "titration" 
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" 
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              }`}>
                {activePhase.type === "titration" ? "Titration" : "Maintenance"}
              </span>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-xl font-bold">{activePhase.dosageStrength}</p>
              <p className="text-sm text-muted-foreground mb-0.5">
                ({activePhase.dosageAmount} pill{activePhase.dosageAmount !== 1 ? "s" : ""})
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border">
            No active phase.
          </p>
        )}
      </div>
    </div>
  );
}

function ManageTab({ prescription, onOpenChange }: { prescription: Prescription, onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const { data: inventory = [], isLoading } = useInventoryForPrescription(prescription.id);
  const [refillAmount, setRefillAmount] = useState<number>(30);

  const activeItem = inventory.find(i => i.isActive) || inventory[0];

  const updateMutation = useMutation({
    mutationFn: (updates: any) => updateInventoryItem(activeItem!.id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventoryItems"] });
    }
  });

  const refillMutation = useMutation({
    mutationFn: (amount: number) => adjustStock(activeItem!.id, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventoryItems"] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryItem(activeItem!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventoryItems"] });
      onOpenChange(false);
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeItem) {
    return <p className="text-sm text-muted-foreground">No inventory items found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">Refill Inventory</h3>
        <div className="flex gap-2">
          <Input 
            type="number" 
            value={refillAmount} 
            onChange={(e) => setRefillAmount(parseInt(e.target.value) || 0)} 
            className="flex-1"
          />
          <Button 
            onClick={() => refillMutation.mutate(refillAmount)}
            disabled={refillMutation.isPending || refillAmount <= 0}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {refillMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Refill
          </Button>
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t">
        <h3 className="font-semibold text-sm">Archive Supply</h3>
        <p className="text-xs text-muted-foreground">
          Archiving will hide this supply from the active list but keep its history.
        </p>
        <Button 
          variant={activeItem.isArchived ? "outline" : "destructive"} 
          className="w-full"
          onClick={() => updateMutation.mutate({ isArchived: !activeItem.isArchived })}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : activeItem.isArchived ? (
            <>
              <ArchiveRestore className="w-4 h-4 mr-2" />
              Unarchive
            </>
          ) : (
            <>
              <Archive className="w-4 h-4 mr-2" />
              Archive
            </>
          )}
        </Button>

        {activeItem.isArchived && (
          <Button 
            variant="destructive" 
            className="w-full mt-2"
            onClick={() => {
              if (confirm("Are you sure you want to permanently delete this supply? This action cannot be undone.")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Delete Permanently"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

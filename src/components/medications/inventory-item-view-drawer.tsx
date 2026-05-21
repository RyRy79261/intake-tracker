"use client";

import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PillIcon } from "./pill-icon";
import {
  usePhasesForPrescription,
  useInventoryForPrescription,
  useInventoryTransactions,
  useSchedulesForPhase,
  useUpdateInventoryItem,
  useAdjustStock,
  useDeleteInventoryItem,
  useUpdateInventoryTransaction,
  useDeleteInventoryTransaction,
} from "@/hooks/use-medication-queries";
import { getEffectivePhase } from "@/lib/medication-ui-utils";
import type { Prescription, InventoryItem } from "@/lib/db";
import { Loader2, Archive, ArchiveRestore, Plus, Pencil, Trash2, Check, X, CheckCircle2 } from "lucide-react";

interface InventoryItemViewDrawerProps {
  /** The specific inventory item (pill brand) being viewed. */
  item: InventoryItem | null;
  /** The prescription this medicine belongs to, for context. */
  prescription: Prescription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InventoryItemViewDrawer({ item, prescription, open, onOpenChange }: InventoryItemViewDrawerProps) {
  // Re-resolve against the live query so stock, active and archive state stay
  // current after edits, even when the caller passes a snapshot.
  const siblings = useInventoryForPrescription(item?.prescriptionId);
  if (!item) return null;
  const current = siblings.find((i) => i.id === item.id) ?? item;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh] flex flex-col">
        <DrawerHeader className="border-b shrink-0">
          <DrawerTitle>
            {current.brandName} {current.strength}{current.unit}
          </DrawerTitle>
          <p className="text-sm text-muted-foreground">
            {prescription ? `For ${prescription.genericName}` : "Medicine"}
            {current.isActive ? " · Active brand" : " · Not active"}
            {current.isArchived && " · Archived"}
          </p>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="details" className="w-full h-full flex flex-col">
            <div className="px-4 pt-4 shrink-0 border-b">
              <TabsList className="w-full grid grid-cols-3 h-auto p-1 bg-muted/50 rounded-lg mb-4">
                <TabsTrigger value="details" className="py-2 text-xs">Details</TabsTrigger>
                <TabsTrigger value="inventory" className="py-2 text-xs">Stock</TabsTrigger>
                <TabsTrigger value="manage" className="py-2 text-xs">Manage</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <TabsContent value="details" className="mt-0 space-y-6">
                <DetailsTab item={current} prescription={prescription} />
              </TabsContent>

              <TabsContent value="inventory" className="mt-0 space-y-6">
                <InventoryTab item={current} prescription={prescription} />
              </TabsContent>

              <TabsContent value="manage" className="mt-0">
                <ManageTab item={current} siblings={siblings} onOpenChange={onOpenChange} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function DetailsTab({ item, prescription }: { item: InventoryItem; prescription: Prescription | null }) {
  const phases = usePhasesForPrescription(prescription?.id);
  const effectivePhase = getEffectivePhase(phases);

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl border bg-card space-y-4">
        <div className="flex items-start gap-4">
          <PillIcon shape={item.pillShape} color={item.pillColor} size={40} />
          <div>
            <p className="font-medium">{item.brandName}</p>
            <p className="text-sm text-muted-foreground">
              {item.strength}{item.unit} per pill
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-muted-foreground text-xs mb-1">Color</p>
            <p className="font-medium capitalize">{item.pillColor}</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-muted-foreground text-xs mb-1">Shape</p>
            <p className="font-medium capitalize">{item.pillShape}</p>
          </div>
        </div>

        {item.visualIdentification && (
          <div className="p-2 bg-muted/50 rounded-lg text-sm">
            <p className="text-muted-foreground text-xs mb-1">Markings</p>
            <p className="font-medium">{item.visualIdentification}</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Current Dosing</h3>
        {effectivePhase ? (
          <div className="p-4 rounded-xl border bg-card/50">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                effectivePhase.type === "titration"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              }`}>
                {effectivePhase.type === "titration" ? "On titration" : "Maintenance"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Doses are measured in {effectivePhase.unit}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border">
            No active schedule for this prescription.
          </p>
        )}
      </div>
    </div>
  );
}

function InventoryTab({ item, prescription }: { item: InventoryItem; prescription: Prescription | null }) {
  const transactions = useInventoryTransactions(item.id);
  const phases = usePhasesForPrescription(prescription?.id);
  const effectivePhase = getEffectivePhase(phases);
  const schedules = useSchedulesForPhase(effectivePhase?.id);

  const [refillAmount, setRefillAmount] = useState<number>(30);
  const [refillNote, setRefillNote] = useState<string>("");

  const refillMutation = useAdjustStock();

  let daysLeft = Infinity;
  if (effectivePhase && schedules.length > 0 && item.strength > 0) {
    const dailyDosage = schedules.reduce((acc, s) => acc + (s.dosage * (s.daysOfWeek.length / 7)), 0);
    const dailyPills = dailyDosage / item.strength;
    if (dailyPills > 0) {
      daysLeft = Math.floor((item.currentStock ?? 0) / dailyPills);
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl border bg-card flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Current Stock</p>
          <p className="text-3xl font-bold">{item.currentStock ?? 0} <span className="text-lg font-normal text-muted-foreground">pills</span></p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Est. Supply</p>
          <p className="text-xl font-semibold">{daysLeft === Infinity ? "∞" : daysLeft} <span className="text-sm font-normal text-muted-foreground">days</span></p>
        </div>
      </div>

      {!item.isActive && (
        <p className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg border">
          This brand is not active, so its stock is not deducted when doses are
          taken. Set it as the active brand from the Manage tab.
        </p>
      )}

      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Log Refill</h3>
        <div className="flex gap-2">
          <Input
            type="number"
            step="any"
            value={refillAmount}
            onChange={(e) => setRefillAmount(parseFloat(e.target.value) || 0)}
            className="w-24"
          />
          <Input
            placeholder="Optional note..."
            value={refillNote}
            onChange={(e) => setRefillNote(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={() => {
              const note = refillNote.trim();
              refillMutation.mutate({ inventoryItemId: item.id, amount: refillAmount, ...(note !== "" && { note }), type: "refill" }, { onSuccess: () => { setRefillAmount(30); setRefillNote(""); } });
            }}
            disabled={refillMutation.isPending || refillAmount <= 0}
            className="bg-teal-600 hover:bg-teal-700 shrink-0"
          >
            {refillMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Add
          </Button>
        </div>
      </div>

      {transactions.length > 0 && (
        <div className="space-y-3 pt-4 border-t">
          <h3 className="font-semibold text-sm">History</h3>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
            {transactions.filter(tx => tx.deletedAt === null).map(tx => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionRow({ tx }: { tx: { id: string; type: string; amount: number; note?: string; timestamp: number } }) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(tx.amount);
  const [editNote, setEditNote] = useState(tx.note ?? "");

  const updateMutation = useUpdateInventoryTransaction();
  const deleteMutation = useDeleteInventoryTransaction();

  const isEditable = tx.type === "refill" || tx.type === "adjusted";

  const handleSave = () => {
    updateMutation.mutate(
      { id: tx.id, updates: { amount: editAmount, ...(editNote ? { note: editNote } : {}) } },
      { onSuccess: () => setEditing(false) },
    );
  };

  const handleDelete = () => {
    if (window.confirm("Delete this transaction? Stock will be recalculated.")) {
      deleteMutation.mutate(tx.id);
    }
  };

  if (editing) {
    return (
      <div className="p-3 rounded-lg border bg-muted/30 text-sm space-y-2">
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            step="any"
            value={editAmount}
            onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
            className="w-24 h-8 text-sm"
          />
          <Input
            placeholder="Note..."
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            className="flex-1 h-8 text-sm"
          />
        </div>
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>
            <X className="w-3 h-3 mr-1" /> Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700" onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 text-sm">
      <div className="flex-1 min-w-0">
        <p className="font-medium">
          {tx.type === "refill" ? "Refill" : tx.type === "consumed" ? "Consumed" : tx.type === "initial" ? "Initial" : "Adjusted"}
          <span className={tx.amount > 0 ? "text-emerald-600 ml-2" : "text-red-500 ml-2"}>
            {tx.amount > 0 ? "+" : ""}{tx.amount}
          </span>
        </p>
        {tx.note && <p className="text-xs text-muted-foreground mt-0.5">{tx.note}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-muted-foreground mr-1">
          {new Date(tx.timestamp).toLocaleDateString()}
        </span>
        {isEditable && (
          <>
            <button
              onClick={() => { setEditAmount(tx.amount); setEditNote(tx.note ?? ""); setEditing(true); }}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <Pencil className="w-3 h-3 text-muted-foreground" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1 rounded hover:bg-muted transition-colors"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3 text-muted-foreground" />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ManageTab({
  item,
  siblings,
  onOpenChange,
}: {
  item: InventoryItem;
  siblings: InventoryItem[];
  onOpenChange: (open: boolean) => void;
}) {
  const updateMutation = useUpdateInventoryItem();
  const deleteMutation = useDeleteInventoryItem();

  const canActivate = !item.isActive && !item.isArchived;

  const handleSetActive = async () => {
    const currentActive = siblings.find(
      (i) => i.isActive && !i.isArchived && i.id !== item.id,
    );
    if (currentActive) {
      await updateMutation.mutateAsync({ id: currentActive.id, updates: { isActive: false } });
    }
    await updateMutation.mutateAsync({ id: item.id, updates: { isActive: true } });
  };

  return (
    <div className="space-y-6">
      {canActivate && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Active Brand</h3>
          <p className="text-xs text-muted-foreground">
            Make this the brand doses are deducted from. Switch deliberately
            when you start taking pills from a different box.
          </p>
          <Button
            className="w-full bg-teal-600 hover:bg-teal-700"
            onClick={handleSetActive}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Set as active brand
              </>
            )}
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="font-semibold text-sm">Archive Medicine</h3>
        <p className="text-xs text-muted-foreground">
          Archiving hides this medicine from the active list but keeps its history.
        </p>
        <Button
          variant={item.isArchived ? "outline" : "destructive"}
          className="w-full"
          onClick={() => updateMutation.mutate({ id: item.id, updates: { isArchived: !item.isArchived, ...(item.isActive && !item.isArchived ? { isActive: false } : {}) } })}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : item.isArchived ? (
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

        {item.isArchived && (
          <Button
            variant="destructive"
            className="w-full mt-2"
            onClick={() => {
              if (confirm("Permanently delete this medicine? This cannot be undone.")) {
                deleteMutation.mutate(item.id, { onSuccess: () => onOpenChange(false) });
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

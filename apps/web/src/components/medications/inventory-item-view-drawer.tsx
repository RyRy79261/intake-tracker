"use client";

import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@intake/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@intake/ui/tabs";
import { Button } from "@intake/ui/button";
import { Input } from "@intake/ui/input";
import { PillIcon } from "@/components/medications/pill-icon";
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
import {
  useSetActiveBrand,
  useArchiveInventoryItem,
  useSetStockCount,
  useRestoreInventoryTransaction,
} from "@/hooks/use-inventory-mutations";
import { computeRefillStatus } from "@/lib/refill-status";
import { showUndoToast } from "@/components/medications/undo-toast";
import { useToast } from "@intake/ui/use-toast";
import { selectEffectivePhase } from "@intake/core/effective-phase";
import { isLive } from "@intake/core/lifecycle";
import { isCombo, formatCompoundShort, formatCompoundFull, compoundsMismatch } from "@intake/core/compound";
import type { Prescription, InventoryItem, InventoryTransaction } from "@/lib/db";
import { toLocalDateKey } from "@/lib/date-utils";
import { Bdg, WarnBox } from "@/components/medications/ward-bits";
import { Archive, ArchiveRestore, Plus, Pencil, Trash2, Check, X, CheckCircle2 } from "lucide-react";
import { Spinner } from "@intake/ui/spinner";

/** A Color / Shape / Markings tile (`.tiles > div`). */
const tileClass = "border border-line bg-background px-2 py-1.5";
/** Section heading inside the drawer. */
const drawerH3 = "mt-1 text-[0.9375rem] font-semibold";
/** 44px square icon button (`.ibtn`). */
const iconBtn =
  "inline-flex h-11 w-11 items-center justify-center text-muted-foreground hover:bg-foreground/6 hover:text-foreground disabled:opacity-40 " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

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
      <DrawerContent data-domain="meds" className="flex max-h-[90dvh] flex-col bg-panel shadow-[inset_0_3px_0_hsl(var(--meds))]">
        <DrawerHeader className="shrink-0 border-b border-line text-left">
          <DrawerTitle className="text-base font-semibold">
            {current.brandName}{" "}
            {isCombo(current)
              ? formatCompoundShort(current.compounds, current.unit)
              : `${current.strength}${current.unit}`}
          </DrawerTitle>
          <p className="text-[0.8125rem] text-muted-foreground">
            {prescription ? `For ${prescription.genericName}` : "Medicine"}
            {current.isActive ? " · Active brand" : " · Not active"}
            {current.isArchived && " · Archived"}
          </p>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="details" className="w-full h-full flex flex-col">
            <div className="shrink-0 px-4 pt-3">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="inventory">Stock</TabsTrigger>
                <TabsTrigger value="manage">Manage</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-5 pt-3 text-sm">
              <TabsContent value="details" className="mt-0">
                <DetailsTab item={current} prescription={prescription} />
              </TabsContent>

              <TabsContent value="inventory" className="mt-0">
                <InventoryTab item={current} siblings={siblings} prescription={prescription} />
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
  const effectivePhase = selectEffectivePhase(phases);

  return (
    <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <PillIcon shape={item.pillShape} color={item.pillColor} size={40} />
          <div>
            <p className="font-semibold">{item.brandName}</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              {isCombo(item)
                ? `${formatCompoundFull(item.compounds, item.unit)} per pill`
                : `${item.strength}${item.unit} per pill`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div className={tileClass}>
            <p className="text-[0.6875rem] text-muted-foreground">Color</p>
            <p className="capitalize">{item.pillColor}</p>
          </div>
          <div className={tileClass}>
            <p className="text-[0.6875rem] text-muted-foreground">Shape</p>
            <p className="capitalize">{item.pillShape}</p>
          </div>
          {item.visualIdentification && (
            <div className={`${tileClass} col-span-2`}>
              <p className="text-[0.6875rem] text-muted-foreground">Markings</p>
              <p>{item.visualIdentification}</p>
            </div>
          )}
        </div>

        {prescription && compoundsMismatch(prescription.compounds, item.compounds) && (
          <WarnBox title="Ratio doesn't match">
            <span>
              This brand&apos;s ingredients ({formatCompoundFull(item.compounds, item.unit)}) differ
              from this prescription ({formatCompoundFull(prescription.compounds, item.unit)}).
              Doses are labelled and counted from this brand&apos;s tablets; check it is the
              right medicine.
            </span>
          </WarnBox>
        )}

        <h3 className={drawerH3}>Current Dosing</h3>
        {effectivePhase ? (
          <p className="flex flex-wrap items-center gap-2">
            {effectivePhase.type === "titration" ? (
              <Bdg tone="sodium" kind="fill">On titration</Bdg>
            ) : (
              <Bdg tone="water">Maintenance</Bdg>
            )}
            <span>Doses are measured in {effectivePhase.unit}</span>
          </p>
        ) : (
          <p className="text-[0.8125rem] text-muted-foreground">
            No active schedule for this prescription.
          </p>
        )}
    </div>
  );
}

/**
 * The brand doses are deducted from, among a prescription's items. Mirrors
 * `isActiveBrand` in inventory-service (components can't import services).
 */
function findActiveBrand(items: InventoryItem[]): InventoryItem | undefined {
  return items.find((i) => isLive(i) && i.isActive === true && !i.isArchived);
}

/** Parse a number field; `null` when empty or not a finite number. */
function parseAmount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * When a refill collected on `dateKey` happened: `undefined` (now) for today,
 * local noon for an earlier day (away from midnight, so a small time-zone
 * shift keeps the same date).
 */
function refillOccurredAt(dateKey: string, todayKey: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey >= todayKey) return undefined;
  const at = new Date(`${dateKey}T12:00:00`).getTime();
  return Number.isFinite(at) ? at : undefined;
}

function InventoryTab({
  item,
  siblings,
  prescription,
}: {
  item: InventoryItem;
  siblings: InventoryItem[];
  prescription: Prescription | null;
}) {
  const transactions = useInventoryTransactions(item.id);
  const phases = usePhasesForPrescription(prescription?.id);
  // Supply follows the phase that actually drives today's doses — the same
  // choice as the dose schedule and the refill notifier.
  const effectivePhase = selectEffectivePhase(phases);
  const schedules = useSchedulesForPhase(effectivePhase?.id);
  const { toast } = useToast();

  // Starts empty: a refill needs an explicit amount (box sizes vary).
  const [refillAmount, setRefillAmount] = useState("");
  const [refillNote, setRefillNote] = useState<string>("");
  // "YYYY-MM-DD" the refill was collected; today (or empty) means now.
  const todayKey = toLocalDateKey();
  const [refillDate, setRefillDate] = useState(todayKey);
  const [countedAmount, setCountedAmount] = useState("");

  const refillMutation = useAdjustStock();
  const countMutation = useSetStockCount();

  const parsedRefill = parseAmount(refillAmount);
  const parsedCount = parseAmount(countedAmount);

  const activeBrand = findActiveBrand(siblings);
  const isActiveBrand = activeBrand?.id === item.id;
  // Only the active brand is deducted, so only it has a supply estimate.
  const status = isActiveBrand ? computeRefillStatus(item, effectivePhase, schedules) : null;
  // Spare boxes (other unarchived brands) are shown apart from the active box.
  const spares = isActiveBrand
    ? siblings.filter((i) => i.id !== item.id && isLive(i) && !i.isArchived && (i.currentStock ?? 0) > 0)
    : [];
  const spareStock = spares.reduce((acc, i) => acc + (i.currentStock ?? 0), 0);

  const supplyText =
    status === null ? "—" : status.daysLeft === null ? "∞" : String(status.daysLeft);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 border border-line bg-background">
        <div className="flex flex-col items-start gap-[3px] px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Current Stock</p>
          <p className={`font-mono text-lg font-semibold ${(item.currentStock ?? 0) < 0 ? "text-bp" : ""}`}>
            {item.currentStock ?? 0} <span className="text-[0.8125rem] font-normal text-muted-foreground">pills</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-[3px] border-l border-line px-3 py-2.5 text-right">
          <p className="text-xs text-muted-foreground">Est. Supply</p>
          {(item.currentStock ?? 0) <= 0 ? (
            <p className="font-mono text-lg font-semibold text-bp" data-testid="est-supply">Out of stock</p>
          ) : (
            <p className="font-mono text-lg font-semibold" data-testid="est-supply">{supplyText} <span className="text-[0.8125rem] font-normal text-muted-foreground">days</span></p>
          )}
          {status?.isLow && (item.currentStock ?? 0) > 0 && (
            <Bdg tone="sodium" kind="tint">Refill soon</Bdg>
          )}
        </div>
      </div>

      {spares.length > 0 && (
        <p className="text-[0.8125rem] text-muted-foreground">
          Spare boxes: {spareStock} pills in {spares.map((i) => i.brandName).join(", ")}.
          Not counted in this box&apos;s supply.
        </p>
      )}

      {!activeBrand && !item.isArchived && (
        <WarnBox>
          This prescription has no active brand, so doses are not deducted from
          any stock. Set a brand as active from the Manage tab.
        </WarnBox>
      )}

      {activeBrand && !isActiveBrand && (
        <WarnBox title="Not the active brand">
          This brand is not active, so its stock is not deducted when doses are
          taken. Set it as the active brand from the Manage tab.
        </WarnBox>
      )}

      <div className="flex flex-col gap-2">
        <h3 className={drawerH3}>Log Refill</h3>
        <div className="flex gap-2">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="Pills"
            aria-label="Refill amount"
            value={refillAmount}
            onChange={(e) => setRefillAmount(e.target.value)}
            className="w-24 font-mono"
          />
          <Input
            placeholder="Optional note..."
            value={refillNote}
            onChange={(e) => setRefillNote(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={() => {
              if (parsedRefill === null) return;
              const note = refillNote.trim();
              const occurredAt = refillOccurredAt(refillDate, todayKey);
              refillMutation.mutate(
                {
                  inventoryItemId: item.id,
                  amount: parsedRefill,
                  ...(note !== "" && { note }),
                  type: "refill",
                  ...(occurredAt !== undefined && { occurredAt }),
                },
                {
                  onSuccess: () => { setRefillAmount(""); setRefillNote(""); setRefillDate(toLocalDateKey()); },
                  onError: (e) => toast({ title: "Could not log refill", description: e.message, variant: "destructive" }),
                },
              );
            }}
            disabled={
              refillMutation.isPending || parsedRefill === null || parsedRefill <= 0 || refillDate > todayKey
            }
            className="shrink-0"
          >
            {refillMutation.isPending ? <Spinner className="size-4" /> : <Plus className="w-4 h-4" />}
            Add
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`refill-date-${item.id}`} className="text-[0.8125rem] text-muted-foreground">
            Collected on
          </label>
          <Input
            id={`refill-date-${item.id}`}
            type="date"
            aria-label="Refill date"
            max={todayKey}
            value={refillDate}
            onChange={(e) => setRefillDate(e.target.value || todayKey)}
            className="w-44 font-mono"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className={drawerH3}>Correct Count</h3>
        <p className="text-[0.8125rem] text-muted-foreground">
          Counted the box? Enter how many pills are left and the difference is
          recorded as an adjustment.
        </p>
        <div className="flex gap-2">
          <Input
            type="number"
            step="any"
            min={0}
            inputMode="decimal"
            placeholder="Pills"
            aria-label="Counted pills"
            value={countedAmount}
            onChange={(e) => setCountedAmount(e.target.value)}
            className="w-24 font-mono"
          />
          <Button
            variant="outline"
            onClick={() => {
              if (parsedCount === null) return;
              countMutation.mutate(
                { inventoryItemId: item.id, counted: parsedCount },
                {
                  onSuccess: () => setCountedAmount(""),
                  onError: (e) => toast({ title: "Could not set count", description: e.message, variant: "destructive" }),
                },
              );
            }}
            disabled={countMutation.isPending || parsedCount === null || parsedCount < 0}
            className="shrink-0"
          >
            {countMutation.isPending && <Spinner className="size-4 mr-1" />}
            Set count
          </Button>
        </div>
      </div>

      {transactions.length > 0 && (
        <div>
          <h3 className={drawerH3}>History</h3>
          <div className="mt-1 max-h-[40vh] overflow-y-auto">
            {transactions.map(tx => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Whether an edited amount is valid for the transaction type. */
function isValidAmount(type: InventoryTransaction["type"], amount: number | null): amount is number {
  if (amount === null) return false;
  if (type === "refill") return amount > 0;
  if (type === "adjusted") return amount !== 0;
  return true;
}

function TransactionRow({ tx }: { tx: Pick<InventoryTransaction, "id" | "type" | "amount" | "note" | "timestamp"> }) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(String(tx.amount));
  const [editNote, setEditNote] = useState(tx.note ?? "");

  const updateMutation = useUpdateInventoryTransaction();
  const deleteMutation = useDeleteInventoryTransaction();
  const restoreMutation = useRestoreInventoryTransaction();

  const isEditable = tx.type === "refill" || tx.type === "adjusted";
  const parsedEdit = parseAmount(editAmount);
  const canSave = isValidAmount(tx.type, parsedEdit);

  const handleSave = () => {
    if (!isValidAmount(tx.type, parsedEdit)) return;
    // The note is always sent: an empty note clears it.
    updateMutation.mutate(
      { id: tx.id, updates: { amount: parsedEdit, note: editNote } },
      { onSuccess: () => setEditing(false) },
    );
  };

  const handleDelete = () => {
    if (window.confirm("Delete this transaction? Stock will be recalculated.")) {
      deleteMutation.mutate(tx.id, {
        onSuccess: () => {
          showUndoToast({
            title: "Transaction deleted",
            description: "Stock was recalculated.",
            onUndo: () => restoreMutation.mutate(tx.id),
          });
        },
      });
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2 border-t border-line py-2 text-sm">
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            aria-label="Transaction amount"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            className="w-24 font-mono"
          />
          <Input
            placeholder="Note..."
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            className="flex-1"
          />
        </div>
        <div className="flex gap-1 justify-end">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
            <X /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending || !canSave}>
            {updateMutation.isPending ? <Spinner /> : <Check />}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-t border-line py-0.5 text-sm">
      <div className="flex min-w-0 flex-col gap-px">
        <p className={`font-mono text-[0.8125rem] font-semibold ${tx.amount > 0 ? "text-weight" : tx.amount < 0 ? "text-bp" : ""}`}>
          {tx.type === "refill" ? "Refill" : tx.type === "consumed" ? "Consumed" : tx.type === "initial" ? "Initial" : "Adjusted"}{" "}
          {tx.amount > 0 ? "+" : ""}{tx.amount}
        </p>
        <p className="text-xs text-muted-foreground">
          {tx.note && <><span>{tx.note}</span>{" · "}</>}
          {new Date(tx.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </p>
      </div>
      {isEditable && (
        <div className="flex">
          <button
            type="button"
            onClick={() => { setEditAmount(String(tx.amount)); setEditNote(tx.note ?? ""); setEditing(true); }}
            className={iconBtn}
            aria-label="Edit transaction"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className={iconBtn}
            disabled={deleteMutation.isPending}
            aria-label="Delete transaction"
          >
            {deleteMutation.isPending ? <Spinner className="size-4" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      )}
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
  const setActiveMutation = useSetActiveBrand();
  const archiveMutation = useArchiveInventoryItem();
  const { toast } = useToast();
  // Archiving the active brand with several candidates asks which takes over.
  const [choosingReplacement, setChoosingReplacement] = useState(false);

  const canActivate = !item.isActive && !item.isArchived;
  const replacementCandidates = siblings.filter(
    (i) => i.id !== item.id && isLive(i) && !i.isArchived,
  );
  const archivePending = archiveMutation.isPending || updateMutation.isPending;

  const handleSetActive = () => {
    setActiveMutation.mutate({ prescriptionId: item.prescriptionId, itemId: item.id });
  };

  const archive = (replacementId?: string) => {
    archiveMutation.mutate(
      { id: item.id, ...(replacementId !== undefined && { replacementId }) },
      {
        onSuccess: ({ promotedId }) => {
          setChoosingReplacement(false);
          const promoted = siblings.find((i) => i.id === promotedId);
          if (promoted) {
            toast({ title: "Brand archived", description: `${promoted.brandName} is now the active brand` });
          }
        },
        onError: (e) => toast({ title: "Could not archive", description: e.message, variant: "destructive" }),
      },
    );
  };

  const handleArchiveToggle = () => {
    if (item.isArchived) {
      updateMutation.mutate({ id: item.id, updates: { isArchived: false } });
    } else if (item.isActive && replacementCandidates.length > 1) {
      setChoosingReplacement(true);
    } else {
      archive();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className={drawerH3}>Active Brand</h3>
      {item.isActive && !item.isArchived && (
        <p className="flex items-center gap-2">
          <Bdg tone="weight" kind="fill">Active</Bdg> Doses are deducted from this box.
        </p>
      )}
      {canActivate && (
        <div className="flex flex-col gap-2">
          <p className="text-[0.8125rem] text-muted-foreground">
            Make this the brand doses are deducted from. Switch deliberately
            when you start taking pills from a different box.
          </p>
          <Button
            className="w-full"
            onClick={handleSetActive}
            disabled={setActiveMutation.isPending}
          >
            {setActiveMutation.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <>
                <CheckCircle2 />
                Set as active brand
              </>
            )}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className={drawerH3}>Archive Medicine</h3>
        <p className="text-[0.8125rem] text-muted-foreground">
          Archiving hides this medicine from the active list but keeps its history.
          {item.isActive && !item.isArchived && replacementCandidates.length === 0 &&
            " This is the only brand, so doses will stop being deducted from stock."}
        </p>
        {choosingReplacement ? (
          <div className="space-y-2">
            <WarnBox title="Which brand do you take from now?">
              This is the active brand. Pick the box doses come from next.
            </WarnBox>
            {replacementCandidates.map((candidate) => (
              <Button
                key={candidate.id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => archive(candidate.id)}
                disabled={archivePending}
              >
                {candidate.brandName}{" "}
                {isCombo(candidate)
                  ? formatCompoundShort(candidate.compounds, candidate.unit)
                  : `${candidate.strength}${candidate.unit}`}
              </Button>
            ))}
            <Button variant="outline" className="w-full" onClick={() => setChoosingReplacement(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className={item.isArchived ? "w-full" : "w-full border-bp text-bp"}
            onClick={handleArchiveToggle}
            disabled={archivePending}
          >
            {archivePending ? (
              <Spinner className="size-4" />
            ) : item.isArchived ? (
              <>
                <ArchiveRestore />
                Unarchive
              </>
            ) : (
              <>
                <Archive />
                Archive
              </>
            )}
          </Button>
        )}

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
              <Spinner className="size-4" />
            ) : (
              "Delete Permanently"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card } from "@intake/ui/card";
import { Badge } from "@intake/ui/badge";
import { CompoundCardExpanded } from "@/components/medications/compound-card-expanded";
import { InventoryItemViewDrawer } from "@/components/medications/inventory-item-view-drawer";
import { RetroactiveTimePicker } from "@/components/medications/retroactive-time-picker";
import { ChevronDown } from "lucide-react";
import { PillIconWithBadge } from "@/components/medications/pill-icon";
import {
  formatDoseAmount,
  getEffectivePhase,
  getActiveTitrationPhase,
  getPendingTitrationPhase,
  getCurrentTimeHHMM,
} from "@/lib/medication-ui-utils";
import { isCombo, formatCompoundShort, formatComboDose } from "@intake/core/compound";
import {
  usePhasesForPrescription,
  usePhasesLoaded,
  useInventoryForPrescription,
  useDailyDoseSchedule,
  useLogPrnDose,
  useSchedulesForPhase,
  usePrnDoseLogs,
  useUndoPrnDose,
} from "@/hooks/use-medication-queries";
import { computeRefillStatus } from "@/lib/refill-status";
import { selectEffectivePhase } from "@intake/core/effective-phase";
import { useTodayKey } from "@/hooks/use-today-key";
import { useToast } from "@intake/ui/use-toast";
import type { Prescription } from "@/lib/db";
import { toLocalDateKey } from "@/lib/date-utils";

/** How far back the as-needed dose list on the card reaches, in days. */
const PRN_LIST_DAYS = 7;
const PRN_LIST_MAX = 5;

interface PrescriptionCardProps {
  prescription: Prescription;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  className?: string;
}

function daysBefore(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() - days);
  return toLocalDateKey(d);
}

function formatPrnWhen(ts: number, todayKey: string): string {
  const d = new Date(ts);
  const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (toLocalDateKey(d) === todayKey) return `Today ${clock}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${clock}`;
}

export function PrescriptionCard({ prescription, expanded: controlledExpanded, onToggleExpanded, className }: PrescriptionCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [medDrawerOpen, setMedDrawerOpen] = useState(false);
  const [prnPickerOpen, setPrnPickerOpen] = useState(false);
  const logPrn = useLogPrnDose();
  const undoPrn = useUndoPrnDose();
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
  const expanded = controlledExpanded ?? internalExpanded;
  const toggleExpanded = onToggleExpanded ?? (() => setInternalExpanded((v) => !v));

  const { toast } = useToast();
  // Ticking day key, so a card left open overnight logs against the new day.
  const todayDateStr = useTodayKey();
  const prnLogs = usePrnDoseLogs(prescription.id, daysBefore(todayDateStr, PRN_LIST_DAYS - 1));
  const phases = usePhasesForPrescription(prescription.id);
  const phasesLoaded = usePhasesLoaded(prescription.id);
  const inventoryItems = useInventoryForPrescription(prescription.id);
  const allSlots = useDailyDoseSchedule(todayDateStr);

  const effectivePhase = getEffectivePhase(phases);
  const activeTitration = getActiveTitrationPhase(phases);
  const pendingTitration = getPendingTitrationPhase(phases);
  const activeInventory = inventoryItems.find((item) => item.isActive && !item.isArchived);

  const slotsArray = allSlots ?? [];
  const prescriptionSlots = slotsArray.filter(
    (s) => s.prescriptionId === prescription.id
  );

  const firstSlot = prescriptionSlots.length > 0 ? prescriptionSlots[0] : undefined;
  const dosageMg = firstSlot?.dosageMg;
  const unit = effectivePhase?.unit ?? "mg";
  // Dose chip — per-compound amounts from the active combo brand's tablets,
  // plain summed mg otherwise.
  const dosageChip =
    dosageMg === undefined ? undefined : formatComboDose(dosageMg, unit, firstSlot?.inventory);

  const pendingSlots = prescriptionSlots.filter((s) => s.status === "pending");
  const allHandled = prescriptionSlots.length > 0 && pendingSlots.length === 0;
  const firstPending = pendingSlots.length > 0 ? pendingSlots[0] : undefined;
  const nextDoseTime = firstPending?.localTime ?? null;

  // Gate on phasesLoaded: usePhasesForPrescription returns [] while loading, so
  // without this a scheduled prescription would briefly look as-needed and a
  // fast click could log a PRN dose against the wrong regimen.
  const isAsNeeded = phasesLoaded && !effectivePhase;

  const handleLogPrnDose = (time: string) => {
    logPrn.mutate(
      {
        prescriptionId: prescription.id,
        date: todayDateStr,
        time,
        // Default an as-needed dose to one pill of the tracked inventory's
        // strength; with no inventory, just log the event (no stock decrement).
        ...(activeInventory && {
          doseMg: activeInventory.strength,
          dosageMg: activeInventory.strength,
        }),
      },
      {
        onSuccess: () =>
          toast({ title: `${prescription.genericName} dose logged` }),
        // RetroactiveTimePicker closes on confirm, so a silent failure would
        // look successful — surface it.
        onError: () =>
          toast({ title: "Failed to log dose", variant: "destructive" }),
      },
    );
  };

  const handleUndoPrn = (id: string) => {
    setConfirmUndoId(null);
    undoPrn.mutate(id, {
      onSuccess: () =>
        toast({ title: `${prescription.genericName} dose removed`, description: "Stock restored" }),
      onError: () => toast({ title: "Failed to remove dose", variant: "destructive" }),
    });
  };

  let nextDoseLabel: string;
  if (isAsNeeded) {
    nextDoseLabel = "As needed";
  } else if (prescriptionSlots.length === 0) {
    nextDoseLabel = "No doses today";
  } else if (allHandled) {
    nextDoseLabel = "All done";
  } else if (nextDoseTime) {
    nextDoseLabel = `Next: ${nextDoseTime}`;
  } else {
    nextDoseLabel = "No doses today";
  }

  // Shared with the inventory drawer and the refill notifier (pill OR days
  // threshold, over the phase that drives today's doses).
  const refillPhase = selectEffectivePhase(phases);
  const refillSchedules = useSchedulesForPhase(refillPhase?.id);
  const refill = activeInventory
    ? computeRefillStatus(activeInventory, refillPhase, refillSchedules)
    : null;
  const isNegativeStock = refill?.isNegative;
  const isLowStock = refill?.isLow;
  // Scheduled but nothing to deduct from: doses stop being tracked silently.
  const hasUntrackedStock = !activeInventory && !!refillPhase && inventoryItems.length > 0;

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.1 }}
      className={className}
    >
      <Card
        className="p-2.5 cursor-pointer hover:bg-muted/40 transition-colors h-full"
        onClick={toggleExpanded}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-xs truncate leading-tight">
              {prescription.genericName}
            </h3>
            {prescription.indication && (
              <p className="text-[10px] text-muted-foreground truncate">
                {prescription.indication}
              </p>
            )}
          </div>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 mt-0.5"
          >
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </motion.div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {dosageChip !== undefined && (
            <span className="text-[10px] text-muted-foreground">
              {dosageChip}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {nextDoseLabel}
          </span>
        </div>

        {isAsNeeded && (
          <button
            type="button"
            aria-label={`Log an as-needed dose of ${prescription.genericName}`}
            onClick={(e) => {
              e.stopPropagation();
              setPrnPickerOpen(true);
            }}
            disabled={logPrn.isPending}
            className="mt-1.5 w-full text-[11px] font-medium py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white transition-colors"
          >
            Log dose now
          </button>
        )}

        {/* Recent as-needed doses, each removable (first tap arms, second
            tap confirms). Removing one also puts its pills back in stock. */}
        {isAsNeeded && prnLogs.length > 0 && (
          <ul className="mt-1.5 space-y-0.5" aria-label="Recent as-needed doses">
            {prnLogs.slice(0, PRN_LIST_MAX).map((log) => {
              const when = formatPrnWhen(log.actionTimestamp ?? log.createdAt, todayDateStr);
              const armed = confirmUndoId === log.id;
              return (
                <li key={log.id} className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                  <span className="truncate">{when}</span>
                  <button
                    type="button"
                    aria-label={armed ? `Confirm undo as-needed dose at ${when}` : `Undo as-needed dose at ${when}`}
                    disabled={undoPrn.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (armed) handleUndoPrn(log.id);
                      else setConfirmUndoId(log.id);
                    }}
                    className="shrink-0 px-1 rounded text-[10px] font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-60"
                  >
                    {armed ? "Remove?" : "Undo"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-1 flex-wrap mt-1">
          {activeTitration && (
            <Badge className="text-[9px] px-1 py-0 bg-amber-500 hover:bg-amber-600 text-white">
              On titration
            </Badge>
          )}
          {!activeTitration && pendingTitration && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-400 text-blue-600 dark:text-blue-400">
              Titration planned
            </Badge>
          )}
          {isNegativeStock && (
            <Badge variant="destructive" className="text-[9px] px-1 py-0">
              Negative
            </Badge>
          )}
          {isLowStock && (
            <Badge className="text-[9px] px-1 py-0 bg-amber-500 hover:bg-amber-600 text-white">
              Low
            </Badge>
          )}
          {hasUntrackedStock && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500 text-amber-600 dark:text-amber-400">
              No active brand
            </Badge>
          )}
        </div>

        {/* Active medicine mini-card — tap to open that medicine's details */}
        {activeInventory && (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setMedDrawerOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                setMedDrawerOpen(true);
              }
            }}
            className="mt-1.5 p-1.5 rounded-md bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-1.5 cursor-pointer hover:bg-emerald-100/80 dark:hover:bg-emerald-900/40 transition-colors"
          >
            <PillIconWithBadge
              shape={activeInventory.pillShape ?? "round"}
              color={activeInventory.pillColor ?? "#94a3b8"}
              size={18}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-emerald-800 dark:text-emerald-300 truncate">
                  {activeInventory.brandName}
                </span>
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 shrink-0 ml-auto">
                  {isCombo(activeInventory)
                    ? formatCompoundShort(activeInventory.compounds, activeInventory.unit)
                    : `${activeInventory.strength}${activeInventory.unit}`}
                </span>
              </div>
              {firstSlot?.pillsPerDose != null && dosageMg != null && (
                <p className="text-[9px] text-emerald-600 dark:text-emerald-400">
                  {formatDoseAmount(firstSlot)}
                  {effectivePhase?.foodInstruction && effectivePhase.foodInstruction !== "none" && ` · ${effectivePhase.foodInstruction} eating`}
                </p>
              )}
            </div>
          </div>
        )}

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CompoundCardExpanded prescription={prescription} />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <InventoryItemViewDrawer
        item={activeInventory ?? null}
        prescription={prescription}
        open={medDrawerOpen}
        onOpenChange={setMedDrawerOpen}
      />

      <RetroactiveTimePicker
        open={prnPickerOpen}
        onOpenChange={setPrnPickerOpen}
        defaultTime={getCurrentTimeHHMM()}
        compoundName={prescription.genericName}
        onConfirm={handleLogPrnDose}
        notAfterNow
      />
    </motion.div>
  );
}

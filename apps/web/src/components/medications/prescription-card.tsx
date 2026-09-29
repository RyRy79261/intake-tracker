"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CompoundCardExpanded } from "@/components/medications/compound-card-expanded";
import { InventoryItemViewDrawer } from "@/components/medications/inventory-item-view-drawer";
import { RetroactiveTimePicker } from "@/components/medications/retroactive-time-picker";
import { PillIcon } from "@/components/medications/pill-icon";
import { Bdg } from "@/components/medications/ward-bits";
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
import { cn } from "@/lib/utils";
import type { Prescription } from "@/lib/db";
import { toLocalDateKey } from "@/lib/date-utils";

/** How far back the as-needed dose list reaches, in days. */
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

/**
 * A compact Rx card (the prototype's `.rxk`). The header button toggles the
 * expanded detail; the footer holds the as-needed line and the active brand,
 * pinned to the bottom so cards on a row line up at equal height.
 */
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

  const brandStrength = activeInventory
    ? isCombo(activeInventory)
      ? formatCompoundShort(activeInventory.compounds, activeInventory.unit)
      : `${activeInventory.strength}${activeInventory.unit}`
    : undefined;

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
  let nextDue = false;
  if (isAsNeeded) {
    nextDoseLabel = "As needed";
  } else if (prescriptionSlots.length === 0) {
    nextDoseLabel = "No doses today";
  } else if (allHandled) {
    nextDoseLabel = "All done";
  } else if (nextDoseTime) {
    nextDoseLabel = `Next: ${nextDoseTime}`;
    nextDue = nextDoseTime <= getCurrentTimeHHMM();
  } else {
    nextDoseLabel = "No doses today";
  }

  const chip = isAsNeeded ? (brandStrength ?? "—") : (dosageChip ?? "—");

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

  const hasBadges = !!(activeTitration || pendingTitration || isNegativeStock || isLowStock || hasUntrackedStock);
  const food = effectivePhase?.foodInstruction && effectivePhase.foodInstruction !== "none"
    ? ` · ${effectivePhase.foodInstruction} eating`
    : "";
  const lastPrn = prnLogs[0];

  const brandDoseLine = isAsNeeded
    ? "1 tablet as needed"
    : firstSlot?.pillsPerDose != null && dosageMg != null
      ? `${formatDoseAmount(firstSlot)}${food}`
      : null;

  return (
    <div
      data-testid="rx-card"
      data-expanded={expanded || undefined}
      className={cn(
        "flex min-w-0 flex-col border border-line bg-background",
        expanded && "border-muted-foreground shadow-[inset_3px_0_0_hsl(var(--meds))]",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={toggleExpanded}
        className={cn(
          "flex min-h-11 w-full flex-none flex-col items-stretch gap-[7px] py-2.5 pl-2.5 pr-1.5 text-left",
          "hover:bg-foreground/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="flex items-start gap-1">
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-semibold leading-tight [overflow-wrap:anywhere]">
              {prescription.genericName}
            </span>
            {prescription.indication && (
              <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted-foreground">
                {prescription.indication}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn("h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
          />
        </span>

        <span className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1 pr-1">
          <span className="whitespace-nowrap border border-line bg-panel px-[5px] py-1 font-mono text-xs font-semibold leading-none">
            {chip}
          </span>
          <span className={cn("whitespace-nowrap text-[0.6875rem]", nextDue ? "font-semibold text-meds" : "text-muted-foreground")}>
            {nextDoseLabel}
          </span>
        </span>

        {hasBadges && (
          <span className="flex flex-wrap gap-1">
            {activeTitration && <Bdg tone="sodium" kind="fill">On titration</Bdg>}
            {!activeTitration && pendingTitration && <Bdg tone="water">Titration planned</Bdg>}
            {isNegativeStock && <Bdg tone="bp" kind="fill">Negative</Bdg>}
            {isLowStock && <Bdg tone="sodium" kind="tint">Low</Bdg>}
            {hasUntrackedStock && <Bdg tone="sodium">No active brand</Bdg>}
          </span>
        )}
      </button>

      <div className="mt-auto flex flex-col">
        {isAsNeeded && prescription.isActive && (
          <div className="mx-2 mb-2 flex min-h-11 items-center gap-2 border border-dashed border-line py-1 pl-2 pr-1 text-xs leading-snug text-muted-foreground">
            <span className="min-w-0 flex-1">
              As needed · {lastPrn
                ? `last ${formatPrnWhen(lastPrn.actionTimestamp ?? lastPrn.createdAt, todayDateStr)}`
                : "no doses logged yet"}
            </span>
            <button
              type="button"
              aria-label={`Log an as-needed dose of ${prescription.genericName}`}
              onClick={() => setPrnPickerOpen(true)}
              disabled={logPrn.isPending}
              className="inline-flex min-h-9 shrink-0 items-center border border-meds px-2 text-xs font-semibold text-meds hover:bg-meds/10 disabled:opacity-50"
            >
              Log dose
            </button>
          </div>
        )}

        {/* Active brand — tap to open that box */}
        {activeInventory && (
          <button
            type="button"
            aria-label={`${activeInventory.brandName}, active brand. Open the box`}
            onClick={() => setMedDrawerOpen(true)}
            className={cn(
              "mx-2 mb-2 grid min-h-11 min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-[3px] px-2 py-1.5 text-left",
              "border border-[color-mix(in_srgb,hsl(var(--weight))_50%,hsl(var(--line)))] bg-weight/9",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <PillIcon
              shape={activeInventory.pillShape ?? "round"}
              color={activeInventory.pillColor ?? "#94a3b8"}
              size={18}
            />
            <b className="text-xs font-semibold leading-tight [overflow-wrap:anywhere]">
              {activeInventory.brandName}
            </b>
            <span className="whitespace-nowrap font-mono text-[0.6875rem] text-muted-foreground">
              {brandStrength}
            </span>
            {brandDoseLine && (
              <span className="col-span-full text-[0.6875rem] leading-snug text-muted-foreground">
                {brandDoseLine}
              </span>
            )}
          </button>
        )}
      </div>

      {expanded && (
        <CompoundCardExpanded prescription={prescription}>
          {/* Recent as-needed doses, each removable (first tap arms, second
              tap confirms). Removing one also puts its pills back in stock. */}
          {isAsNeeded && prnLogs.length > 0 && (
            <div>
              <p className="mb-1.5 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground">
                RECENT DOSES
              </p>
              <ul aria-label="Recent as-needed doses">
                {prnLogs.slice(0, PRN_LIST_MAX).map((log) => {
                  const when = formatPrnWhen(log.actionTimestamp ?? log.createdAt, todayDateStr);
                  const armed = confirmUndoId === log.id;
                  return (
                    <li
                      key={log.id}
                      className="flex min-h-11 items-center justify-between gap-2 border-t border-line/60 text-[0.8125rem] first:border-t-0"
                    >
                      <span className="font-mono text-muted-foreground">{when}</span>
                      <button
                        type="button"
                        aria-label={armed ? `Confirm undo as-needed dose at ${when}` : `Undo as-needed dose at ${when}`}
                        disabled={undoPrn.isPending}
                        onClick={() => {
                          if (armed) handleUndoPrn(log.id);
                          else setConfirmUndoId(log.id);
                        }}
                        className={cn(
                          "inline-flex min-h-9 items-center border px-2.5 text-[0.8125rem] font-medium disabled:opacity-50",
                          armed ? "border-bp text-bp" : "border-input hover:bg-foreground/6",
                        )}
                      >
                        {armed ? "Remove?" : "Undo"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CompoundCardExpanded>
      )}

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
    </div>
  );
}

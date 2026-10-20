"use client";

import { useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@intake/ui/drawer";
import { Button } from "@intake/ui/button";
import { PillIcon } from "@/components/medications/pill-icon";
import { PrescriptionViewDrawer } from "@/components/medications/edit-medication-drawer";
import { useLastTakenDose } from "@/hooks/use-medication-queries";
import {
  doseDisplayName,
  doseStatusLine,
  formatDoseAmount,
  formatDoseDate,
  formatDoseInstant,
  formatDoseTime,
  formatPillCount,
  isRescheduledSlot,
} from "@/lib/medication-ui-utils";
import { isCombo, formatComboDose, formatCompoundFull } from "@intake/core/compound";
import { isOpenDoseStatus, needsTakenTimePrompt, type SlotDay } from "@intake/core/dose-rules";
import { Info, X, RotateCcw, Clock, Calendar, Check, Pencil, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { toLocalDateKey } from "@/lib/date-utils";
import { useSettingsStore } from "@/stores/settings-store";
import type { DoseActions } from "@/components/medications/use-dose-actions";
import type { DoseSlot } from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";

interface DoseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dose, read live from the schedule (not a snapshot from the tap). */
  slot: DoseSlot | null;
  day: SlotDay;
  now: number;
  actions: DoseActions;
  /** Info: open "About this medicine". */
  onOpenInfo?: (prescriptionId: string) => void;
}

const LONG_PRESS_MS = 500;

/** "08:31, yesterday" / "08:31, Oct 12". */
function lastTakenLabel(timestamp: number, now: number): string {
  const day = toLocalDateKey(timestamp);
  const today = toLocalDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const when =
    day === today
      ? "today"
      : day === toLocalDateKey(yesterday)
        ? "yesterday"
        : new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${formatDoseInstant(timestamp)}, ${when}`;
}

/**
 * The dose dialog: opens from any row, any status, any day. Info and Edit
 * in the header; the status, the warning for a late open dose, the
 * schedule, the dose, the pills left and the last taken time; then the
 * actions for the dose's state (Skip / Take / Reschedule when open, Untake
 * and Change time when taken, Unskip / Take / Reschedule when skipped). A
 * dose of a future day can only be rescheduled. A rescheduled dose shows its
 * new time and "Cancel reschedule".
 */
export function DoseDetailDialog({
  open,
  onOpenChange,
  slot,
  day,
  now,
  actions,
  onOpenInfo,
}: DoseDetailDialogProps) {
  // The medicine being edited. Kept apart from `slot`: an "Apply from" save
  // can replace the dose's schedule row, and the drawer must stay open.
  const [editing, setEditing] = useState<Prescription | null>(null);
  const lateWindow = useSettingsStore((s) => s.lateWindowMinutes);
  const lastTaken = useLastTakenDose(slot?.prescriptionId, slot?.existingLog?.id);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const [closeWhenFree, setCloseWhenFree] = useState(false);
  const sheetOpen = actions.sheetOpen;

  useEffect(() => {
    if (!closeWhenFree || sheetOpen) return;
    setCloseWhenFree(false);
    onOpenChange(false);
  }, [closeWhenFree, sheetOpen, onOpenChange]);

  const editDrawer = editing && (
    <PrescriptionViewDrawer
      prescription={editing}
      open
      onOpenChange={(o) => {
        if (!o) setEditing(null);
      }}
    />
  );

  if (!slot) return editDrawer || null;

  const { status, prescription, phase, schedule, inventory } = slot;
  const name = doseDisplayName(slot);
  const isFuture = day === "future";
  const open_ = isOpenDoseStatus(status);
  const statusLine = doseStatusLine(slot, now);
  const rescheduled = isRescheduledSlot(slot);
  const late = !isFuture && open_ && needsTakenTimePrompt(slot.dueAt, now, lateWindow);

  // Close only after a write; a cancelled sheet keeps the dialog open. A
  // sheet still open over the dialog (the skip reason) closes first.
  const finish = (outcome: Awaited<ReturnType<DoseActions["take"]>>) => {
    if (outcome !== "cancelled" && outcome !== "failed") setCloseWhenFree(true);
  };

  const handleTake = async (ask = false) => finish(await actions.take([slot], { single: true, ask }));
  const handleSkip = async () => finish(await actions.skip([slot], { single: true }));
  const handleUntake = async () => finish(await actions.untake([slot]));
  const handleUnskip = async () => finish(await actions.unskip([slot]));
  const handleChangeTime = async () => finish(await actions.changeTime(slot));
  const handleReschedule = async () => finish(await actions.reschedule([slot], { single: true }));
  const handleCancelReschedule = async () => finish(await actions.cancelReschedule(slot));

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  // Strength shown next to the name in the header: the scheduled dose, per
  // compound for a combination drug.
  const headerStrength = formatComboDose(schedule.dosage, phase.unit, inventory);
  // Any open or skipped dose of any day can be moved; a taken one is untaken first.
  const canReschedule = status !== "taken";
  // "Cancel reschedule" while the log still holds a reschedule.
  const canCancelReschedule = slot.existingLog?.status === "rescheduled" && status !== "taken" && status !== "skipped";

  const takeButton = (
    <Button
      onPointerDown={() => {
        longPressed.current = false;
        clearPress();
        pressTimer.current = setTimeout(() => {
          longPressed.current = true;
          void handleTake(true);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearPress}
      onPointerLeave={clearPress}
      onPointerCancel={clearPress}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!longPressed.current) {
          longPressed.current = true;
          clearPress();
          void handleTake(true);
        }
      }}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        void handleTake();
      }}
    >
      <Check aria-hidden="true" />
      <span>Take</span>
    </Button>
  );

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent data-domain="meds" className="max-h-[85vh] bg-panel md:mx-auto md:w-full md:max-w-lg" aria-describedby={undefined}>
          <div className="px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
            <div className="mb-4 grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line pb-3">
              <PillIcon shape={inventory?.pillShape || "round"} color={inventory?.pillColor || "#ccc"} size={48} />
              <div className="min-w-0">
                <DrawerTitle className="text-base font-semibold leading-snug">
                  {name} {headerStrength}
                </DrawerTitle>
                {name !== prescription.genericName && (
                  <p className="text-[0.8125rem] text-muted-foreground">{prescription.genericName}</p>
                )}
                {statusLine && (
                  <p
                    data-testid="dialog-status"
                    className={cn(
                      "mt-0.5 text-[0.8125rem] font-semibold",
                      status === "taken" && "text-meds",
                      status === "skipped" && "text-muted-foreground",
                      status === "missed" && "text-sodium",
                      rescheduled && "text-meds",
                    )}
                  >
                    {statusLine}
                  </p>
                )}
              </div>
              <div className="flex items-center">
                {onOpenInfo && (
                  <button
                    type="button"
                    aria-label={`About ${prescription.genericName}`}
                    onClick={() => {
                      onOpenChange(false);
                      onOpenInfo(prescription.id);
                    }}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
                  >
                    <Info className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Edit ${prescription.genericName}`}
                  onClick={() => setEditing(prescription)}
                  className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
                >
                  <Pencil className="h-5 w-5" />
                </button>
              </div>
            </div>

            {late && (
              <p className="mb-3 border-l-2 border-sodium pl-2 text-[0.8125rem] text-sodium" data-testid="late-warning">
                You have not marked this dose. Consider if it is safe to take it now.
              </p>
            )}

            <div className="mb-4 space-y-2 text-sm text-muted-foreground [&_svg]:shrink-0">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  Scheduled for {formatDoseTime(slot.localTime)}, {formatDoseDate(slot.scheduledDate)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                <span>
                  {formatDoseAmount(slot)}
                  {phase.foodInstruction === "before" && " · before food"}
                  {phase.foodInstruction === "after" && " · with food"}
                  {phase.foodNote && ` · ${phase.foodNote}`}
                </span>
              </div>
              {isCombo(inventory) && (
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  <span>
                    {inventory!.brandName}: {formatCompoundFull(inventory!.compounds, phase.unit)} per pill
                  </span>
                </div>
              )}
              {phase.notes && (
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  <span>{phase.notes}</span>
                </div>
              )}
              {inventory?.currentStock != null && (
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <span>{formatPillCount(inventory.currentStock, "pill")} left</span>
                </div>
              )}
              {lastTaken?.actionTimestamp != null && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Last taken at {lastTakenLabel(lastTaken.actionTimestamp, now)}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-2">
              {!isFuture && open_ && (
                <Button variant="outline" onClick={handleSkip}>
                  <X aria-hidden="true" />
                  <span>Skip</span>
                </Button>
              )}
              {!isFuture && status === "skipped" && (
                <Button variant="outline" onClick={handleUnskip}>
                  <RotateCcw aria-hidden="true" />
                  <span>Unskip</span>
                </Button>
              )}
              {status === "taken" ? (
                <Button variant="outline" onClick={handleUntake} className="border-bp text-bp hover:text-bp">
                  <RotateCcw aria-hidden="true" />
                  <span>Untake</span>
                </Button>
              ) : (
                !isFuture && takeButton
              )}
              {canReschedule && (
                <Button variant="outline" onClick={handleReschedule}>
                  <Clock aria-hidden="true" />
                  <span>Reschedule</span>
                </Button>
              )}
            </div>

            {status === "taken" && (
              <Button variant="ghost" className="mt-1 h-9 w-full" onClick={handleChangeTime}>
                Change time
              </Button>
            )}

            {canCancelReschedule && (
              <Button variant="ghost" className="mt-1 h-9 w-full" onClick={handleCancelReschedule}>
                Cancel reschedule
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {editDrawer}
    </>
  );
}

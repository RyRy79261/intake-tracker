"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@intake/ui/button";
import { PillIcon } from "@/components/medications/pill-icon";
import { Bdg, MLabel } from "@/components/medications/ward-bits";
import { formatPillCount, getEffectivePhase } from "@/lib/medication-ui-utils";
import { isCombo, formatCompoundShort, formatComboDose, formatCompoundFull } from "@intake/core/compound";
import {
  useInventoryForPrescription,
  usePhasesForPrescription,
  useSchedulesForPhase,
  useDailyDoseSchedule,
  type DoseSlot,
} from "@/hooks/use-medication-queries";
import { BrandSwitchPicker } from "@/components/medications/brand-switch-picker";
import { PrescriptionViewDrawer } from "@/components/medications/edit-medication-drawer";
import { InventoryItemViewDrawer } from "@/components/medications/inventory-item-view-drawer";
import type { InventoryItem, Prescription } from "@/lib/db";
import { toLocalDateKey } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { ArrowRightLeft, Check, ChevronRight, Pencil, X } from "lucide-react";

interface CompoundCardExpandedProps {
  prescription: Prescription;
  /** Extra blocks rendered before the actions (the card's as-needed log). */
  children?: ReactNode;
}

function getTodayDateStr(): string {
  return toLocalDateKey();
}

const STATUS_WORD: Record<DoseSlot["status"], string> = {
  taken: "Taken",
  skipped: "Skipped",
  pending: "Pending",
  missed: "Missed",
};

function clock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The expanded part of an Rx card (the prototype's `.rxx`): the prescription's
 * boxes, its schedule, today's doses and the Switch Brand / Prescription
 * Details actions.
 */
export function CompoundCardExpanded({ prescription, children }: CompoundCardExpandedProps) {
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const inventoryItems = useInventoryForPrescription(prescription.id);
  const phases = usePhasesForPrescription(prescription.id);
  const effectivePhase = getEffectivePhase(phases);
  const schedules = useSchedulesForPhase(effectivePhase?.id);

  const todayDateStr = getTodayDateStr();
  const allSlots = useDailyDoseSchedule(todayDateStr);
  const slotsArray: DoseSlot[] = allSlots ?? [];
  const prescriptionSlots = slotsArray.filter(
    (s) => s.prescriptionId === prescription.id
  );

  // Sort inventory: active first, then alphabetically
  const sortedInventory = [...inventoryItems]
    .filter((item) => !item.isArchived)
    .sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return a.brandName.localeCompare(b.brandName);
    });

  const hasMultipleBrands = sortedInventory.length > 1;

  // For a combination drug, label a summed mg dose per compound from the
  // active brand's tablets; with no combo brand stocked, show the summed dose.
  const activeBrand = sortedInventory.find((item) => item.isActive);
  const fmtDose = (mg: number, unit: string, brand = activeBrand) =>
    formatComboDose(mg, unit, brand);

  const scheduleLines = (() => {
    if (!effectivePhase || schedules.length === 0) return null;
    const first = schedules[0];
    const allSameDosage = schedules.every((s) => s.dosage === first?.dosage);
    if (allSameDosage && first) {
      const times = schedules.map((s) => s.time).join(", ");
      const freq = schedules.length === 1 ? "daily" : schedules.length === 2 ? "twice daily" : `${schedules.length}x daily`;
      return [
        { key: "all", dose: `${fmtDose(first.dosage, effectivePhase.unit)} ${freq}`, at: `at ${times}` },
      ];
    }
    return schedules.map((s) => ({ key: s.id, dose: fmtDose(s.dosage, effectivePhase.unit), at: `at ${s.time}` }));
  })();

  return (
    <div className="flex flex-col gap-3.5 border-t border-line px-2.5 py-3 text-sm leading-[1.45]">
      {/* Medicines (boxes) — tap a row to open that box */}
      <div>
        <MLabel>Medicines</MLabel>
        {sortedInventory.length === 0 ? (
          <p className="text-[0.8125rem] text-muted-foreground">No medicines added yet</p>
        ) : (
          <div className="border border-line">
            {sortedInventory.map((item) => {
              const stock = item.currentStock ?? 0;
              const isLow =
                item.refillAlertPills !== undefined &&
                stock <= item.refillAlertPills &&
                stock >= 0;
              const isNegative = stock < 0;
              const stockText = formatPillCount(stock, "pill");

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className={cn(
                    "grid min-h-[52px] w-full grid-cols-[30px_minmax(0,1fr)_auto_16px] items-center gap-2.5 border-t border-line bg-panel px-2.5 py-1.5 text-left first:border-t-0",
                    "hover:bg-foreground/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                    item.isActive && "shadow-[inset_3px_0_0_hsl(var(--meds))]",
                  )}
                >
                  <PillIcon
                    shape={item.pillShape ?? "round"}
                    color={item.pillColor ?? "#94a3b8"}
                    size={28}
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold leading-snug">
                      {item.brandName}
                      {item.isActive && <Bdg tone="weight" kind="fill">Active</Bdg>}
                    </span>
                    <span className="block text-xs leading-snug text-muted-foreground">
                      {isCombo(item)
                        ? formatCompoundShort(item.compounds, item.unit)
                        : `${item.strength}${item.unit}`}{" "}
                      per pill
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-[3px] whitespace-nowrap text-right font-mono text-[0.8125rem]">
                    <span className={cn(isNegative && "font-semibold text-bp")}>{stockText}</span>
                    {isLow && <Bdg tone="sodium" kind="tint">Low</Bdg>}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Combination pills: the reference dose that fixes the ratio */}
      {isCombo(prescription) && (
        <div>
          <MLabel>Compounds</MLabel>
          <p>{formatCompoundFull(prescription.compounds, effectivePhase?.unit ?? "mg")}</p>
          <p className="text-[0.8125rem] text-muted-foreground">Reference dose; each box keeps this ratio.</p>
        </div>
      )}

      {/* Schedule summary */}
      <div>
        <MLabel>
          Schedule
          {effectivePhase?.type === "titration" && <Bdg tone="sodium" kind="fill">On titration</Bdg>}
        </MLabel>
        {!effectivePhase ? (
          <p>As needed</p>
        ) : scheduleLines ? (
          scheduleLines.map((l) => (
            <p key={l.key}>
              <span className="font-medium">{l.dose}</span>{" "}
              <span className="text-muted-foreground">{l.at}</span>
            </p>
          ))
        ) : (
          <p className="text-[0.8125rem] text-muted-foreground">No schedules configured</p>
        )}
        {effectivePhase && effectivePhase.foodInstruction !== "none" && (
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
            {effectivePhase.foodInstruction === "before"
              ? "Take before eating"
              : effectivePhase.foodInstruction === "after"
              ? "Take after eating"
              : effectivePhase.foodInstruction}
          </p>
        )}
        {prescription.notes && (
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{prescription.notes}</p>
        )}
      </div>

      {/* Today's doses */}
      {effectivePhase && prescription.isActive && (
        <div>
          <MLabel>Today</MLabel>
          {prescriptionSlots.length === 0 ? (
            <p className="text-[0.8125rem] text-muted-foreground">No doses today</p>
          ) : (
            prescriptionSlots.map((slot) => (
              <div
                key={`${slot.scheduleId}-${slot.scheduledDate}`}
                data-status={slot.status}
                className="grid min-h-[34px] grid-cols-[18px_3.2em_minmax(0,1fr)_auto] items-center gap-2 border-t border-line/60 text-[0.8125rem] first:border-t-0"
              >
                {slot.status === "taken" ? (
                  <Check className="h-4 w-4 text-weight" aria-hidden="true" />
                ) : slot.status === "skipped" ? (
                  <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn("mx-auto h-2.5 w-2.5 border", slot.status === "missed" ? "border-sodium bg-sodium/30" : "border-muted-foreground")}
                  />
                )}
                <span className="font-mono text-muted-foreground">{slot.localTime}</span>
                <span className="min-w-0">{fmtDose(slot.dosageMg, slot.unit, slot.inventory)}</span>
                <span className={cn("whitespace-nowrap text-right", slot.status === "missed" ? "text-sodium" : "text-muted-foreground")}>
                  {slot.status === "taken" && slot.existingLog?.actionTimestamp
                    ? `Taken ${clock(slot.existingLog.actionTimestamp)}`
                    : STATUS_WORD[slot.status]}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {children}

      {/* Actions */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
        {hasMultipleBrands && (
          <Button variant="outline" onClick={() => setBrandPickerOpen(true)}>
            <ArrowRightLeft aria-hidden="true" />
            Switch Brand
          </Button>
        )}
        <Button variant="outline" onClick={() => setDetailDrawerOpen(true)}>
          <Pencil aria-hidden="true" />
          Prescription Details
        </Button>
      </div>

      {/* Dialogs / Drawers */}
      <BrandSwitchPicker
        open={brandPickerOpen}
        onOpenChange={setBrandPickerOpen}
        prescriptionId={prescription.id}
      />
      <PrescriptionViewDrawer
        prescription={prescription}
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
      />
      <InventoryItemViewDrawer
        item={selectedItem}
        prescription={prescription}
        open={selectedItem !== null}
        onOpenChange={(open) => { if (!open) setSelectedItem(null); }}
      />
    </div>
  );
}

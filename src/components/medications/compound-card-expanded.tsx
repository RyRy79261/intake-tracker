"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PillIcon } from "@/components/medications/pill-icon";
import { formatPillCount, getEffectivePhase } from "@/lib/medication-ui-utils";
import { isCombo, splitDose, formatCompoundShort } from "@/lib/compound-utils";
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
import { ArrowRightLeft, ChevronRight, SlidersHorizontal, Clock, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

interface CompoundCardExpandedProps {
  prescription: Prescription;
}

function getTodayDateStr(): string {
  return toLocalDateKey();
}

export function CompoundCardExpanded({ prescription }: CompoundCardExpandedProps) {
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

  // For a combination drug, render a summed mg dose as its per-compound split.
  const comboPrescription = isCombo(prescription);
  const fmtDose = (mg: number, unit: string) =>
    comboPrescription
      ? formatCompoundShort(splitDose(mg, prescription.compounds), unit)
      : `${mg}${unit}`;

  const openItem = (item: InventoryItem) => {
    setSelectedItem(item);
  };

  return (
    <div
      className="pt-3 space-y-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-t" />

      {/* Section 1: Medicines (inventory) — tap a row to see that brand */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Medicines
        </h4>
        {sortedInventory.length === 0 ? (
          <p className="text-xs text-muted-foreground">No medicines added yet</p>
        ) : (
          <div className="space-y-1.5">
            {sortedInventory.map((item) => {
              const stock = item.currentStock ?? 0;
              const isLow =
                item.refillAlertPills !== undefined &&
                stock <= item.refillAlertPills &&
                stock >= 0;
              const isNegative = stock < 0;
              const isFractional = stock % 1 !== 0;
              const stockText = isFractional
                ? formatPillCount(stock)
                : `${stock} pills`;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors w-full text-left"
                >
                  <PillIcon
                    shape={item.pillShape ?? "round"}
                    color={item.pillColor ?? "#94a3b8"}
                    size={24}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">
                        {item.brandName}
                      </span>
                      {item.isActive && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                        >
                          Active
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {isCombo(item)
                        ? formatCompoundShort(item.compounds, item.unit)
                        : `${item.strength}${item.unit}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-xs ${
                        isNegative
                          ? "text-red-500 font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {stockText}
                    </span>
                    {isLow && (
                      <Badge className="text-[10px] px-1 py-0 bg-amber-500 hover:bg-amber-600 text-white">
                        Low
                      </Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Schedule Summary */}
      {effectivePhase && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            Schedule
            {effectivePhase.type === "titration" && (
              <Badge className="text-[9px] px-1 py-0 bg-amber-500 hover:bg-amber-600 text-white">
                On titration
              </Badge>
            )}
          </h4>
          <div className="space-y-1">
            {schedules.length > 0 ? (
              (() => {
                const allSameDosage = schedules.every(s => s.dosage === schedules[0]?.dosage);
                if (allSameDosage && schedules[0]) {
                  const times = schedules.map(s => s.time).join(", ");
                  const freq = schedules.length === 1 ? "daily" : schedules.length === 2 ? "twice daily" : `${schedules.length}x daily`;
                  return (
                    <div className="flex items-center gap-2 text-xs">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">
                        {fmtDose(schedules[0].dosage, effectivePhase.unit)} {freq}
                      </span>
                      <span className="text-muted-foreground">at {times}</span>
                    </div>
                  );
                }
                return schedules.map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="font-medium">{fmtDose(s.dosage, effectivePhase.unit)}</span>
                    <span className="text-muted-foreground">at {s.time}</span>
                  </div>
                ));
              })()
            ) : (
              <p className="text-xs text-muted-foreground">
                No schedules configured
              </p>
            )}
            {effectivePhase.foodInstruction !== "none" && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {effectivePhase.foodInstruction === "before"
                  ? "Take before eating"
                  : effectivePhase.foodInstruction === "after"
                  ? "Take after eating"
                  : effectivePhase.foodInstruction}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Section 3: Today's Dose Status */}
      {prescriptionSlots.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Today
          </h4>
          <div className="space-y-1">
            {prescriptionSlots.map((slot) => (
              <div
                key={`${slot.scheduleId}-${slot.scheduledDate}`}
                className="flex items-center gap-2 text-xs"
              >
                {slot.status === "taken" && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                )}
                {slot.status === "skipped" && (
                  <XCircle className="w-3.5 h-3.5 text-gray-400" />
                )}
                {slot.status === "pending" && (
                  <MinusCircle className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                {slot.status === "missed" && (
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span className="text-muted-foreground">{slot.localTime}</span>
                <span className="text-muted-foreground">
                  {fmtDose(slot.dosageMg, slot.unit)}
                </span>
                <span
                  className={`ml-auto text-[10px] font-medium ${
                    slot.status === "taken"
                      ? "text-emerald-500"
                      : slot.status === "skipped"
                      ? "text-gray-400"
                      : slot.status === "missed"
                      ? "text-amber-500"
                      : "text-muted-foreground"
                  }`}
                >
                  {slot.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {hasMultipleBrands && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={(e) => { e.stopPropagation(); setBrandPickerOpen(true); }}
          >
            <ArrowRightLeft className="w-3 h-3" />
            Switch Brand
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={(e) => { e.stopPropagation(); setDetailDrawerOpen(true); }}
        >
          <SlidersHorizontal className="w-3 h-3" />
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

"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PillIcon } from "@/components/medications/pill-icon";
import { formatPillCount } from "@/lib/medication-ui-utils";
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
import type { Prescription } from "@/lib/db";
import { ArrowRightLeft, Edit2, Package, Clock, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

interface CompoundCardExpandedProps {
  prescription: Prescription;
  onClose: () => void;
}

function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function CompoundCardExpanded({ prescription, onClose }: CompoundCardExpandedProps) {
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [inventoryDrawerOpen, setInventoryDrawerOpen] = useState(false);

  const inventoryItems = useInventoryForPrescription(prescription.id);
  const phases = usePhasesForPrescription(prescription.id);
  const activePhase = phases.find((p) => p.status === "active");
  const schedules = useSchedulesForPhase(activePhase?.id);

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

  return (
    <div
      className="pt-3 space-y-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-t" />

      {/* Section 1: Inventory Items */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Inventory
        </h4>
        {sortedInventory.length === 0 ? (
          <p className="text-xs text-muted-foreground">No inventory items</p>
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
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/30"
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
                      {item.strength}{item.unit}
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Schedule Summary */}
      {activePhase && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Schedule
          </h4>
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${
                  activePhase.type === "titration"
                    ? "border-amber-500 text-amber-600 dark:text-amber-400"
                    : "border-blue-500 text-blue-600 dark:text-blue-400"
                }`}
              >
                {activePhase.type === "titration" ? "Titration" : "Maintenance"}
              </Badge>
              {activePhase.foodInstruction !== "none" && (
                <span className="text-[10px] text-muted-foreground">
                  {activePhase.foodInstruction === "before"
                    ? "Take before eating"
                    : activePhase.foodInstruction === "after"
                    ? "Take after eating"
                    : activePhase.foodInstruction}
                </span>
              )}
            </div>
            {schedules.length > 0 ? (
              schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <Clock className="w-3 h-3" />
                  <span>
                    {s.time} — {s.dosage}
                    {activePhase.unit}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                No schedules configured
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
                  {slot.dosageMg}
                  {slot.unit}
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
            onClick={() => setBrandPickerOpen(true)}
          >
            <ArrowRightLeft className="w-3 h-3" />
            Switch Brand
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setEditDrawerOpen(true)}
        >
          <Edit2 className="w-3 h-3" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setInventoryDrawerOpen(true)}
        >
          <Package className="w-3 h-3" />
          Inventory
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
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
      />
      <InventoryItemViewDrawer
        prescription={prescription}
        open={inventoryDrawerOpen}
        onOpenChange={setInventoryDrawerOpen}
      />
    </div>
  );
}

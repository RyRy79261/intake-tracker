"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompoundCardExpanded } from "@/components/medications/compound-card-expanded";
import { ChevronDown } from "lucide-react";
import { PillIconWithBadge } from "@/components/medications/pill-icon";
import { formatPillCount } from "@/lib/medication-ui-utils";
import {
  usePhasesForPrescription,
  useInventoryForPrescription,
  useDailyDoseSchedule,
} from "@/hooks/use-medication-queries";
import type { Prescription } from "@/lib/db";

interface PrescriptionCardProps {
  prescription: Prescription;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  className?: string;
}

function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function PrescriptionCard({ prescription, expanded: controlledExpanded, onToggleExpanded, className }: PrescriptionCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = controlledExpanded ?? internalExpanded;
  const toggleExpanded = onToggleExpanded ?? (() => setInternalExpanded((v) => !v));

  const todayDateStr = getTodayDateStr();
  const phases = usePhasesForPrescription(prescription.id);
  const inventoryItems = useInventoryForPrescription(prescription.id);
  const allSlots = useDailyDoseSchedule(todayDateStr);

  const activePhase = phases.find((p) => p.status === "active");
  const hasPendingPhase = phases.some((p) => p.status === "pending");
  const activeInventory = inventoryItems.find((item) => item.isActive && !item.isArchived);

  const slotsArray = allSlots ?? [];
  const prescriptionSlots = slotsArray.filter(
    (s) => s.prescriptionId === prescription.id
  );

  const firstSlot = prescriptionSlots.length > 0 ? prescriptionSlots[0] : undefined;
  const dosageMg = firstSlot?.dosageMg;
  const unit = activePhase?.unit ?? "mg";

  const pendingSlots = prescriptionSlots.filter((s) => s.status === "pending");
  const allHandled = prescriptionSlots.length > 0 && pendingSlots.length === 0;
  const firstPending = pendingSlots.length > 0 ? pendingSlots[0] : undefined;
  const nextDoseTime = firstPending?.localTime ?? null;

  const isAsNeeded = !activePhase;

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

  const currentStock = activeInventory?.currentStock ?? 0;
  const isFractional = currentStock % 1 !== 0;
  const stockDisplay = isFractional
    ? formatPillCount(currentStock)
    : `${currentStock} pills`;

  const uniqueTimes = new Set(prescriptionSlots.map(s => s.localTime));
  const timesPerDay = uniqueTimes.size;
  const pillLabel = firstSlot?.pillsPerDose != null
    ? formatPillCount(firstSlot.pillsPerDose)
    : dosageMg !== undefined ? `${dosageMg}${unit}` : null;

  const frequencyLabel = timesPerDay > 0
    ? `${timesPerDay}x per day`
    : isAsNeeded ? "As needed" : "No schedule";

  const isNegativeStock = activeInventory && currentStock < 0;
  const isLowStock =
    activeInventory &&
    !isNegativeStock &&
    activeInventory.refillAlertPills !== undefined &&
    currentStock <= activeInventory.refillAlertPills;

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
          {pillLabel && (
            <span className="text-[10px] text-muted-foreground">
              {pillLabel}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {frequencyLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-wrap mt-1">
          {hasPendingPhase && (
            <Badge className="text-[9px] px-1 py-0 bg-blue-500 hover:bg-blue-600 text-white">
              Titration
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
        </div>

        {/* Active medication mini-card — always visible */}
        {activeInventory && (
          <div className="mt-1.5 p-1.5 rounded-md bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-1.5">
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
                  {activeInventory.strength}{activeInventory.unit}
                </span>
              </div>
              {firstSlot?.pillsPerDose != null && dosageMg != null && (
                <p className="text-[9px] text-emerald-600 dark:text-emerald-400">
                  {formatPillCount(firstSlot.pillsPerDose)} ({dosageMg}{unit})
                  {activePhase?.foodInstruction && activePhase.foodInstruction !== "none" && ` · ${activePhase.foodInstruction} eating`}
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
              <CompoundCardExpanded
                prescription={prescription}
                onClose={toggleExpanded}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}


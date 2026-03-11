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

interface CompoundCardProps {
  prescription: Prescription;
}

function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function CompoundCard({ prescription }: CompoundCardProps) {
  const [expanded, setExpanded] = useState(false);

  const todayDateStr = getTodayDateStr();
  const phases = usePhasesForPrescription(prescription.id);
  const inventoryItems = useInventoryForPrescription(prescription.id);
  const allSlots = useDailyDoseSchedule(todayDateStr);

  // Active phase for this prescription
  const activePhase = phases.find((p) => p.status === "active");

  // Active inventory item (first active, non-archived)
  const activeInventory = inventoryItems.find((item) => item.isActive && !item.isArchived);

  // Dose info from active phase schedules
  const slotsArray = allSlots ?? [];
  const prescriptionSlots = slotsArray.filter(
    (s) => s.prescriptionId === prescription.id
  );

  // Prescribed dose: use dosageMg from the first slot if available
  const firstSlot = prescriptionSlots.length > 0 ? prescriptionSlots[0] : undefined;
  const dosageMg = firstSlot?.dosageMg;
  const unit = activePhase?.unit ?? "mg";

  // Next dose status
  const pendingSlots = prescriptionSlots.filter((s) => s.status === "pending");
  const allHandled = prescriptionSlots.length > 0 && pendingSlots.length === 0;
  const firstPending = pendingSlots.length > 0 ? pendingSlots[0] : undefined;
  const nextDoseTime = firstPending?.localTime ?? null;

  let nextDoseLabel: string;
  if (prescriptionSlots.length === 0) {
    nextDoseLabel = "No doses today";
  } else if (allHandled) {
    nextDoseLabel = "All done";
  } else if (nextDoseTime) {
    nextDoseLabel = `Next: ${nextDoseTime}`;
  } else {
    nextDoseLabel = "No doses today";
  }

  // Stock info
  const currentStock = activeInventory?.currentStock ?? 0;
  const isFractional = currentStock % 1 !== 0;
  const stockDisplay = isFractional
    ? formatPillCount(currentStock)
    : `${currentStock} pills`;

  // Low/negative stock badges
  const isNegativeStock = activeInventory && currentStock < 0;
  const isLowStock =
    activeInventory &&
    !isNegativeStock &&
    activeInventory.refillAlertPills !== undefined &&
    currentStock <= activeInventory.refillAlertPills;

  // Pill icon defaults
  const pillShape = activeInventory?.pillShape ?? "round";
  const pillColor = activeInventory?.pillColor ?? "#94a3b8";

  return (
    <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.1 }}>
      <Card
        className="p-3 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {/* Left: Pill icon */}
          <PillIconWithBadge
            shape={pillShape}
            color={pillColor}
            size={36}
          />

          {/* Center: Name and dose */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">
              {prescription.genericName}
            </h3>
            <div className="flex items-center gap-2">
              {dosageMg !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {dosageMg}{unit}
                </span>
              )}
              {activeInventory && (
                <span className="text-xs text-muted-foreground">
                  {activeInventory.brandName}
                </span>
              )}
            </div>
          </div>

          {/* Right: Stock + next dose + chevron */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            {activeInventory && (
              <span className="text-xs text-muted-foreground">
                {stockDisplay}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {nextDoseLabel}
            </span>
            {isNegativeStock && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                Negative stock
              </Badge>
            )}
            {isLowStock && (
              <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-600 text-white">
                Low stock
              </Badge>
            )}
          </div>

          {/* Chevron indicator */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0"
          >
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </div>

        {/* Expanded content */}
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
                onClose={() => setExpanded(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

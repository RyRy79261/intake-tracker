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
  useSchedulesForPhase,
} from "@/hooks/use-medication-queries";
import type { Prescription, InventoryItem, MedicationPhase } from "@/lib/db";

interface PrescriptionCardProps {
  prescription: Prescription;
}

function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function PrescriptionCard({ prescription }: PrescriptionCardProps) {
  const [expanded, setExpanded] = useState(false);

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

  const isNegativeStock = activeInventory && currentStock < 0;
  const isLowStock =
    activeInventory &&
    !isNegativeStock &&
    activeInventory.refillAlertPills !== undefined &&
    currentStock <= activeInventory.refillAlertPills;

  return (
    <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.1 }}>
      <Card
        className="p-2.5 cursor-pointer hover:bg-muted/40 transition-colors h-full"
        onClick={() => setExpanded(!expanded)}
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
          {dosageMg !== undefined && (
            <span className="text-[10px] text-muted-foreground">
              {dosageMg}{unit}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {nextDoseLabel}
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

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {/* Active medication sub-component slot */}
              {activeInventory && (
                <ActiveMedicationSlot
                  item={activeInventory}
                  phase={activePhase}
                  stockDisplay={stockDisplay}
                />
              )}
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

function ActiveMedicationSlot({
  item,
  phase,
  stockDisplay,
}: {
  item: InventoryItem;
  phase: MedicationPhase | undefined;
  stockDisplay: string;
}) {
  const schedules = useSchedulesForPhase(phase?.id);

  const dailyDosage = phase && schedules.length > 0
    ? schedules.reduce((acc, s) => acc + s.dosage, 0)
    : undefined;

  const pillsPerDose = phase && schedules.length > 0 && item.strength > 0
    ? (schedules[0]?.dosage ?? 0) / item.strength
    : undefined;

  return (
    <div className="mt-2">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider ml-1">
        Active medication
      </span>
      <div className="mt-0.5 p-2 rounded-lg bg-muted/40 border border-border/50 flex items-center gap-2.5">
        <PillIconWithBadge
          shape={item.pillShape ?? "round"}
          color={item.pillColor ?? "#94a3b8"}
          size={24}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate">{item.brandName}</span>
            <span className="text-[10px] text-muted-foreground">{item.strength}{item.unit}</span>
          </div>
          {pillsPerDose !== undefined && pillsPerDose !== 1 && (
            <span className="text-[10px] text-muted-foreground">
              {pillsPerDose < 1 ? `${pillsPerDose} pill` : `${pillsPerDose} pills`} per dose
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className="text-xs text-muted-foreground">{stockDisplay}</span>
        </div>
      </div>
    </div>
  );
}

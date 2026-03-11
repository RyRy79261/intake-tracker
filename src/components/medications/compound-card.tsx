"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PillIconWithBadge } from "@/components/medications/pill-icon";
import { formatPillCount } from "@/lib/medication-ui-utils";
import { InventoryItemViewDrawer } from "@/components/medications/inventory-item-view-drawer";
import type { InventoryItem, Prescription } from "@/lib/db";

interface MedicationCardProps {
  item: InventoryItem;
  prescription?: Prescription | undefined;
}

export function MedicationCard({ item, prescription }: MedicationCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentStock = item.currentStock ?? 0;
  const isFractional = currentStock % 1 !== 0;
  const stockDisplay = isFractional
    ? formatPillCount(currentStock)
    : `${currentStock} pills`;

  const isNegativeStock = currentStock < 0;
  const isLowStock =
    !isNegativeStock &&
    item.refillAlertPills !== undefined &&
    currentStock <= item.refillAlertPills;

  const pillShape = item.pillShape ?? "round";
  const pillColor = item.pillColor ?? "#94a3b8";

  return (
    <>
      <motion.div whileTap={{ scale: 0.98 }} transition={{ duration: 0.1 }}>
        <Card
          className="p-3 cursor-pointer hover:bg-muted/40 transition-colors"
          onClick={() => setDrawerOpen(true)}
        >
          <div className="flex items-center gap-3">
            <PillIconWithBadge shape={pillShape} color={pillColor} size={36} />

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm truncate">
                {item.brandName}
              </h3>
              <p className="text-xs text-muted-foreground">
                {item.strength}{item.unit ?? "mg"}
              </p>
              {prescription && (
                <p className="text-[11px] text-muted-foreground truncate">
                  For: {prescription.genericName}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs text-muted-foreground">{stockDisplay}</span>
              {isNegativeStock && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  Negative
                </Badge>
              )}
              {isLowStock && (
                <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-600 text-white">
                  Low
                </Badge>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      <InventoryItemViewDrawer
        prescription={prescription ?? null}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}

"use client";

import { useState } from "react";
import { PillIcon } from "@/components/medications/pill-icon";
import { Bdg } from "@/components/medications/ward-bits";
import { formatPillCount } from "@/lib/medication-ui-utils";
import { isCombo, formatCompoundShort } from "@intake/core/compound";
import { InventoryItemViewDrawer } from "@/components/medications/inventory-item-view-drawer";
import { cn } from "@/lib/utils";
import type { InventoryItem, Prescription } from "@/lib/db";

interface MedicationCardProps {
  item: InventoryItem;
  prescription?: Prescription | undefined;
}

/** A box in the Meds tab (the prototype's `.mcard`). Tap to open it. */
export function MedicationCard({ item, prescription }: MedicationCardProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentStock = item.currentStock ?? 0;
  const stockDisplay = formatPillCount(currentStock, "pill");

  const isNegativeStock = currentStock < 0;
  const isLowStock =
    !isNegativeStock &&
    item.refillAlertPills !== undefined &&
    currentStock <= item.refillAlertPills;

  const pillShape = item.pillShape ?? "round";
  const pillColor = item.pillColor ?? "#94a3b8";

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className={cn(
          "mb-1.5 grid min-h-16 w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 border border-line bg-background px-2.5 py-2 text-left",
          "hover:bg-foreground/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <PillIcon shape={pillShape} color={pillColor} size={36} />

        <span className="min-w-0">
          <span className="block font-semibold leading-snug">{item.brandName}</span>
          <span className="block text-xs leading-snug text-muted-foreground">
            {isCombo(item)
              ? formatCompoundShort(item.compounds, item.unit ?? "mg")
              : `${item.strength}${item.unit ?? "mg"}`}
          </span>
          {prescription && (
            <span className="block truncate text-xs leading-snug text-muted-foreground">
              For: {prescription.genericName}
            </span>
          )}
        </span>

        <span className="flex flex-col items-end gap-[3px] text-right">
          <span className={cn("whitespace-nowrap font-mono text-sm font-semibold", isNegativeStock && "text-bp")}>
            {stockDisplay}
          </span>
          {item.updatedAt && (
            <span className="text-xs text-muted-foreground">
              Updated {new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          {isNegativeStock && <Bdg tone="bp" kind="fill">Negative</Bdg>}
          {isLowStock && <Bdg tone="sodium" kind="tint">Low</Bdg>}
        </span>
      </button>

      <InventoryItemViewDrawer
        item={item}
        prescription={prescription ?? null}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}

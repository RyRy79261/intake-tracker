"use client";

import { useEffect, useState } from "react";
import { Input } from "@intake/ui/input";
import { cn } from "@/lib/utils";
import { isCombo } from "@intake/core/compound";
import type { InventoryItem } from "@/lib/db";
import {
  dosageToPills,
  pillsToDosage,
  previewDoseInPills,
  unitsMatch,
} from "@/lib/dose-preview";

type Brand = Pick<InventoryItem, "brandName" | "strength" | "unit" | "compounds">;

/**
 * True when a dose for this brand is entered as tablets rather than a summed
 * amount. A combination tablet's summed mg ("100" for 49/51) isn't a number
 * anyone reads off the box, so combos always take "tablets of the active
 * brand" — the same model the add-medication wizard uses.
 */
export function entersDoseAsPills(brand: Brand | undefined, unit: string): brand is Brand {
  return !!brand && isCombo(brand) && brand.strength > 0 && unitsMatch(unit, brand.unit);
}

function formatNumber(n: number): string {
  return String(Math.round(n * 10000) / 10000);
}

/**
 * Dose input for a schedule row. `dosage` is always the stored amount in
 * `unit` (summed for a combo); for a combo brand the field shows and takes
 * tablets and converts on the way in and out.
 */
export function DoseAmountInput({
  dosage,
  onDosageChange,
  unit,
  brand,
  className,
}: {
  dosage: string;
  onDosageChange: (dosage: string) => void;
  unit: string;
  brand: Brand | undefined;
  className?: string;
}) {
  const pillMode = entersDoseAsPills(brand, unit);
  const [pillsText, setPillsText] = useState("");

  // Mirror the stored dosage into the tablets field whenever it changes from
  // outside (hydration, prefill) — but not while the typed text already maps
  // to it, so "1." or "0.5" survive being typed.
  useEffect(() => {
    if (!pillMode) return;
    const typed = parseFloat(pillsText);
    const current = parseFloat(dosage);
    const typedDosage = Number.isFinite(typed) ? pillsToDosage(typed, brand) : NaN;
    if (dosage === "" ? pillsText.trim() === "" : typedDosage === current) return;
    setPillsText(
      Number.isFinite(current) ? formatNumber(dosageToPills(current, brand)) : "",
    );
    // pillsText is intentionally left out: this reacts to outside changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dosage, pillMode, brand]);

  if (pillMode) {
    return (
      <>
        <Input
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          value={pillsText}
          onChange={(e) => {
            setPillsText(e.target.value);
            const pills = parseFloat(e.target.value);
            onDosageChange(Number.isFinite(pills) ? String(pillsToDosage(pills, brand)) : "");
          }}
          placeholder="Tablets"
          aria-label="Tablets per dose"
          className={className}
        />
        <span className="text-xs text-muted-foreground">tablets</span>
      </>
    );
  }

  return (
    <>
      <Input
        type="number"
        step="any"
        min="0"
        inputMode="decimal"
        value={dosage}
        onChange={(e) => onDosageChange(e.target.value)}
        placeholder={unit}
        aria-label={`Dose in ${unit}`}
        className={className}
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </>
  );
}

/**
 * One-line "= N tablets of X" readout under a dose row, with a warning when
 * the dose isn't a whole or half tablet, or when the brand being counted
 * against is stocked in a different unit.
 */
export function DosePreviewLine({
  dosage,
  unit,
  brand,
  className,
}: {
  dosage: string;
  unit: string;
  brand: Brand | undefined;
  className?: string;
}) {
  const value = parseFloat(dosage);
  if (!brand || !Number.isFinite(value)) return null;

  if (value <= 0) {
    return (
      <p className={cn("text-[11px] text-destructive", className)}>
        Dose must be more than 0
      </p>
    );
  }
  if (!unitsMatch(unit, brand.unit)) {
    return (
      <p className={cn("text-[11px] text-amber-600 dark:text-amber-400", className)}>
        {brand.brandName} is stocked in {brand.unit}, not {unit}
      </p>
    );
  }

  const preview = previewDoseInPills(value, unit, brand);
  if (!preview) return null;
  const pillMode = entersDoseAsPills(brand, unit);
  const text = pillMode
    ? `= ${preview.split} (${formatNumber(value)}${unit} total)`
    : `= ${preview.label}`;

  return (
    <p
      className={cn(
        "text-[11px]",
        preview.clean ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400",
        className,
      )}
    >
      {text}
      {pillMode && ` · ${preview.label}`}
      {!preview.clean && " — not a whole or half tablet"}
    </p>
  );
}

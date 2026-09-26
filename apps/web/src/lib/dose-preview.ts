/**
 * Live "= N tablets of X" preview for the dose editors (schedule edit,
 * titration entry).
 *
 * Pill math divides a schedule dosage by the active brand's strength as plain
 * numbers (dose-log-service `calculatePillsConsumed`). For a combination drug
 * both numbers are the SUM of the compound strengths, which nobody thinks in —
 * the box says "49/51". These helpers let the editors take the dose as
 * tablets of the active brand and show what a typed dose really means before
 * it is saved.
 */
import type { InventoryItem } from "@/lib/db";
import { isLive } from "@intake/core/lifecycle";
import {
  isCombo,
  formatCompoundShort,
  scaleCompounds,
} from "@intake/core/compound";
import { normalizeStrengthUnit } from "@intake/core/strength";
import { calculatePillsConsumed, isCleanFraction } from "@/lib/dose-log-service";
import { formatPillCount } from "@/lib/medication-ui-utils";

type Brand = Pick<InventoryItem, "brandName" | "strength" | "unit" | "compounds">;

export interface DosePillPreview {
  /** Tablets of the brand per dose (4-decimal, as the stock deduction). */
  pills: number;
  /** e.g. `2 tablets of Entresto 49/51mg`. */
  label: string;
  /** Per-compound amounts of the whole dose (combos only), e.g. `98/102mg`. */
  split?: string;
  /** False when the dose isn't a whole, half, third or quarter tablet. */
  clean: boolean;
}

/** The brand whose strength the stock deduction divides by, if any. */
export function findActiveBrand<T extends Pick<InventoryItem, "isActive" | "isArchived" | "deletedAt">>(
  items: readonly T[],
): T | undefined {
  return items.find((i) => i.isActive && !i.isArchived && isLive(i));
}

/** Units compare via the controlled list; unknown legacy units by text. */
export function unitsMatch(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeStrengthUnit(a);
  const nb = normalizeStrengthUnit(b);
  if (na && nb) return na === nb;
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Summed dosage for a number of the brand's tablets. */
export function pillsToDosage(pills: number, brand: Brand): number {
  return round4(pills * brand.strength);
}

/** Tablets of the brand for a summed dosage. */
export function dosageToPills(dosage: number, brand: Brand): number {
  // An invalid strength has no pill count; 0 keeps the preview neutral.
  return calculatePillsConsumed(dosage, brand.strength) ?? 0;
}

// formatPillCount only renders quarter fractions correctly; anything else is
// shown as a plain decimal.
function formatPills(pills: number): string {
  const r = Math.round(pills * 100) / 100;
  const frac = Math.round((r - Math.floor(r)) * 100) / 100;
  if ([0, 0.25, 0.5, 0.75].includes(frac)) return formatPillCount(r);
  return `${r} tablets`;
}

/**
 * What a dose of `dosage` `unit` means in tablets of `brand`. `null` when
 * there's no brand to count against, the dose isn't a positive number, or the
 * brand is stocked in a different unit (pill math doesn't convert units).
 */
export function previewDoseInPills(
  dosage: number,
  unit: string,
  brand: Brand | undefined,
): DosePillPreview | null {
  if (!brand || !(brand.strength > 0)) return null;
  if (!Number.isFinite(dosage) || dosage <= 0) return null;
  if (!unitsMatch(unit, brand.unit)) return null;

  const pills = dosageToPills(dosage, brand);
  const combo = isCombo(brand);
  const perPill = combo
    ? formatCompoundShort(brand.compounds, unit)
    : `${brand.strength}${unit}`;
  return {
    pills,
    label: `${formatPills(pills)} of ${brand.brandName} ${perPill}`,
    ...(combo && {
      split: formatCompoundShort(scaleCompounds(brand.compounds, pills), unit),
    }),
    clean: isCleanFraction(pills),
  };
}

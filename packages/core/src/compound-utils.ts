/**
 * Helpers for combination ("multi-compound") medications.
 *
 * A combination drug — e.g. sacubitril/valsartan, sold as Entresto or Vymada —
 * is one prescription whose tablet carries two active ingredients. The app
 * keeps the dose math brand-independent:
 *
 *   - `InventoryItem.strength` and `PhaseSchedule.dosage` stay as the SUM of
 *     the compound strengths (Vymada 100 ⇒ strength 100; a 200 dose ⇒ 200).
 *   - `pillsPerDose = dosage / strength` therefore keeps working untouched.
 *   - `compounds` is descriptive: it names the ingredients and fixes the
 *     ratio used purely to *label* a dose per-compound.
 */
import type { CompoundStrength } from "@intake/types/records";

/** Sum of every compound's strength — the pill-math denominator for a combo. */
export function compoundSum(compounds: CompoundStrength[] | undefined): number {
  if (!compounds || compounds.length === 0) return 0;
  return compounds.reduce((acc, c) => acc + (c.strength || 0), 0);
}

/** True when the record describes a combination drug (≥ 2 active ingredients). */
export function isCombo(record: { compounds?: CompoundStrength[] } | null | undefined): boolean {
  return (record?.compounds?.length ?? 0) >= 2;
}

/**
 * True for a strength usable as a pill-math denominator: a finite number above
 * zero. Zero, negative, NaN, ±Infinity, null and undefined are all invalid —
 * dividing by them silently deducts 0, NaN or ∞ pills.
 */
export function isValidPillStrength(strength: unknown): strength is number {
  return typeof strength === "number" && Number.isFinite(strength) && strength > 0;
}

/**
 * Check whether a fractional pill amount is a "clean" fraction.
 * Clean fractions: whole numbers, 0.25, 0.333, 0.5, 0.667, 0.75
 * Uses 0.01 tolerance for floating-point comparison.
 */
export function isCleanFraction(pillsConsumed: number): boolean {
  const frac = Math.abs(pillsConsumed % 1);
  if (frac < 0.01) return true; // whole number
  const cleanFractions = [0.25, 0.333, 0.5, 0.667, 0.75];
  return cleanFractions.some(cf => Math.abs(frac - cf) < 0.01);
}

/**
 * Split a summed mg dose into its per-compound amounts, preserving the
 * reference ratio. Marketed strengths don't share one exact ratio (24/26,
 * 49/51, 97/103), so the result can name amounts no tablet contains — prefer
 * `formatComboDose` for labels.
 */
export function splitDose(
  dosageMg: number,
  reference: CompoundStrength[] | undefined,
): CompoundStrength[] {
  const total = compoundSum(reference);
  if (!reference || total <= 0) return [];
  return reference.map((c) => ({
    name: c.name,
    strength: Math.round((dosageMg * (c.strength / total)) * 100) / 100,
  }));
}

/** Scale a per-pill compound breakdown by a pill count (e.g. 2 × Vymada). */
export function scaleCompounds(
  compounds: CompoundStrength[] | undefined,
  pillCount: number,
): CompoundStrength[] {
  if (!compounds) return [];
  return compounds.map((c) => ({
    name: c.name,
    strength: Math.round((c.strength * pillCount) * 100) / 100,
  }));
}

/** Compact strengths only, e.g. `49/51mg`. */
export function formatCompoundShort(
  compounds: CompoundStrength[] | undefined,
  unit = "mg",
): string {
  if (!compounds || compounds.length === 0) return "";
  return `${compounds.map((c) => c.strength).join("/")}${unit}`;
}

/**
 * Label a summed dose for display. With a stocked combination brand the
 * per-compound amounts are that brand's per-pill compounds × the pill count —
 * what the tablets actually contain (200 on Entresto 97/103 ⇒ `97/103mg`).
 * Without one, the summed dose is shown as-is rather than an invented split.
 */
export function formatComboDose(
  dosageMg: number,
  unit = "mg",
  brand?: { compounds?: CompoundStrength[]; strength?: number } | null,
): string {
  if (brand && isCombo(brand)) {
    const perPill = isValidPillStrength(brand.strength)
      ? brand.strength
      : compoundSum(brand.compounds);
    if (perPill > 0) {
      return formatCompoundShort(scaleCompounds(brand.compounds, dosageMg / perPill), unit);
    }
  }
  return `${dosageMg}${unit}`;
}

/** Verbose, named breakdown, e.g. `Sacubitril 49mg + Valsartan 51mg`. */
export function formatCompoundFull(
  compounds: CompoundStrength[] | undefined,
  unit = "mg",
): string {
  if (!compounds || compounds.length === 0) return "";
  return compounds
    .map((c) => `${c.name || "Compound"} ${c.strength}${unit}`)
    .join(" + ");
}

/** Share of the total strength one compound may drift between marketed strengths. */
const RATIO_TOLERANCE = 0.03;

/**
 * True when a stocked brand is not the same combination as the prescription
 * it is filed under: different ingredients, or the same ingredients in a
 * clearly different ratio. Marketed strengths of one product (24/26, 49/51,
 * 97/103) differ slightly and still match. `false` when either side is not a
 * combination, since there is nothing to compare.
 */
export function compoundsMismatch(
  reference: CompoundStrength[] | undefined,
  brand: CompoundStrength[] | undefined,
): boolean {
  if (!reference || !brand || reference.length < 2 || brand.length < 2) return false;
  const refTotal = compoundSum(reference);
  const brandTotal = compoundSum(brand);
  if (!(refTotal > 0) || !(brandTotal > 0)) return false;

  const key = (name: string) => name.trim().toLowerCase();
  const brandShare = new Map(brand.map((c) => [key(c.name), c.strength / brandTotal]));
  if (brandShare.size !== reference.length) return true;
  return reference.some((c) => {
    const share = brandShare.get(key(c.name));
    return share === undefined || Math.abs(share - c.strength / refTotal) > RATIO_TOLERANCE;
  });
}

/** Ingredient names only, e.g. `Sacubitril / Valsartan`. */
export function formatCompoundNames(
  compounds: CompoundStrength[] | undefined,
): string {
  if (!compounds || compounds.length === 0) return "";
  return compounds.map((c) => c.name || "Compound").join(" / ");
}

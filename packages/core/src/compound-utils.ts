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

/** Ingredient names only, e.g. `Sacubitril / Valsartan`. */
export function formatCompoundNames(
  compounds: CompoundStrength[] | undefined,
): string {
  if (!compounds || compounds.length === 0) return "";
  return compounds.map((c) => c.name || "Compound").join(" / ");
}

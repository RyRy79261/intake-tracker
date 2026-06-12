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
 * Split a summed mg dose into its per-compound amounts, preserving the
 * reference ratio. Used to label a dose when no stocked brand is available
 * to read an exact per-pill breakdown from.
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

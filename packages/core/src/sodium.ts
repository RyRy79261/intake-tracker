/**
 * Sodium and the substances it is entered as — the one place the fractions
 * live, shared by manual entry, the AI prompts and every label.
 *
 * Salt is NOT sodium. The tracked quantity is sodium in mg; the user may
 * enter it as salt (NaCl), MSG or sodium itself:
 *
 * - Table salt (NaCl) is 22.99 / 58.44 ≈ 39.3% sodium by mass. Manual entry
 *   used 0.39 and the AI parse prompt used ÷ 2.5 (0.40), so the same "2 g
 *   salt" logged as 780 or 800 mg depending on how it was entered.
 * - MSG (monosodium glutamate monohydrate, C5H8NNaO4·H2O, 187.13 g/mol) is
 *   22.99 / 187.13 ≈ 12.3% sodium.
 * - Sodium is 100% sodium.
 */
import type { SodiumSource, SodiumSourceUnit } from "@intake/types/records";

export type { SodiumSource, SodiumSourceUnit };

/** Sodium mass fraction of table salt (NaCl). */
export const SODIUM_FRACTION = 0.393;

/** Sodium mass fraction of MSG (monosodium glutamate monohydrate). */
export const MSG_SODIUM_FRACTION = 0.123;

/** Sodium mass fraction of each substance a sodium entry can be measured as. */
export const SODIUM_FRACTIONS: Readonly<Record<SodiumSource, number>> = {
  sodium: 1,
  salt: SODIUM_FRACTION,
  msg: MSG_SODIUM_FRACTION,
};

export const SODIUM_SOURCES: readonly SodiumSource[] = ["sodium", "salt", "msg"];
export const SODIUM_SOURCE_UNITS: readonly SodiumSourceUnit[] = ["mg", "g"];

/** Display name of each source substance. */
export const SODIUM_SOURCE_LABELS: Readonly<Record<SodiumSource, string>> = {
  sodium: "Sodium",
  salt: "Salt",
  msg: "MSG",
};

export function isSodiumSource(value: unknown): value is SodiumSource {
  return value === "sodium" || value === "salt" || value === "msg";
}

export function isSodiumSourceUnit(value: unknown): value is SodiumSourceUnit {
  return value === "mg" || value === "g";
}

/** Grams of salt (NaCl) → milligrams of sodium. */
export function saltGramsToSodiumMg(saltGrams: number): number {
  return saltGrams * 1000 * SODIUM_FRACTION;
}

/**
 * An entered amount of salt, MSG or sodium → milligrams of sodium. Unrounded:
 * callers round once, at the point they store an integer mg.
 */
export function toSodiumMg(
  amount: number,
  unit: SodiumSourceUnit,
  source: SodiumSource,
): number {
  const mg = unit === "g" ? amount * 1000 : amount;
  return mg * SODIUM_FRACTIONS[source];
}

/** The entered-source fields of a sodium intake record. */
export interface SodiumEntryFields {
  sodiumSource?: SodiumSource | undefined;
  sourceAmount?: number | undefined;
  sourceUnit?: SodiumSourceUnit | undefined;
}

/**
 * "from 2 g salt" for a sodium row entered as salt or MSG; null when there is
 * nothing to add — sodium entered directly (the stored mg says it all) or a
 * row without source fields (legacy / AI / preset rows: source unknown).
 */
export function describeSodiumEntry(fields: SodiumEntryFields): string | null {
  const { sodiumSource, sourceAmount, sourceUnit } = fields;
  if (!sodiumSource || sodiumSource === "sodium") return null;
  if (sourceAmount === undefined || !Number.isFinite(sourceAmount) || !sourceUnit) {
    return null;
  }
  const name = sodiumSource === "msg" ? "MSG" : "salt";
  return `from ${sourceAmount} ${sourceUnit} ${name}`;
}

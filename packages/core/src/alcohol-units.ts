/**
 * Metric alcohol unit constants. Shared by server AI routes and client UI so
 * "standard drinks" means the same thing everywhere.
 */

// WHO / metric standard drink: 10 g of pure ethanol.
export const GRAMS_PER_STANDARD_DRINK = 10;

// Density of ethanol at 20 C, in g/ml.
export const ETHANOL_DENSITY_G_PER_ML = 0.789;

/** Convert ABV % and volume in ml to grams of pure ethanol. */
export function ethanolGrams(abvPercent: number, volumeMl: number): number {
  return volumeMl * (abvPercent / 100) * ETHANOL_DENSITY_G_PER_ML;
}

/** Convert ABV % and volume in ml to metric standard drinks (10 g ethanol). */
export function standardDrinksFromAbv(abvPercent: number, volumeMl: number): number {
  return ethanolGrams(abvPercent, volumeMl) / GRAMS_PER_STANDARD_DRINK;
}

/**
 * Inverse of standardDrinksFromAbv: recover the ABV % of a drink from its
 * metric standard-drink count and volume. Used to show legacy alcohol records
 * (logged before abvPercent was stored) back in percentage terms for editing.
 * Returns 0 when the volume is non-positive.
 */
export function abvFromStandardDrinks(standardDrinks: number, volumeMl: number): number {
  if (volumeMl <= 0) return 0;
  return (
    (standardDrinks * GRAMS_PER_STANDARD_DRINK) /
    (volumeMl * ETHANOL_DENSITY_G_PER_ML)
  ) * 100;
}

/**
 * Share of an alcoholic drink's volume that counts as water, in percent:
 * the non-ethanol fraction (a 40% spirit is 60% water). Used where no
 * measured water content is known (voice, the food parser, a hand-typed
 * drink). A missing, non-positive or out-of-range ABV gives 100.
 */
export function waterContentPercentFromAbv(abvPercent: number | null | undefined): number {
  if (
    abvPercent === null ||
    abvPercent === undefined ||
    !Number.isFinite(abvPercent) ||
    abvPercent <= 0 ||
    abvPercent >= 100
  ) {
    return 100;
  }
  return 100 - abvPercent;
}

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

/**
 * Salt (NaCl) → sodium conversion, shared by manual entry and the AI prompts.
 *
 * Sodium is 22.99 / 58.44 ≈ 39.3% of table salt by mass. Manual entry used
 * 0.39 and the AI parse prompt used ÷ 2.5 (0.40), so the same "2 g salt"
 * logged as 780 or 800 mg depending on how it was entered. Every path now
 * reads this one constant.
 */
export const SODIUM_FRACTION = 0.393;

/** Grams of salt (NaCl) → milligrams of sodium. */
export function saltGramsToSodiumMg(saltGrams: number): number {
  return saltGrams * 1000 * SODIUM_FRACTION;
}

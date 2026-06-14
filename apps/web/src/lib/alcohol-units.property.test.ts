/**
 * Property-based tests for the alcohol-units conversion module.
 *
 * Three small pure functions that the LiquidsCard alcohol tab + server
 * AI routes both lean on. The invariants are textbook fast-check
 * targets:
 *
 *   round-trip identity:
 *     for all (abv, vol > 0):
 *       abvFromStandardDrinks(standardDrinksFromAbv(abv, vol), vol) ≈ abv
 *
 *   inverse round-trip:
 *     for all (drinks, vol > 0):
 *       standardDrinksFromAbv(abvFromStandardDrinks(drinks, vol), vol) ≈ drinks
 *
 *   linearity in volume:
 *     for all (abv, vol > 0, k > 0):
 *       ethanolGrams(abv, k * vol) ≈ k * ethanolGrams(abv, vol)
 *
 *   degenerate-volume guard:
 *     for any drinks and vol <= 0:
 *       abvFromStandardDrinks(drinks, vol) === 0
 *
 *   zero abv / zero volume:
 *     standardDrinksFromAbv(0, vol) === 0 for any vol
 *     standardDrinksFromAbv(abv, 0) === 0 for any abv
 *
 *   monotonicity:
 *     standardDrinksFromAbv strictly increases in abv (for vol > 0)
 *     standardDrinksFromAbv strictly increases in vol (for abv > 0)
 *
 * Why this matters: ABV → standard-drinks → ABV is the conversion
 * used when editing a legacy alcohol record. If the inverse drifts,
 * the user's edit-and-resave cycle silently changes the drink's
 * apparent strength every time.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  ethanolGrams,
  standardDrinksFromAbv,
  abvFromStandardDrinks,
} from "@intake/core/alcohol";

// Realistic input ranges: ABV is bounded by 0–95% in real-world
// products; volumes by ~5 ml (a sip) to 5 000 ml (a bucket). Restrict
// fast-check to these to keep floating-point error bounds tight.
const realisticAbv = fc.double({
  min: 0,
  max: 95,
  noNaN: true,
  noDefaultInfinity: true,
});
const positiveVolumeMl = fc.double({
  min: 5,
  max: 5_000,
  noNaN: true,
  noDefaultInfinity: true,
});
const positiveDrinks = fc.double({
  min: 0,
  max: 50,
  noNaN: true,
  noDefaultInfinity: true,
});

describe("alcohol-units — round-trip identities (property)", () => {
  it("abvFromStandardDrinks(standardDrinksFromAbv(abv, vol), vol) ≈ abv", () => {
    fc.assert(
      fc.property(realisticAbv, positiveVolumeMl, (abv, vol) => {
        const drinks = standardDrinksFromAbv(abv, vol);
        const recovered = abvFromStandardDrinks(drinks, vol);
        expect(recovered).toBeCloseTo(abv, 9);
      }),
      { numRuns: 80 },
    );
  });

  it("standardDrinksFromAbv(abvFromStandardDrinks(drinks, vol), vol) ≈ drinks", () => {
    fc.assert(
      fc.property(positiveDrinks, positiveVolumeMl, (drinks, vol) => {
        const abv = abvFromStandardDrinks(drinks, vol);
        const recovered = standardDrinksFromAbv(abv, vol);
        expect(recovered).toBeCloseTo(drinks, 9);
      }),
      { numRuns: 80 },
    );
  });
});

describe("alcohol-units — linearity (property)", () => {
  it("ethanolGrams scales linearly with volume", () => {
    fc.assert(
      fc.property(
        realisticAbv,
        positiveVolumeMl,
        fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
        (abv, vol, k) => {
          const a = ethanolGrams(abv, vol);
          const b = ethanolGrams(abv, k * vol);
          // b should be k * a, within floating-point tolerance.
          expect(b).toBeCloseTo(k * a, 9);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("standardDrinksFromAbv scales linearly with volume (same shape as ethanolGrams)", () => {
    fc.assert(
      fc.property(
        realisticAbv,
        positiveVolumeMl,
        fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
        (abv, vol, k) => {
          const d = standardDrinksFromAbv(abv, vol);
          const d2 = standardDrinksFromAbv(abv, k * vol);
          expect(d2).toBeCloseTo(k * d, 9);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("alcohol-units — degenerate inputs", () => {
  it("abvFromStandardDrinks returns 0 for any volume <= 0", () => {
    fc.assert(
      fc.property(
        positiveDrinks,
        fc.double({ min: -1000, max: 0, noNaN: true, noDefaultInfinity: true }),
        (drinks, badVol) => {
          expect(abvFromStandardDrinks(drinks, badVol)).toBe(0);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("standardDrinksFromAbv(0, vol) === 0 for any volume", () => {
    fc.assert(
      fc.property(positiveVolumeMl, (vol) => {
        expect(standardDrinksFromAbv(0, vol)).toBe(0);
      }),
      { numRuns: 30 },
    );
  });

  it("standardDrinksFromAbv(abv, 0) === 0 for any abv", () => {
    fc.assert(
      fc.property(realisticAbv, (abv) => {
        expect(standardDrinksFromAbv(abv, 0)).toBe(0);
      }),
      { numRuns: 30 },
    );
  });
});

describe("alcohol-units — monotonicity (property)", () => {
  it("higher abv → strictly more standard drinks (vol > 0)", () => {
    fc.assert(
      fc.property(
        positiveVolumeMl,
        fc.tuple(realisticAbv, realisticAbv).filter(([a, b]) => Math.abs(a - b) > 1e-6),
        (vol, [a, b]) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          expect(standardDrinksFromAbv(hi, vol)).toBeGreaterThan(
            standardDrinksFromAbv(lo, vol),
          );
        },
      ),
      { numRuns: 40 },
    );
  });

  it("larger volume → strictly more standard drinks (abv > 0)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 95, noNaN: true, noDefaultInfinity: true }),
        fc.tuple(positiveVolumeMl, positiveVolumeMl).filter(([a, b]) => Math.abs(a - b) > 1e-3),
        (abv, [a, b]) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          expect(standardDrinksFromAbv(abv, hi)).toBeGreaterThan(
            standardDrinksFromAbv(abv, lo),
          );
        },
      ),
      { numRuns: 40 },
    );
  });
});

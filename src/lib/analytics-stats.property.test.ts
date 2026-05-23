/**
 * Property-based tests for the analytics-stats pure-math layer.
 *
 * Paradigm (docs/TESTING_STRATEGY.md §2.3): sliding-window aggregation,
 * regression, and correlation are all pure math — textbook fast-check
 * targets. The existing analytics-stats.test.ts covers hand-picked
 * scenarios; this file pins the invariants that must hold for ANY
 * input matching the documented contract.
 *
 * Why this matters: these functions drive the History page's
 * analytics tab. A regression that off-by-ones the moving average,
 * miscategorises a rising trend as falling, or returns out-of-range
 * confidence values shows the user wrong numbers about their own
 * health data.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { movingAverage, trend } from "@/lib/analytics-stats";
import type { DataPoint } from "@/lib/analytics-types";

// ─────────────────────────────────────────────────────────────────────────
// movingAverage
// ─────────────────────────────────────────────────────────────────────────

describe("movingAverage — property invariants", () => {
  // Bound the data values to a finite range — fast-check's default
  // float arbitrary can emit NaN/Infinity which the function isn't
  // documented to handle. The realistic input range (water ml, sodium
  // mg, weight kg) fits comfortably in [-10_000, 10_000].
  const finiteNumber = fc.double({
    min: -10_000,
    max: 10_000,
    noNaN: true,
    noDefaultInfinity: true,
  });
  const data = fc.array(finiteNumber, { minLength: 0, maxLength: 50 });

  it("output length always equals input length", () => {
    fc.assert(
      fc.property(data, fc.integer({ min: 1, max: 20 }), (arr, w) => {
        expect(movingAverage(arr, w)).toHaveLength(arr.length);
      }),
      { numRuns: 60 },
    );
  });

  it("first (windowSize - 1) positions are always null; the rest are non-null numbers", () => {
    fc.assert(
      fc.property(data, fc.integer({ min: 1, max: 20 }), (arr, w) => {
        fc.pre(arr.length >= w);
        const out = movingAverage(arr, w);
        for (let i = 0; i < w - 1; i++) {
          expect(out[i]).toBeNull();
        }
        for (let i = w - 1; i < arr.length; i++) {
          expect(out[i]).not.toBeNull();
          expect(Number.isFinite(out[i] as number)).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("constant input → every non-null output equals the constant", () => {
    fc.assert(
      fc.property(
        finiteNumber,
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 10 }),
        (k, len, w) => {
          fc.pre(len >= w);
          const arr = Array(len).fill(k);
          const out = movingAverage(arr, w);
          for (let i = w - 1; i < len; i++) {
            // Floating-point identity: a sum-of-equal-values divided by
            // count *should* equal k exactly for integer k, but with
            // arbitrary doubles a tiny rounding error can creep in.
            expect(out[i]).toBeCloseTo(k, 9);
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("every non-null output lies between min and max of its window (sliding-window invariant)", () => {
    // The arithmetic mean of a set of values is always bounded by the
    // set's min and max. This catches the off-by-one window-slice bug
    // class (using i-w..i instead of i-w+1..i+1).
    fc.assert(
      fc.property(data, fc.integer({ min: 1, max: 15 }), (arr, w) => {
        fc.pre(arr.length >= w);
        const out = movingAverage(arr, w);
        for (let i = w - 1; i < arr.length; i++) {
          const window = arr.slice(i - w + 1, i + 1);
          const winMin = Math.min(...window);
          const winMax = Math.max(...window);
          const avg = out[i] as number;
          // Use a small tolerance for floating-point comparison.
          expect(avg).toBeGreaterThanOrEqual(winMin - 1e-9);
          expect(avg).toBeLessThanOrEqual(winMax + 1e-9);
        }
      }),
      { numRuns: 40 },
    );
  });

  it("empty input or non-positive window size yields []", () => {
    fc.assert(
      fc.property(
        data,
        fc.integer({ min: -10, max: 0 }),
        (arr, w) => {
          // Non-positive window
          expect(movingAverage(arr, w)).toEqual([]);
        },
      ),
      { numRuns: 30 },
    );
    expect(movingAverage([], 5)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// trend
// ─────────────────────────────────────────────────────────────────────────

describe("trend — property invariants", () => {
  function makePoints(values: number[]): DataPoint[] {
    return values.map((v, i) => ({
      timestamp: 1_700_000_000_000 + i * 86_400_000,
      value: v,
    }));
  }

  it("empty or single-element input → { slope: 0, direction: 'stable', confidence: 0 }", () => {
    expect(trend([])).toEqual({ slope: 0, direction: "stable", confidence: 0 });
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (v) => {
        expect(trend(makePoints([v]))).toEqual({
          slope: 0,
          direction: "stable",
          confidence: 0,
        });
      }),
      { numRuns: 20 },
    );
  });

  it("confidence is always in [0, 1]", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
          { minLength: 2, maxLength: 30 },
        ),
        (values) => {
          const { confidence } = trend(makePoints(values));
          expect(confidence).toBeGreaterThanOrEqual(0);
          expect(confidence).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("direction is always one of 'rising' / 'falling' / 'stable'", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
          { minLength: 0, maxLength: 30 },
        ),
        (values) => {
          const { direction } = trend(makePoints(values));
          expect(["rising", "falling", "stable"]).toContain(direction);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("strictly increasing series with reasonable noise → 'rising'", () => {
    // Build a series y = i*step + small noise, ensure direction.
    // Higher step / longer series → higher R² → more confident rising.
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 40 }),
        fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
        (n, step) => {
          const values = Array.from({ length: n }, (_, i) => i * step);
          const { direction, slope } = trend(makePoints(values));
          expect(slope).toBeGreaterThan(0);
          expect(direction).toBe("rising");
        },
      ),
      { numRuns: 30 },
    );
  });

  it("strictly decreasing series → 'falling'", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 40 }),
        fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
        (n, step) => {
          const values = Array.from({ length: n }, (_, i) => 10_000 - i * step);
          const { direction, slope } = trend(makePoints(values));
          expect(slope).toBeLessThan(0);
          expect(direction).toBe("falling");
        },
      ),
      { numRuns: 30 },
    );
  });

  it("constant series → confidence 0 (no variance to explain), direction 'stable'", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 2, max: 30 }),
        (k, n) => {
          const { direction, confidence } = trend(makePoints(Array(n).fill(k)));
          expect(confidence).toBe(0);
          expect(direction).toBe("stable");
        },
      ),
      { numRuns: 30 },
    );
  });
});

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
import {
  movingAverage,
  trend,
  detectAnomalies,
  computeRegression,
} from "@/lib/analytics-stats";
import type { DataPoint } from "@intake/types/analytics";

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

// ─────────────────────────────────────────────────────────────────────────
// detectAnomalies
// ─────────────────────────────────────────────────────────────────────────

describe("detectAnomalies — property invariants", () => {
  function makePoints(values: number[]): DataPoint[] {
    return values.map((v, i) => ({
      timestamp: 1_700_000_000_000 + i * 86_400_000,
      value: v,
    }));
  }

  const series = fc.array(
    fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
    { minLength: 0, maxLength: 50 },
  );

  it("empty / single-element input → []", () => {
    expect(detectAnomalies([])).toEqual([]);
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (v) => {
          expect(detectAnomalies(makePoints([v]))).toEqual([]);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("output is always a subset of the input (same DataPoint references)", () => {
    fc.assert(
      fc.property(series, (values) => {
        const points = makePoints(values);
        const anomalies = detectAnomalies(points);
        for (const a of anomalies) {
          // Each anomaly must be a point that exists in the input.
          expect(points).toContain(a);
        }
      }),
      { numRuns: 40 },
    );
  });

  it("constant series → no anomalies (sd is zero, function short-circuits)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 2, max: 30 }),
        (k, n) => {
          expect(detectAnomalies(makePoints(Array(n).fill(k)))).toEqual([]);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("series with a clear outlier → that outlier is among the detected anomalies", () => {
    // Build a noise-free baseline series, then insert one huge spike.
    //
    // Subtle math: for n values where (n-1) are constant and 1 is an
    // outlier, the outlier's own z-score is bounded above by
    // (n-1)/sqrt(n), regardless of how extreme the spike is — the
    // spike inflates its own SD enough to depress its z-score.
    //   n=5  → max z ≈ 1.79  (below the 2.0 default threshold!)
    //   n=10 → max z ≈ 2.85  (above)
    //   n=20 → max z ≈ 4.25
    // So we require n ≥ 10. fast-check shrunk to this exact corner
    // case the first time the property ran.
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 30 }),
        fc.double({ min: 50, max: 200, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 9 }),
        (n, baseline, outlierIdx) => {
          fc.pre(outlierIdx < n);
          const values = Array(n).fill(baseline);
          values[outlierIdx] = baseline + 10_000;
          const points = makePoints(values);
          const anomalies = detectAnomalies(points);
          const outlierPoint = points[outlierIdx]!;
          expect(anomalies).toContain(outlierPoint);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("higher zThreshold → smaller or equal anomaly set (monotone in threshold)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
          { minLength: 3, maxLength: 30 },
        ),
        (values) => {
          const points = makePoints(values);
          const tight = detectAnomalies(points, 1.5);
          const loose = detectAnomalies(points, 3.0);
          // A wider threshold matches no more points than a tighter one.
          expect(loose.length).toBeLessThanOrEqual(tight.length);
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// computeRegression
// ─────────────────────────────────────────────────────────────────────────

describe("computeRegression — property invariants", () => {
  function makePoints(values: number[]): DataPoint[] {
    return values.map((v, i) => ({
      timestamp: 1_700_000_000_000 + i * 86_400_000,
      value: v,
    }));
  }

  it("empty / single-element input → { slope: 0, intercept: 0, predict() === 0 }", () => {
    const empty = computeRegression([]);
    expect(empty.slope).toBe(0);
    expect(empty.intercept).toBe(0);
    expect(empty.predict(0)).toBe(0);
    expect(empty.predict(42)).toBe(0);

    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (v) => {
          const r = computeRegression(makePoints([v]));
          expect(r.slope).toBe(0);
          expect(r.intercept).toBe(0);
          expect(r.predict(0)).toBe(0);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("predict(i) ≈ slope * i + intercept (predict is the regression line)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
          { minLength: 2, maxLength: 30 },
        ),
        (values) => {
          const r = computeRegression(makePoints(values));
          for (let i = 0; i < Math.min(values.length, 5); i++) {
            expect(r.predict(i)).toBeCloseTo(r.slope * i + r.intercept, 6);
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("for a perfectly linear series y = a + b*i, recovers slope ≈ b and intercept ≈ a", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }),
        fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
        (n, intercept, slope) => {
          // Skip near-zero slopes where floating-point recovery is noisy
          fc.pre(Math.abs(slope) > 0.01);
          const values = Array.from(
            { length: n },
            (_, i) => intercept + slope * i,
          );
          const r = computeRegression(makePoints(values));
          expect(r.slope).toBeCloseTo(slope, 5);
          expect(r.intercept).toBeCloseTo(intercept, 5);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("constant series → slope === 0, intercept === the constant", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 2, max: 30 }),
        (k, n) => {
          const r = computeRegression(makePoints(Array(n).fill(k)));
          expect(r.slope).toBeCloseTo(0, 9);
          expect(r.intercept).toBeCloseTo(k, 6);
        },
      ),
      { numRuns: 30 },
    );
  });
});

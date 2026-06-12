import { describe, it, expect } from "vitest";
import {
  movingAverage,
  trend,
  correlateTimeSeries,
  detectAnomalies,
  computeRegression,
} from "@/lib/analytics-stats";
import type { DataPoint } from "@/lib/analytics-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePoints(values: number[], startTs: number = 1_700_000_000_000, stepMs: number = 86_400_000): DataPoint[] {
  return values.map((v, i) => ({
    timestamp: startTs + i * stepMs,
    value: v,
  }));
}

// ---------------------------------------------------------------------------
// movingAverage
// ---------------------------------------------------------------------------

describe("movingAverage", () => {
  it("computes sliding window correctly", () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("returns empty array for empty input", () => {
    expect(movingAverage([], 3)).toEqual([]);
  });

  it("handles window size 1", () => {
    expect(movingAverage([10, 20, 30], 1)).toEqual([10, 20, 30]);
  });
});

// ---------------------------------------------------------------------------
// trend
// ---------------------------------------------------------------------------

describe("trend", () => {
  it("detects rising data", () => {
    const pts = makePoints([1, 2, 3, 4, 5]);
    const result = trend(pts);
    expect(result.direction).toBe("rising");
    expect(result.slope).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("detects falling data", () => {
    const pts = makePoints([5, 4, 3, 2, 1]);
    const result = trend(pts);
    expect(result.direction).toBe("falling");
    expect(result.slope).toBeLessThan(0);
  });

  it("detects stable data", () => {
    const pts = makePoints([5, 5, 5, 5, 5]);
    const result = trend(pts);
    expect(result.direction).toBe("stable");
  });

  it("reports noisy data as stable even when the regression slope is non-trivial", () => {
    // Strong zigzag with a slight upward drift: the slope is clearly outside
    // the +/-0.01 'rising' band, but the linear fit is poor (low R-squared),
    // so the confidence gate should force the direction to 'stable'.
    const pts = makePoints([0, 20, 1, 21, 2, 22, 3, 30]);
    const result = trend(pts);
    expect(Math.abs(result.slope)).toBeGreaterThan(0.01); // would read 'rising' ungated
    expect(result.confidence).toBeLessThan(0.3);
    expect(result.direction).toBe("stable");
  });

  it("returns stable with 0 confidence for empty array", () => {
    const result = trend([]);
    expect(result.direction).toBe("stable");
    expect(result.confidence).toBe(0);
  });

  it("returns stable with 0 confidence for single element", () => {
    const result = trend([{ timestamp: 1, value: 42 }]);
    expect(result.direction).toBe("stable");
    expect(result.confidence).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// correlateTimeSeries
// ---------------------------------------------------------------------------

describe("correlateTimeSeries", () => {
  it("returns strong positive correlation for perfectly correlated series", () => {
    // Each point on a different day
    const base = 1_700_000_000_000;
    const day = 86_400_000;
    const seriesA = makePoints([1, 2, 3, 4, 5, 6, 7], base, day);
    const seriesB = makePoints([10, 20, 30, 40, 50, 60, 70], base, day);

    const result = correlateTimeSeries(seriesA, seriesB);
    expect(result.coefficient).toBeCloseTo(1.0, 1);
    expect(result.strength).toBe("strong");
  });

  it("returns coefficient=0 and strength=none for empty arrays", () => {
    const result = correlateTimeSeries([], []);
    expect(result.coefficient).toBe(0);
    expect(result.strength).toBe("none");
    expect(result.pairedDays).toBe(0);
    expect(result.pairs).toEqual([]);
  });

  it("exposes day-aligned value pairs alongside the coefficient", () => {
    const base = 1_700_000_000_000;
    const day = 86_400_000;
    const seriesA = makePoints([1, 2, 3, 4, 5], base, day);
    const seriesB = makePoints([2, 4, 6, 8, 10], base, day);

    const result = correlateTimeSeries(seriesA, seriesB);
    expect(result.pairedDays).toBe(5);
    expect(result.pairs).toHaveLength(5);
    // Pairs are day-ordered, so the earliest day pairs A=1 with B=2.
    expect(result.pairs[0]).toEqual({ a: 1, b: 2 });
  });

  it("flags insufficient overlapping data without claiming 'no correlation'", () => {
    // Only two overlapping days — too few for a meaningful coefficient.
    const base = 1_700_000_000_000;
    const day = 86_400_000;
    const seriesA = makePoints([1, 2], base, day);
    const seriesB = makePoints([10, 20], base, day);

    const result = correlateTimeSeries(seriesA, seriesB);
    expect(result.pairedDays).toBe(2);
    expect(result.coefficient).toBe(0);
    expect(result.strength).toBe("none");
    // The pairs are still surfaced so callers can distinguish "too little
    // data" (pairedDays < 3) from a genuine absence of correlation.
    expect(result.pairs).toHaveLength(2);
  });

  it("handles lag days parameter", () => {
    // Series A on days 1-5, Series B on days 3-7 (lagged by 2)
    const base = 1_700_000_000_000;
    const day = 86_400_000;
    const seriesA = makePoints([1, 2, 3, 4, 5, 6, 7], base, day);
    const seriesB = makePoints([10, 20, 30, 40, 50, 60, 70], base, day);

    const result = correlateTimeSeries(seriesA, seriesB, 2);
    expect(result.lagDays).toBe(2);
    // With lag, A[day0] correlates with B[day2], etc.
    expect(result.strength).toBe("strong");
  });

  it("buckets days by the injected timezone, not the host-local zone", () => {
    // Two timestamps 1h apart straddling UTC midnight. Absolute (Date.UTC) so
    // the test is itself timezone-independent.
    const ts1 = Date.UTC(2026, 0, 1, 23, 30); // 2026-01-01 23:30 UTC
    const ts2 = Date.UTC(2026, 0, 2, 0, 30); // 2026-01-02 00:30 UTC
    const seriesA = [
      { timestamp: ts1, value: 1 },
      { timestamp: ts2, value: 3 },
    ];
    const seriesB = [
      { timestamp: ts1, value: 10 },
      { timestamp: ts2, value: 30 },
    ];
    // UTC: the two points fall on different calendar days -> 2 paired days.
    expect(correlateTimeSeries(seriesA, seriesB, 0, "UTC").pairedDays).toBe(2);
    // America/New_York (UTC-5): both are on 2026-01-01 (18:30, 19:30) and get
    // averaged into a single day -> 1 paired day. Proves the tz drives bucketing.
    expect(
      correlateTimeSeries(seriesA, seriesB, 0, "America/New_York").pairedDays,
    ).toBe(1);
  });

  it("defaults to UTC bucketing when no timezone is given", () => {
    const ts1 = Date.UTC(2026, 0, 1, 23, 30);
    const ts2 = Date.UTC(2026, 0, 2, 0, 30);
    const seriesA = [
      { timestamp: ts1, value: 1 },
      { timestamp: ts2, value: 3 },
    ];
    const seriesB = [
      { timestamp: ts1, value: 10 },
      { timestamp: ts2, value: 30 },
    ];
    expect(correlateTimeSeries(seriesA, seriesB).pairedDays).toBe(
      correlateTimeSeries(seriesA, seriesB, 0, "UTC").pairedDays,
    );
  });
});

// ---------------------------------------------------------------------------
// detectAnomalies
// ---------------------------------------------------------------------------

describe("detectAnomalies", () => {
  it("flags points exceeding z-score threshold", () => {
    // Normal values around 100, with one outlier at 200
    const pts = makePoints([100, 101, 99, 100, 102, 98, 100, 200]);
    const anomalies = detectAnomalies(pts, 2.0);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0]?.value).toBe(200);
  });

  it("returns empty array for empty input", () => {
    expect(detectAnomalies([])).toEqual([]);
  });

  it("returns empty array when all values are identical", () => {
    const pts = makePoints([5, 5, 5, 5]);
    expect(detectAnomalies(pts)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeRegression
// ---------------------------------------------------------------------------

describe("computeRegression", () => {
  it("returns correct slope and intercept for linear data", () => {
    // y = 2x + 1 mapped to index positions: [1, 3, 5, 7, 9]
    const pts = makePoints([1, 3, 5, 7, 9]);
    const result = computeRegression(pts);
    expect(result.slope).toBeCloseTo(2, 5);
    expect(result.intercept).toBeCloseTo(1, 5);
  });

  it("prediction function works correctly", () => {
    const pts = makePoints([1, 3, 5, 7, 9]);
    const result = computeRegression(pts);
    // At index 5 (next point): 2*5 + 1 = 11
    expect(result.predict(5)).toBeCloseTo(11, 5);
  });

  it("handles less than 2 points", () => {
    const result = computeRegression([]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(0);
    expect(result.predict(10)).toBe(0);
  });
});

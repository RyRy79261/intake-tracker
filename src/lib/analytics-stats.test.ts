import { describe, it, expect } from "vitest";
import {
  movingAverage,
  trend,
  correlateTimeSeries,
  detectAnomalies,
  computeRegression,
} from "./analytics-stats";
import type { DataPoint } from "./analytics-types";

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
    expect(anomalies[0].value).toBe(200);
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

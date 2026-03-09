import {
  linearRegression,
  linearRegressionLine,
  sampleStandardDeviation,
  sampleCorrelation,
  zScore,
  mean,
} from "simple-statistics";
import type { DataPoint, TrendDirection, CorrelationResult } from "./analytics-types";

// ---------------------------------------------------------------------------
// Moving Average
// ---------------------------------------------------------------------------

/**
 * Compute a sliding-window moving average. Returns `null` for positions
 * where there are fewer than `windowSize` preceding values.
 */
export function movingAverage(
  data: number[],
  windowSize: number,
): (number | null)[] {
  if (data.length === 0 || windowSize <= 0) return [];

  return data.map((_, i) => {
    if (i < windowSize - 1) return null;
    const window = data.slice(i - windowSize + 1, i + 1);
    return window.reduce((sum, v) => sum + v, 0) / windowSize;
  });
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

/**
 * Determine trend direction from a series of data points using linear
 * regression. Returns 'stable' with 0 confidence for empty / single-element
 * arrays.
 */
export function trend(points: DataPoint[]): TrendDirection {
  if (points.length <= 1) {
    return { slope: 0, direction: "stable", confidence: 0 };
  }

  // Normalise timestamps to index positions for numeric stability
  const pairs: [number, number][] = points.map((p, i) => [i, p.value]);

  const reg = linearRegression(pairs);
  const line = linearRegressionLine(reg);

  // R-squared for confidence
  const yMean = mean(pairs.map((p) => p[1]));
  const ssTot = pairs.reduce((sum, p) => sum + (p[1] - yMean) ** 2, 0);
  const ssRes = pairs.reduce((sum, p) => sum + (p[1] - line(p[0])) ** 2, 0);
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  const direction =
    reg.m > 0.01 ? "rising" : reg.m < -0.01 ? "falling" : "stable";

  return {
    slope: reg.m,
    direction,
    confidence: Math.max(0, Math.min(1, rSquared)),
  };
}

// ---------------------------------------------------------------------------
// Correlate Time Series
// ---------------------------------------------------------------------------

/**
 * Align two data-point series by calendar day, apply an optional lag, then
 * compute the Pearson correlation coefficient.
 */
export function correlateTimeSeries(
  seriesA: DataPoint[],
  seriesB: DataPoint[],
  lagDays: number = 0,
): CorrelationResult {
  const empty: CorrelationResult = {
    coefficient: 0,
    strength: "none",
    seriesA,
    seriesB,
    lagDays,
  };

  if (seriesA.length === 0 || seriesB.length === 0) return empty;

  // Group by day key (YYYY-MM-DD)
  const dayKey = (ts: number): string => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const avgByDay = (points: DataPoint[]): Map<string, number> => {
    const groups = new Map<string, number[]>();
    for (const p of points) {
      const key = dayKey(p.timestamp);
      const arr = groups.get(key) ?? [];
      arr.push(p.value);
      groups.set(key, arr);
    }
    const result = new Map<string, number>();
    groups.forEach((vals, key) => {
      result.set(key, mean(vals));
    });
    return result;
  };

  const mapA = avgByDay(seriesA);
  const mapB = avgByDay(seriesB);

  // Apply lag: shift A dates forward by lagDays
  const shiftDay = (dateStr: string, days: number): string => {
    const d = new Date(dateStr + "T12:00:00");
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const pairedA: number[] = [];
  const pairedB: number[] = [];

  mapA.forEach((valA, dateA) => {
    const dateB = lagDays === 0 ? dateA : shiftDay(dateA, lagDays);
    const valB = mapB.get(dateB);
    if (valB !== undefined) {
      pairedA.push(valA);
      pairedB.push(valB);
    }
  });

  if (pairedA.length < 3) return empty;

  // Check for zero variance (constant series)
  const stdA = sampleStandardDeviation(pairedA);
  const stdB = sampleStandardDeviation(pairedB);
  if (stdA === 0 || stdB === 0) return empty;

  const r = sampleCorrelation(pairedA, pairedB);
  const absR = Math.abs(r);

  const strength: CorrelationResult["strength"] =
    absR > 0.7
      ? "strong"
      : absR > 0.4
        ? "moderate"
        : absR > 0.2
          ? "weak"
          : "none";

  return {
    coefficient: r,
    strength,
    seriesA,
    seriesB,
    lagDays,
  };
}

// ---------------------------------------------------------------------------
// Anomaly Detection
// ---------------------------------------------------------------------------

/**
 * Return data points whose z-score exceeds the given threshold (default 2.0).
 */
export function detectAnomalies(
  points: DataPoint[],
  zThreshold: number = 2.0,
): DataPoint[] {
  if (points.length < 2) return [];

  const values = points.map((p) => p.value);
  const m = mean(values);
  const sd = sampleStandardDeviation(values);

  if (sd === 0) return [];

  return points.filter((p) => Math.abs(zScore(p.value, m, sd)) > zThreshold);
}

// ---------------------------------------------------------------------------
// Regression
// ---------------------------------------------------------------------------

/**
 * Compute a linear regression on data points and return a prediction function.
 */
export function computeRegression(points: DataPoint[]): {
  slope: number;
  intercept: number;
  predict: (x: number) => number;
} {
  if (points.length < 2) {
    return { slope: 0, intercept: 0, predict: () => 0 };
  }

  const pairs: [number, number][] = points.map((p, i) => [i, p.value]);
  const reg = linearRegression(pairs);
  const line = linearRegressionLine(reg);

  return {
    slope: reg.m,
    intercept: reg.b,
    predict: line,
  };
}

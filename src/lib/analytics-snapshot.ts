/**
 * Builds the numeric analytics snapshot POSTed to `/api/analytics/insights`.
 *
 * Runs the predefined analytics queries against local IndexedDB data and
 * reduces them to the aggregate-only shape the insights endpoint accepts —
 * no raw records or free text leave the device.
 */

import {
  bpTrend,
  weightTrend,
  fluidBalance,
  saltVsWeight,
  caffeineVsBP,
  alcoholVsBP,
  getRecordsByDomain,
} from "./analytics-service";
import type { TimeRange, TrendDirection } from "./analytics-types";
import type { AnalyticsInsightsRequest } from "./analytics-insights";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Insights always analyse a rolling window of this many days. */
export const INSIGHTS_WINDOW_DAYS = 30;

export interface IntakeGoals {
  waterGoalMl: number;
  sodiumLimitMg: number;
}

/** The rolling analysis window ending now. */
export function insightsRange(now: number = Date.now()): TimeRange {
  return { start: now - INSIGHTS_WINDOW_DAYS * MS_PER_DAY, end: now };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toTrend(t: TrendDirection) {
  return {
    direction: t.direction,
    slope: t.slope,
    confidence: clamp(t.confidence, 0, 1),
  };
}

/**
 * Assemble the analytics snapshot for the given range. Metric groups with no
 * underlying data are omitted; `snapshotIsEmpty` reports when nothing remains.
 */
export async function buildAnalyticsSnapshot(
  range: TimeRange,
  goals: IntakeGoals,
): Promise<AnalyticsInsightsRequest> {
  const [bp, weight, fluid, water, salt, saltWeight, caffBp, alcBp] =
    await Promise.all([
      bpTrend(range),
      weightTrend(range),
      fluidBalance(range),
      getRecordsByDomain("water", range),
      getRecordsByDomain("salt", range),
      saltVsWeight(range),
      caffeineVsBP(range),
      alcoholVsBP(range),
    ]);

  const metrics: AnalyticsInsightsRequest["metrics"] = {};

  if (bp.value.readings.length > 0) {
    metrics.bp = {
      avgSystolic: bp.value.avg.systolic,
      avgDiastolic: bp.value.avg.diastolic,
      readingCount: bp.value.readings.length,
      systolicTrend: toTrend(bp.value.trend.systolic),
      diastolicTrend: toTrend(bp.value.trend.diastolic),
    };
  }

  if (weight.value.readings.length > 0) {
    const sorted = [...weight.value.readings].sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    metrics.weight = {
      avg: weight.value.avg,
      min: weight.value.min,
      max: weight.value.max,
      changeKg: sorted[sorted.length - 1]!.value - sorted[0]!.value,
      readingCount: sorted.length,
      trend: toTrend(weight.value.trend),
    };
  }

  if (fluid.value.daysTotal > 0) {
    metrics.fluidBalance = {
      avgBalanceMl: fluid.value.avgBalance,
      daysOnTarget: fluid.value.daysAboveTarget,
      daysTotal: fluid.value.daysTotal,
    };
  }

  if (
    (water.length > 0 || salt.length > 0) &&
    goals.waterGoalMl > 0 &&
    goals.sodiumLimitMg > 0
  ) {
    const days = Math.max(1, Math.round((range.end - range.start) / MS_PER_DAY));
    const sum = (pts: { value: number }[]) =>
      pts.reduce((acc, p) => acc + p.value, 0);
    metrics.intake = {
      avgWaterMl: sum(water) / days,
      avgSodiumMg: sum(salt) / days,
      waterGoalMl: goals.waterGoalMl,
      sodiumLimitMg: goals.sodiumLimitMg,
    };
  }

  const correlations = (
    [
      { domainA: "salt", domainB: "weight", result: saltWeight.value },
      { domainA: "caffeine", domainB: "bp", result: caffBp.value },
      { domainA: "alcohol", domainB: "bp", result: alcBp.value },
    ] as const
  )
    .filter(
      (c) => c.result.pairedDays > 0 && Number.isFinite(c.result.coefficient),
    )
    .map((c) => ({
      domainA: c.domainA,
      domainB: c.domainB,
      coefficient: clamp(c.result.coefficient, -1, 1),
      strength: c.result.strength,
      pairedDays: c.result.pairedDays,
    }));
  if (correlations.length > 0) {
    metrics.correlations = correlations;
  }

  return { range, metrics };
}

/** True when no metric group survived — there is nothing to summarise. */
export function snapshotIsEmpty(req: AnalyticsInsightsRequest): boolean {
  const m = req.metrics;
  return (
    !m.bp &&
    !m.weight &&
    !m.fluidBalance &&
    !m.intake &&
    !(m.correlations && m.correlations.length > 0)
  );
}

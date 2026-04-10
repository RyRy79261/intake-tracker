"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  fluidBalance,
  adherenceRate,
  bpTrend,
  weightTrend,
  saltVsWeight,
  caffeineVsBP,
  alcoholVsBP,
  correlate,
} from "@/lib/analytics-service";
import type {
  Domain,
  TimeScope,
  TimeRange,
  AnalyticsResult,
  FluidBalanceResult,
  AdherenceResult,
  BPTrendResult,
  WeightTrendResult,
  CorrelationResult,
  Insight,
} from "@/lib/analytics-types";

// ---------------------------------------------------------------------------
// Default values (eliminate loading states -- instant render)
// ---------------------------------------------------------------------------

const EMPTY_RANGE: TimeRange = { start: 0, end: 0 };

const DEFAULT_FLUID_BALANCE: AnalyticsResult<FluidBalanceResult> = {
  value: {
    daily: [],
    intraday: [],
    avgBalance: 0,
    daysAboveTarget: 0,
    daysTotal: 0,
  },
  unit: "ml",
  period: EMPTY_RANGE,
  dataPoints: [],
};

const DEFAULT_ADHERENCE: AnalyticsResult<AdherenceResult> = {
  value: {
    rate: 0,
    taken: 0,
    total: 0,
    daily: [],
  },
  unit: "ratio",
  period: EMPTY_RANGE,
  dataPoints: [],
};

const DEFAULT_BP_TREND: AnalyticsResult<BPTrendResult> = {
  value: {
    readings: [],
    trend: {
      systolic: { slope: 0, direction: "stable", confidence: 0 },
      diastolic: { slope: 0, direction: "stable", confidence: 0 },
    },
    avg: { systolic: 0, diastolic: 0 },
  },
  unit: "mmHg",
  period: EMPTY_RANGE,
  dataPoints: [],
};

const DEFAULT_WEIGHT_TREND: AnalyticsResult<WeightTrendResult> = {
  value: {
    readings: [],
    trend: { slope: 0, direction: "stable", confidence: 0 },
    avg: 0,
    min: 0,
    max: 0,
  },
  unit: "kg",
  period: EMPTY_RANGE,
  dataPoints: [],
};

const DEFAULT_CORRELATION: AnalyticsResult<CorrelationResult> = {
  value: {
    coefficient: 0,
    strength: "none",
    seriesA: [],
    seriesB: [],
    lagDays: 0,
  },
  unit: "correlation",
  period: EMPTY_RANGE,
  dataPoints: [],
};

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Reactive fluid balance data for a time range.
 */
export function useFluidBalance(range: TimeRange) {
  return useLiveQuery(
    () => fluidBalance(range),
    [range.start, range.end],
    DEFAULT_FLUID_BALANCE,
  );
}

/**
 * Reactive medication adherence rate, optionally filtered by prescription.
 */
export function useAdherenceRate(range: TimeRange, prescriptionId?: string) {
  return useLiveQuery(
    () => adherenceRate(range, prescriptionId),
    [range.start, range.end, prescriptionId],
    DEFAULT_ADHERENCE,
  );
}

/**
 * Reactive blood pressure trend analysis.
 */
export function useBPTrend(range: TimeRange) {
  return useLiveQuery(
    () => bpTrend(range),
    [range.start, range.end],
    DEFAULT_BP_TREND,
  );
}

/**
 * Reactive weight trend analysis.
 */
export function useWeightTrend(range: TimeRange) {
  return useLiveQuery(
    () => weightTrend(range),
    [range.start, range.end],
    DEFAULT_WEIGHT_TREND,
  );
}

/**
 * Reactive salt vs weight correlation with optional lag.
 */
export function useSaltVsWeight(range: TimeRange, lagDays?: number) {
  return useLiveQuery(
    () => saltVsWeight(range, lagDays),
    [range.start, range.end, lagDays],
    DEFAULT_CORRELATION,
  );
}

/**
 * Reactive caffeine vs blood pressure correlation.
 */
export function useCaffeineVsBP(range: TimeRange) {
  return useLiveQuery(
    () => caffeineVsBP(range),
    [range.start, range.end],
    DEFAULT_CORRELATION,
  );
}

/**
 * Reactive alcohol vs blood pressure correlation.
 */
export function useAlcoholVsBP(range: TimeRange) {
  return useLiveQuery(
    () => alcoholVsBP(range),
    [range.start, range.end],
    DEFAULT_CORRELATION,
  );
}

/**
 * Reactive custom domain correlation.
 */
export function useCorrelation(
  domainA: Domain,
  domainB: Domain,
  range: TimeRange,
  lagDays?: number,
) {
  return useLiveQuery(
    async () => {
      const result = await correlate(domainA, domainB, range, lagDays);
      return {
        value: result,
        unit: "correlation",
        period: range,
        dataPoints: result.seriesA,
      } as AnalyticsResult<CorrelationResult>;
    },
    [domainA, domainB, range.start, range.end, lagDays],
    DEFAULT_CORRELATION,
  );
}

// ---------------------------------------------------------------------------
// Insights hook
// ---------------------------------------------------------------------------

/**
 * Derive cross-domain insights from multiple analytics queries.
 * Returns Insight[] with meaningful alerts based on thresholds.
 */
// GH-32: Default auto-generated insights removed. Only user-created insights are supported.
export function useInsights(_range: TimeRange) {
  return [] as Insight[];
}

// ---------------------------------------------------------------------------
// Time scope utility
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Convert a TimeScope preset to a concrete TimeRange.
 * Memoized to prevent unnecessary re-renders.
 */
export function useTimeScopeRange(scope: TimeScope): TimeRange {
  return useMemo(() => {
    const end = Date.now();
    let start: number;
    switch (scope) {
      case "24h":
        start = end - 1 * MS_PER_DAY;
        break;
      case "7d":
        start = end - 7 * MS_PER_DAY;
        break;
      case "30d":
        start = end - 30 * MS_PER_DAY;
        break;
      case "90d":
        start = end - 90 * MS_PER_DAY;
        break;
      case "all":
        start = 0;
        break;
      default:
        start = end - 7 * MS_PER_DAY;
    }
    return { start, end };
  }, [scope]);
}

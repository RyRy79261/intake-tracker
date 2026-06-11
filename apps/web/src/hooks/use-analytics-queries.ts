"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  fluidBalance,
  adherenceRate,
  bpTrend,
  weightTrend,
  saltVsWeight,
  sugarVsWeight,
  potassiumVsWeight,
  caffeineVsBP,
  alcoholVsBP,
  correlate,
} from "@/lib/analytics-service";
import { startOfDay, endOfDay, subDays } from "date-fns";
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
    pairs: [],
    pairedDays: 0,
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
 * Reactive sugar vs weight correlation with optional lag.
 */
export function useSugarVsWeight(range: TimeRange, lagDays?: number) {
  return useLiveQuery(
    () => sugarVsWeight(range, lagDays),
    [range.start, range.end, lagDays],
    DEFAULT_CORRELATION,
  );
}

/**
 * Reactive potassium vs weight correlation with optional lag.
 */
export function usePotassiumVsWeight(range: TimeRange, lagDays?: number) {
  return useLiveQuery(
    () => potassiumVsWeight(range, lagDays),
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
// Time scope utility
// ---------------------------------------------------------------------------

/**
 * Convert a TimeScope preset to a concrete TimeRange aligned to calendar-day
 * boundaries — the range ends at the end of today and starts at the start of
 * the first included day, so daily grouping never produces partial edge days.
 * Memoized to prevent unnecessary re-renders.
 */
export function useTimeScopeRange(scope: TimeScope): TimeRange {
  return useMemo(() => {
    const now = new Date();
    const end = endOfDay(now).getTime();
    let start: number;
    switch (scope) {
      case "24h":
        start = startOfDay(now).getTime();
        break;
      case "7d":
        start = startOfDay(subDays(now, 6)).getTime();
        break;
      case "30d":
        start = startOfDay(subDays(now, 29)).getTime();
        break;
      case "90d":
        start = startOfDay(subDays(now, 89)).getTime();
        break;
      case "all":
        start = 0;
        break;
      default:
        start = startOfDay(subDays(now, 6)).getTime();
    }
    return { start, end };
  }, [scope]);
}

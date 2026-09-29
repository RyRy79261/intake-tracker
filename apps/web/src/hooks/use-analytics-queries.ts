"use client";

import { useMemo } from "react";
import { useLiveQuery } from "@/hooks/use-live-query";
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
import { useNowTick } from "@intake/ui/use-now-tick";
import { logicalDayKey, logicalDayStart, shiftDayKey } from "@intake/core/logical-day";
import { useSettingsStore } from "@/stores/settings-store";
import { getDeviceTimezone } from "@/lib/timezone";
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
} from "@intake/types/analytics";

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
    skipped: 0,
    missed: 0,
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

const SCOPE_DAYS: Record<Exclude<TimeScope, "all">, number> = {
  // "24h" is labelled "Today": the current logical day, not a rolling window.
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * Convert a TimeScope preset to a concrete TimeRange aligned to logical-day
 * boundaries (the user's dayStartHour in the device zone, as on the
 * dashboard). The range ends at the end of the current logical day and starts
 * at the start of the first included day, so daily grouping never produces
 * partial edge days.
 *
 * A minute tick re-derives today's key, so a page left open (or a PWA resumed)
 * past the day boundary moves forward. The range object only changes when the
 * key does, keeping every live query keyed on it stable in between.
 */
export function useTimeScopeRange(scope: TimeScope): TimeRange {
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const tick = useNowTick();
  const tz = getDeviceTimezone();
  const todayKey = useMemo(
    () => logicalDayKey(Date.now(), dayStartHour, tz),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces a re-read of the clock
    [tick, dayStartHour, tz],
  );

  return useMemo(() => {
    const end = logicalDayStart(shiftDayKey(todayKey, 1), dayStartHour, tz) - 1;
    if (scope === "all") return { start: 0, end };
    const days = SCOPE_DAYS[scope] ?? SCOPE_DAYS["7d"];
    const start = logicalDayStart(shiftDayKey(todayKey, -(days - 1)), dayStartHour, tz);
    return { start, end };
  }, [scope, todayKey, dayStartHour, tz]);
}

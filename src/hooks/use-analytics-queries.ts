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
  getRecordsByDomain,
} from "@/lib/analytics-service";
import { detectAnomalies } from "@/lib/analytics-stats";
import { useSettingsStore } from "@/stores/settings-store";
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
export function useInsights(range: TimeRange) {
  // Read thresholds from settings store (outside useLiveQuery callback)
  const insightThresholds = useSettingsStore((s) => s.insightThresholds);
  const adherenceThreshold = (insightThresholds?.adherence_drop ?? 80) / 100;
  const fluidDeficitThreshold = (insightThresholds?.fluid_deficit ?? 50) / 100;

  return useLiveQuery(
    async () => {
      const [adherenceData, bpData, fluidData, weightPoints] =
        await Promise.all([
          adherenceRate(range),
          bpTrend(range),
          fluidBalance(range),
          getRecordsByDomain("weight", range),
        ]);

      const insights: Insight[] = [];
      const now = Date.now();

      // Adherence drop: rate below user-configured threshold (default 80%)
      if (
        adherenceData.value.total > 0 &&
        adherenceData.value.rate < adherenceThreshold
      ) {
        insights.push({
          id: `adherence_drop_${range.start}`,
          type: "adherence_drop",
          title: "Medication Adherence Below Target",
          description: `Adherence is ${Math.round(adherenceData.value.rate * 100)}% (target: ${Math.round(adherenceThreshold * 100)}%). ${adherenceData.value.taken} of ${adherenceData.value.total} doses taken.`,
          severity: adherenceData.value.rate < 0.5 ? "alert" : "warning",
          value: adherenceData.value.rate,
          threshold: adherenceThreshold,
          timestamp: now,
        });
      }

      // BP trend: significant systolic trend
      const systolicTrend = bpData.value.trend.systolic;
      if (
        bpData.value.readings.length >= 3 &&
        systolicTrend.confidence > 0.3 &&
        systolicTrend.direction !== "stable"
      ) {
        const rising = systolicTrend.direction === "rising";
        insights.push({
          id: `bp_trend_${range.start}`,
          type: "bp_trend",
          title: `Blood Pressure ${rising ? "Rising" : "Falling"}`,
          description: `Systolic BP is trending ${systolicTrend.direction} with ${Math.round(systolicTrend.confidence * 100)}% confidence. Average: ${Math.round(bpData.value.avg.systolic)}/${Math.round(bpData.value.avg.diastolic)} mmHg.`,
          severity: rising ? "warning" : "info",
          value: systolicTrend.slope,
          threshold: 0.01,
          timestamp: now,
        });
      }

      // Fluid deficit: more than threshold % of days below target (default 50%)
      if (fluidData.value.daysTotal >= 3) {
        const deficitRatio =
          1 - fluidData.value.daysAboveTarget / fluidData.value.daysTotal;
        if (deficitRatio > fluidDeficitThreshold) {
          insights.push({
            id: `fluid_deficit_${range.start}`,
            type: "fluid_deficit",
            title: "Frequent Fluid Deficit",
            description: `Only ${fluidData.value.daysAboveTarget} of ${fluidData.value.daysTotal} days met fluid intake target. Average balance: ${Math.round(fluidData.value.avgBalance)} ml.`,
            severity: deficitRatio > 0.75 ? "alert" : "warning",
            value: deficitRatio,
            threshold: fluidDeficitThreshold,
            timestamp: now,
          });
        }
      }

      // Weight anomalies via z-score detection
      const anomalies = detectAnomalies(weightPoints);
      if (anomalies.length > 0) {
        insights.push({
          id: `anomaly_weight_${range.start}`,
          type: "anomaly",
          title: "Unusual Weight Reading Detected",
          description: `${anomalies.length} weight reading(s) deviate significantly from the norm during this period.`,
          severity: "info",
          value: anomalies.length,
          threshold: 1,
          timestamp: now,
        });
      }

      return insights;
    },
    [range.start, range.end, adherenceThreshold, fluidDeficitThreshold],
    [] as Insight[],
  );
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

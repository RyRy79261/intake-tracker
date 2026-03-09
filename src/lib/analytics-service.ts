import { format, startOfDay, endOfDay } from "date-fns";
import { getRecordsByDateRange as getIntakeRecordsByDateRange } from "./intake-service";
import {
  getWeightRecordsByDateRange,
  getBloodPressureRecordsByDateRange,
} from "./health-service";
import { getUrinationRecordsByDateRange } from "./urination-service";
import { getEatingRecordsByDateRange } from "./eating-service";
import { getDefecationRecordsByDateRange } from "./defecation-service";
import { getDoseScheduleForDateRange } from "./dose-schedule-service";
import { db, type SubstanceRecord } from "./db";
import { trend as computeTrend, correlateTimeSeries } from "./analytics-stats";
import type {
  Domain,
  TimeRange,
  DataPoint,
  AnalyticsResult,
  FluidBalanceDay,
  FluidBalanceResult,
  AdherenceResult,
  BPTrendResult,
  WeightTrendResult,
  CorrelationResult,
} from "./analytics-types";
import { URINATION_ESTIMATE_ML, DEFAULT_SALT_WEIGHT_LAG_DAYS } from "./analytics-types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Query substance records by date range. This is an exception to the
 * "no db imports" rule -- no substance-service exists yet.
 */
async function getSubstanceRecordsByDateRange(
  type: "caffeine" | "alcohol",
  start: number,
  end: number,
): Promise<SubstanceRecord[]> {
  try {
    return await db.substanceRecords
      .where("[type+timestamp]")
      .between([type, start], [type, end])
      .toArray();
  } catch {
    // Table may not exist in older schema versions
    return [];
  }
}

function dayKey(ts: number): string {
  return format(new Date(ts), "yyyy-MM-dd");
}

// ---------------------------------------------------------------------------
// Layer 1 -- Building Blocks
// ---------------------------------------------------------------------------

/**
 * Fetch records for a given domain and normalize to DataPoint[].
 */
export async function getRecordsByDomain(
  domain: Domain,
  range: TimeRange,
): Promise<DataPoint[]> {
  const { start, end } = range;

  switch (domain) {
    case "water": {
      const records = await getIntakeRecordsByDateRange(start, end, "water");
      return records.map((r) => ({
        timestamp: r.timestamp,
        value: r.amount, // ml
      }));
    }
    case "salt": {
      const records = await getIntakeRecordsByDateRange(start, end, "salt");
      return records.map((r) => ({
        timestamp: r.timestamp,
        value: r.amount, // mg
      }));
    }
    case "weight": {
      const records = await getWeightRecordsByDateRange(start, end);
      return records.map((r) => ({
        timestamp: r.timestamp,
        value: r.weight, // kg
      }));
    }
    case "bp": {
      const records = await getBloodPressureRecordsByDateRange(start, end);
      return records.map((r) => ({
        timestamp: r.timestamp,
        value: r.systolic, // mmHg
      }));
    }
    case "urination": {
      const records = await getUrinationRecordsByDateRange(start, end);
      return records.map((r) => ({
        timestamp: r.timestamp,
        value: URINATION_ESTIMATE_ML[r.amountEstimate ?? "medium"] ?? 300,
      }));
    }
    case "eating": {
      const records = await getEatingRecordsByDateRange(start, end);
      return records.map((r) => ({
        timestamp: r.timestamp,
        value: 1, // 1 per event
      }));
    }
    case "defecation": {
      const records = await getDefecationRecordsByDateRange(start, end);
      return records.map((r) => ({
        timestamp: r.timestamp,
        value: 1,
      }));
    }
    case "caffeine": {
      const records = await getSubstanceRecordsByDateRange("caffeine", start, end);
      return records.map((r) => ({
        timestamp: r.timestamp,
        value: r.amountMg ?? 0,
      }));
    }
    case "alcohol": {
      const records = await getSubstanceRecordsByDateRange("alcohol", start, end);
      return records.map((r) => ({
        timestamp: r.timestamp,
        value: r.amountStandardDrinks ?? 0,
      }));
    }
    case "medication": {
      // Medication doesn't have a single numeric value; return empty
      return [];
    }
    default:
      return [];
  }
}

/**
 * Group DataPoint[] by calendar date (midnight boundaries).
 */
export function groupByDay(points: DataPoint[]): Map<string, DataPoint[]> {
  const map = new Map<string, DataPoint[]>();
  for (const p of points) {
    const key = dayKey(p.timestamp);
    const arr = map.get(key) ?? [];
    arr.push(p);
    map.set(key, arr);
  }
  return map;
}

/**
 * Correlate two domains over a time range with optional lag.
 */
export async function correlate(
  domainA: Domain,
  domainB: Domain,
  range: TimeRange,
  lagDays?: number,
): Promise<CorrelationResult> {
  const [seriesA, seriesB] = await Promise.all([
    getRecordsByDomain(domainA, range),
    getRecordsByDomain(domainB, range),
  ]);
  return correlateTimeSeries(seriesA, seriesB, lagDays);
}

// ---------------------------------------------------------------------------
// Layer 2 -- Pre-built Queries
// ---------------------------------------------------------------------------

/**
 * Fluid balance: daily totals + intraday running balance.
 */
export async function fluidBalance(
  range: TimeRange,
): Promise<AnalyticsResult<FluidBalanceResult>> {
  const [waterPoints, urinationPoints] = await Promise.all([
    getRecordsByDomain("water", range),
    getRecordsByDomain("urination", range),
  ]);

  const waterByDay = groupByDay(waterPoints);
  const urinationByDay = groupByDay(urinationPoints);

  // Collect all unique days
  const allDays = new Set<string>();
  waterByDay.forEach((_, key) => allDays.add(key));
  urinationByDay.forEach((_, key) => allDays.add(key));

  const sortedDays = Array.from(allDays).sort();

  const daily: FluidBalanceDay[] = sortedDays.map((date) => {
    const waterPts = waterByDay.get(date) ?? [];
    const urinePts = urinationByDay.get(date) ?? [];
    const intakeMl = waterPts.reduce((sum, p) => sum + p.value, 0);
    const urinationCount = urinePts.length;
    const urinationEstimatedMl = urinePts.reduce((sum, p) => sum + p.value, 0);
    const balance = intakeMl - urinationEstimatedMl;
    // Target = 500ml above output per context
    const target = urinationEstimatedMl + 500;

    return {
      date,
      intakeMl,
      urinationCount,
      urinationEstimatedMl,
      balance,
      target,
    };
  });

  // Intraday: merge all events chronologically with running cumulative balance
  const allEvents = [
    ...waterPoints.map((p) => ({ ...p, type: "intake" as const })),
    ...urinationPoints.map((p) => ({ ...p, type: "output" as const })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  let cumulative = 0;
  const intraday: DataPoint[] = allEvents.map((e) => {
    cumulative += e.type === "intake" ? e.value : -e.value;
    return { timestamp: e.timestamp, value: cumulative };
  });

  const avgBalance =
    daily.length > 0
      ? daily.reduce((sum, d) => sum + d.balance, 0) / daily.length
      : 0;

  const daysAboveTarget = daily.filter((d) => d.intakeMl >= d.target).length;

  return {
    value: {
      daily,
      intraday,
      avgBalance,
      daysAboveTarget,
      daysTotal: daily.length,
    },
    unit: "ml",
    period: range,
    dataPoints: waterPoints,
  };
}

/**
 * Medication adherence rate.
 */
export async function adherenceRate(
  range: TimeRange,
  prescriptionId?: string,
): Promise<AnalyticsResult<AdherenceResult>> {
  const startDate = format(new Date(range.start), "yyyy-MM-dd");
  const endDate = format(new Date(range.end), "yyyy-MM-dd");

  const scheduleMap = await getDoseScheduleForDateRange(startDate, endDate);

  let totalTaken = 0;
  let totalSlots = 0;
  const dailyEntries: AdherenceResult["daily"] = [];

  scheduleMap.forEach((slots, date) => {
    const filteredSlots = prescriptionId
      ? slots.filter((s) => s.prescriptionId === prescriptionId)
      : slots;

    const dayTotal = filteredSlots.length;
    const dayTaken = filteredSlots.filter((s) => s.status === "taken").length;

    totalSlots += dayTotal;
    totalTaken += dayTaken;

    if (dayTotal > 0) {
      dailyEntries.push({
        date,
        rate: dayTaken / dayTotal,
        taken: dayTaken,
        total: dayTotal,
      });
    }
  });

  const rate = totalSlots > 0 ? totalTaken / totalSlots : 0;

  return {
    value: {
      rate,
      taken: totalTaken,
      total: totalSlots,
      daily: dailyEntries,
    },
    unit: "ratio",
    period: range,
    dataPoints: dailyEntries.map((d) => ({
      timestamp: new Date(d.date + "T12:00:00").getTime(),
      value: d.rate,
      label: d.date,
    })),
  };
}

/**
 * Blood pressure trend analysis.
 */
export async function bpTrend(
  range: TimeRange,
): Promise<AnalyticsResult<BPTrendResult>> {
  const records = await getBloodPressureRecordsByDateRange(range.start, range.end);

  const readings = records.map((r) => ({
    timestamp: r.timestamp,
    systolic: r.systolic,
    diastolic: r.diastolic,
    ...(r.heartRate !== undefined && { heartRate: r.heartRate }),
    position: r.position,
  }));

  const systolicPoints: DataPoint[] = records.map((r) => ({
    timestamp: r.timestamp,
    value: r.systolic,
  }));

  const diastolicPoints: DataPoint[] = records.map((r) => ({
    timestamp: r.timestamp,
    value: r.diastolic,
  }));

  const systolicTrend = computeTrend(systolicPoints);
  const diastolicTrend = computeTrend(diastolicPoints);

  const avgSystolic =
    readings.length > 0
      ? readings.reduce((sum, r) => sum + r.systolic, 0) / readings.length
      : 0;
  const avgDiastolic =
    readings.length > 0
      ? readings.reduce((sum, r) => sum + r.diastolic, 0) / readings.length
      : 0;

  return {
    value: {
      readings,
      trend: { systolic: systolicTrend, diastolic: diastolicTrend },
      avg: { systolic: avgSystolic, diastolic: avgDiastolic },
    },
    unit: "mmHg",
    period: range,
    dataPoints: systolicPoints,
  };
}

/**
 * Weight trend analysis.
 */
export async function weightTrend(
  range: TimeRange,
): Promise<AnalyticsResult<WeightTrendResult>> {
  const records = await getWeightRecordsByDateRange(range.start, range.end);

  const points: DataPoint[] = records.map((r) => ({
    timestamp: r.timestamp,
    value: r.weight,
  }));

  const trendDir = computeTrend(points);
  const values = points.map((p) => p.value);

  return {
    value: {
      readings: points,
      trend: trendDir,
      avg: values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0,
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0,
    },
    unit: "kg",
    period: range,
    dataPoints: points,
  };
}

/**
 * Salt intake vs weight correlation with configurable lag.
 */
export async function saltVsWeight(
  range: TimeRange,
  lagDays: number = DEFAULT_SALT_WEIGHT_LAG_DAYS,
): Promise<AnalyticsResult<CorrelationResult>> {
  const result = await correlate("salt", "weight", range, lagDays);
  return {
    value: result,
    unit: "correlation",
    period: range,
    dataPoints: result.seriesA,
  };
}

/**
 * Caffeine intake vs blood pressure correlation.
 */
export async function caffeineVsBP(
  range: TimeRange,
): Promise<AnalyticsResult<CorrelationResult>> {
  const result = await correlate("caffeine", "bp", range);
  return {
    value: result,
    unit: "correlation",
    period: range,
    dataPoints: result.seriesA,
  };
}

/**
 * Alcohol intake vs blood pressure correlation.
 */
export async function alcoholVsBP(
  range: TimeRange,
): Promise<AnalyticsResult<CorrelationResult>> {
  const result = await correlate("alcohol", "bp", range);
  return {
    value: result,
    unit: "correlation",
    period: range,
    dataPoints: result.seriesA,
  };
}

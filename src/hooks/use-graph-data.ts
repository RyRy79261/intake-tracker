"use client";

import { useQuery } from "@tanstack/react-query";
import { getRecordsByDateRange } from "@/lib/intake-service";
import {
  getWeightRecordsByDateRange,
  getBloodPressureRecordsByDateRange,
} from "@/lib/health-service";
import {
  getEatingRecordsByDateRange,
} from "@/lib/eating-service";
import {
  getUrinationRecordsByDateRange,
} from "@/lib/urination-service";
import type {
  IntakeRecord,
  WeightRecord,
  BloodPressureRecord,
  EatingRecord,
  UrinationRecord,
} from "@/lib/db";

export type GraphScope = "24h" | "7d" | "30d";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function getRange(scope: GraphScope): { startTime: number; endTime: number } {
  const endTime = Date.now();
  let startTime: number;
  switch (scope) {
    case "24h":
      startTime = endTime - 24 * MS_PER_HOUR;
      break;
    case "7d":
      startTime = endTime - 7 * MS_PER_DAY;
      break;
    case "30d":
      startTime = endTime - 30 * MS_PER_DAY;
      break;
    default:
      startTime = endTime - 24 * MS_PER_HOUR;
  }
  return { startTime, endTime };
}

export interface GraphMetrics {
  avgWeight: number | null;
  avgBPSitting: { systolic: number; diastolic: number } | null;
  avgBPStanding: { systolic: number; diastolic: number } | null;
  avgHeartRate: number | null;
}

export interface GraphData {
  startTime: number;
  endTime: number;
  /** The visible display start (same as startTime). Intake records may include
   *  24h of lookback data before this point for rolling-total calculations. */
  displayStartTime: number;
  scope: GraphScope;
  waterRecords: IntakeRecord[];
  saltRecords: IntakeRecord[];
  weightRecords: WeightRecord[];
  bloodPressureRecords: BloodPressureRecord[];
  eatingRecords: EatingRecord[];
  urinationRecords: UrinationRecord[];
  metrics: GraphMetrics;
}

function computeMetrics(
  weightRecords: WeightRecord[],
  bloodPressureRecords: BloodPressureRecord[]
): GraphMetrics {
  const avgWeight =
    weightRecords.length > 0
      ? weightRecords.reduce((s, r) => s + r.weight, 0) / weightRecords.length
      : null;

  const bpSitting = bloodPressureRecords.filter((r) => r.position === "sitting");
  const bpStanding = bloodPressureRecords.filter(
    (r) => r.position === "standing"
  );

  const avgBPSitting =
    bpSitting.length > 0
      ? {
          systolic:
            bpSitting.reduce((s, r) => s + r.systolic, 0) / bpSitting.length,
          diastolic:
            bpSitting.reduce((s, r) => s + r.diastolic, 0) / bpSitting.length,
        }
      : null;

  const avgBPStanding =
    bpStanding.length > 0
      ? {
          systolic:
            bpStanding.reduce((s, r) => s + r.systolic, 0) / bpStanding.length,
          diastolic:
            bpStanding.reduce((s, r) => s + r.diastolic, 0) / bpStanding.length,
        }
      : null;

  const hrRecords = bloodPressureRecords.filter((r) => r.heartRate != null);
  const avgHeartRate =
    hrRecords.length > 0
      ? hrRecords.reduce((s, r) => s + (r.heartRate ?? 0), 0) / hrRecords.length
      : null;

  return { avgWeight, avgBPSitting, avgBPStanding, avgHeartRate };
}

async function fetchGraphData(scope: GraphScope): Promise<GraphData> {
  const { startTime, endTime } = getRange(scope);

  // Fetch water/salt with 24h lookback so rolling-24h totals are accurate
  // at the start of the visible range.
  const intakeLookbackStart = startTime - MS_PER_DAY;

  const [waterRecords, saltRecords, weightRecords, bloodPressureRecords, eatingRecords, urinationRecords] =
    await Promise.all([
      getRecordsByDateRange(intakeLookbackStart, endTime, "water"),
      getRecordsByDateRange(intakeLookbackStart, endTime, "salt"),
      getWeightRecordsByDateRange(startTime, endTime),
      getBloodPressureRecordsByDateRange(startTime, endTime),
      getEatingRecordsByDateRange(startTime, endTime),
      getUrinationRecordsByDateRange(startTime, endTime),
    ]);

  const metrics = computeMetrics(weightRecords, bloodPressureRecords);

  return {
    startTime,
    endTime,
    displayStartTime: startTime,
    scope,
    waterRecords,
    saltRecords,
    weightRecords,
    bloodPressureRecords,
    eatingRecords,
    urinationRecords,
    metrics,
  };
}

export const graphKeys = {
  all: ["graph"] as const,
  byScope: (scope: GraphScope) => [...graphKeys.all, scope] as const,
};

export function useGraphData(scope: GraphScope) {
  return useQuery({
    queryKey: graphKeys.byScope(scope),
    queryFn: () => fetchGraphData(scope),
  });
}

export { getRange };

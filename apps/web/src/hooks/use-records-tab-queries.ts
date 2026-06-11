"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { type UnifiedRecord, getRecordTimestamp } from "@/lib/history-types";
import { getRecordsByDateRange } from "@/lib/intake-service";
import {
  getWeightRecordsByDateRange,
  getBloodPressureRecordsByDateRange,
  deleteWeightRecord,
  deleteBloodPressureRecord,
} from "@/lib/health-service";
import { getEatingRecordsByDateRange } from "@/lib/eating-service";
import { getUrinationRecordsByDateRange } from "@/lib/urination-service";
import { getDefecationRecordsByDateRange } from "@/lib/defecation-service";
import {
  getSubstanceRecordsByDateRange,
  deleteSubstanceRecord,
} from "@/lib/substance-service";
import { unwrap } from "@/lib/service-result";
import type { TimeRange } from "@/lib/analytics-types";

/**
 * Hook providing all domain records within a time range as a unified sorted array.
 * Uses useLiveQuery for reactive updates with [] default (instant render).
 */
export function useRecordsTabData(range: TimeRange) {
  const data = useLiveQuery(
    async (): Promise<UnifiedRecord[]> => {
      const [intake, weight, bp, eating, urination, defecation, substances] =
        await Promise.all([
          getRecordsByDateRange(range.start, range.end),
          getWeightRecordsByDateRange(range.start, range.end),
          getBloodPressureRecordsByDateRange(range.start, range.end),
          getEatingRecordsByDateRange(range.start, range.end),
          getUrinationRecordsByDateRange(range.start, range.end),
          getDefecationRecordsByDateRange(range.start, range.end),
          getSubstanceRecordsByDateRange(range.start, range.end),
        ]);

      const unified: UnifiedRecord[] = [
        ...intake.map((r) => ({ type: "intake" as const, record: r })),
        ...weight.map((r) => ({ type: "weight" as const, record: r })),
        ...bp.map((r) => ({ type: "bp" as const, record: r })),
        ...eating.map((r) => ({ type: "eating" as const, record: r })),
        ...urination.map((r) => ({ type: "urination" as const, record: r })),
        ...defecation.map((r) => ({ type: "defecation" as const, record: r })),
        ...substances.map((r) => ({
          type: r.type as "caffeine" | "alcohol",
          record: r,
        })),
      ];

      unified.sort((a, b) => getRecordTimestamp(b) - getRecordTimestamp(a));
      return unified;
    },
    [range.start, range.end],
    [] as UnifiedRecord[],
  );

  const deleteWeight = useCallback(async (id: string) => {
    unwrap(await deleteWeightRecord(id));
  }, []);

  const deleteBP = useCallback(async (id: string) => {
    unwrap(await deleteBloodPressureRecord(id));
  }, []);

  const deleteSubstance = useCallback(async (id: string) => {
    unwrap(await deleteSubstanceRecord(id));
  }, []);

  return { data, deleteWeight, deleteBP, deleteSubstance };
}

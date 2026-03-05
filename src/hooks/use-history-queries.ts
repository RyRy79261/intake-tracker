"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { type IntakeRecord, type WeightRecord, type BloodPressureRecord, type EatingRecord, type UrinationRecord, type DefecationRecord } from "@/lib/db";
import { getRecordsByCursor } from "@/lib/intake-service";
import { getWeightRecords, deleteWeightRecord, getBloodPressureRecords, deleteBloodPressureRecord } from "@/lib/health-service";
import { getEatingRecords } from "@/lib/eating-service";
import { getUrinationRecords } from "@/lib/urination-service";
import { getDefecationRecords } from "@/lib/defecation-service";
import { unwrap } from "@/lib/service-result";

export interface HistoryDataResult {
  intakeRecords: IntakeRecord[];
  weightRecords: WeightRecord[];
  bpRecords: BloodPressureRecord[];
  eatingRecords: EatingRecord[];
  urinationRecords: UrinationRecord[];
  defecationRecords: DefecationRecord[];
}

const EMPTY_RESULT: HistoryDataResult = {
  intakeRecords: [],
  weightRecords: [],
  bpRecords: [],
  eatingRecords: [],
  urinationRecords: [],
  defecationRecords: [],
};

/**
 * Hook providing reactive history data via useLiveQuery and async mutation functions.
 * Data is automatically refreshed when any underlying table changes.
 */
export function useHistoryData(limit: number = 100) {
  const data = useLiveQuery(async (): Promise<HistoryDataResult> => {
    let intakeRecords: IntakeRecord[] = [];
    let weightRecords: WeightRecord[] = [];
    let bpRecords: BloodPressureRecord[] = [];
    let eatingRecords: EatingRecord[] = [];
    let urinationRecords: UrinationRecord[] = [];
    let defecationRecords: DefecationRecord[] = [];

    try { const result = await getRecordsByCursor(undefined, limit); intakeRecords = result.records; } catch (e) { console.error("Failed to load intake records:", e); }
    try { weightRecords = await getWeightRecords(limit); } catch (e) { console.error("Failed to load weight records:", e); }
    try { bpRecords = await getBloodPressureRecords(limit); } catch (e) { console.error("Failed to load BP records:", e); }
    try { eatingRecords = await getEatingRecords(limit); } catch (e) { console.error("Failed to load eating records:", e); }
    try { urinationRecords = await getUrinationRecords(limit); } catch (e) { console.error("Failed to load urination records:", e); }
    try { defecationRecords = await getDefecationRecords(limit); } catch (e) { console.error("Failed to load defecation records:", e); }

    return { intakeRecords, weightRecords, bpRecords, eatingRecords, urinationRecords, defecationRecords };
  }, [limit], EMPTY_RESULT);

  const deleteWeight = useCallback(async (id: string) => {
    unwrap(await deleteWeightRecord(id));
  }, []);

  const deleteBP = useCallback(async (id: string) => {
    unwrap(await deleteBloodPressureRecord(id));
  }, []);

  return { data, deleteWeight, deleteBP };
}

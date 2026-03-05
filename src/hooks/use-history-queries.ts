"use client";

import { useCallback } from "react";
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

/**
 * Hook providing async functions for loading and managing history records.
 * Encapsulates service calls so the history page/drawer don't import services directly.
 */
export function useHistoryData() {
  const loadAllRecords = useCallback(async (limit: number = 100): Promise<HistoryDataResult> => {
    let intakeRecords: IntakeRecord[] = [];
    let weightRecords: WeightRecord[] = [];
    let bpRecords: BloodPressureRecord[] = [];
    let eatingRecords: EatingRecord[] = [];
    let urinationRecords: UrinationRecord[] = [];
    let defecationRecords: DefecationRecord[] = [];

    try { const result = unwrap(await getRecordsByCursor(undefined, limit)); intakeRecords = result.records; } catch (e) { console.error("Failed to load intake records:", e); }
    try { weightRecords = unwrap(await getWeightRecords(limit)); } catch (e) { console.error("Failed to load weight records:", e); }
    try { bpRecords = unwrap(await getBloodPressureRecords(limit)); } catch (e) { console.error("Failed to load BP records:", e); }
    try { eatingRecords = unwrap(await getEatingRecords(limit)); } catch (e) { console.error("Failed to load eating records:", e); }
    try { urinationRecords = unwrap(await getUrinationRecords(limit)); } catch (e) { console.error("Failed to load urination records:", e); }
    try { defecationRecords = unwrap(await getDefecationRecords(limit)); } catch (e) { console.error("Failed to load defecation records:", e); }

    return { intakeRecords, weightRecords, bpRecords, eatingRecords, urinationRecords, defecationRecords };
  }, []);

  const deleteWeight = useCallback(async (id: string) => {
    unwrap(await deleteWeightRecord(id));
  }, []);

  const deleteBP = useCallback(async (id: string) => {
    unwrap(await deleteBloodPressureRecord(id));
  }, []);

  return { loadAllRecords, deleteWeight, deleteBP };
}

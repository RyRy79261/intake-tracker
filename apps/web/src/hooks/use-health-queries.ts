"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMutation } from "@tanstack/react-query";
import {
  addWeightRecord,
  getWeightRecords,
  updateWeightRecord,
  deleteWeightRecord,
  addBloodPressureRecord,
  getBloodPressureRecords,
  updateBloodPressureRecord,
  deleteBloodPressureRecord,
} from "@/lib/health-service";
import { unwrap } from "@/lib/service-result";

// ============================================================================
// Mutation Parameter Types
// ============================================================================

export type AddWeightParams = {
  weight: number;
  timestamp?: number;
  note?: string;
};

export type UpdateWeightParams = {
  id: string;
  updates: {
    weight?: number;
    timestamp?: number;
    note?: string;
  };
};

export type AddBloodPressureParams = {
  systolic: number;
  diastolic: number;
  position: "sitting" | "standing";
  arm: "left" | "right";
  heartRate?: number;
  irregularHeartbeat?: boolean;
  timestamp?: number;
  note?: string;
};

export type UpdateBloodPressureParams = {
  id: string;
  updates: {
    systolic?: number;
    diastolic?: number;
    heartRate?: number;
    irregularHeartbeat?: boolean;
    position?: "sitting" | "standing";
    arm?: "left" | "right";
    timestamp?: number;
    note?: string;
  };
};

// ============================================================================
// Weight Records Hooks
// ============================================================================

/**
 * Hook to get recent weight records.
 */
export function useWeightRecords(limit: number = 5) {
  return useLiveQuery(() => getWeightRecords(limit), [limit]);
}

/**
 * Hook to get the latest weight record.
 */
export function useLatestWeight() {
  return useLiveQuery(async () => {
    const records = await getWeightRecords(1);
    return records[0] ?? null;
  }, [], null);
}

/**
 * Hook to add a weight record.
 */
export function useAddWeight() {
  return useMutation({
    mutationFn: async (params: AddWeightParams) =>
      unwrap(await addWeightRecord(params.weight, params.timestamp, params.note)),
  });
}

/**
 * Hook to update a weight record.
 */
export function useUpdateWeight() {
  return useMutation({
    mutationFn: async (params: UpdateWeightParams) =>
      unwrap(await updateWeightRecord(params.id, params.updates)),
  });
}

/**
 * Hook to delete a weight record.
 */
export function useDeleteWeight() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteWeightRecord(id)),
  });
}

// ============================================================================
// Blood Pressure Records Hooks
// ============================================================================

/**
 * Hook to get recent blood pressure records.
 */
export function useBloodPressureRecords(limit: number = 5) {
  return useLiveQuery(() => getBloodPressureRecords(limit), [limit], []);
}

/**
 * Hook to get the latest blood pressure record.
 */
export function useLatestBloodPressure() {
  return useLiveQuery(async () => {
    const records = await getBloodPressureRecords(1);
    return records[0] ?? null;
  }, [], null);
}

/**
 * Hook to add a blood pressure record.
 */
export function useAddBloodPressure() {
  return useMutation({
    mutationFn: async (params: AddBloodPressureParams) =>
      unwrap(await addBloodPressureRecord(
        params.systolic,
        params.diastolic,
        params.position,
        params.arm,
        params.heartRate,
        params.timestamp,
        params.note,
        params.irregularHeartbeat
      )),
  });
}

/**
 * Hook to update a blood pressure record.
 */
export function useUpdateBloodPressure() {
  return useMutation({
    mutationFn: async (params: UpdateBloodPressureParams) =>
      unwrap(await updateBloodPressureRecord(params.id, params.updates)),
  });
}

/**
 * Hook to delete a blood pressure record.
 */
export function useDeleteBloodPressure() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteBloodPressureRecord(id)),
  });
}

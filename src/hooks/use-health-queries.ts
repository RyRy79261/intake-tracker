"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type WeightRecord, type BloodPressureRecord } from "@/lib/db";
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

// Query keys factory
export const healthKeys = {
  all: ["health"] as const,
  weight: () => [...healthKeys.all, "weight"] as const,
  weightRecords: (limit?: number) => [...healthKeys.weight(), "records", limit] as const,
  weightLatest: () => [...healthKeys.weight(), "latest"] as const,
  bloodPressure: () => [...healthKeys.all, "bloodPressure"] as const,
  bpRecords: (limit?: number) => [...healthKeys.bloodPressure(), "records", limit] as const,
  bpLatest: () => [...healthKeys.bloodPressure(), "latest"] as const,
};

// ============================================================================
// Weight Records Hooks
// ============================================================================

/**
 * Hook to get recent weight records.
 */
export function useWeightRecords(limit: number = 5) {
  return useQuery({
    queryKey: healthKeys.weightRecords(limit),
    queryFn: () => getWeightRecords(limit),
  });
}

/**
 * Hook to get the latest weight record.
 */
export function useLatestWeight() {
  return useQuery({
    queryKey: healthKeys.weightLatest(),
    queryFn: async () => {
      const records = await getWeightRecords(1);
      return records[0] ?? null;
    },
  });
}

/**
 * Hook to add a weight record.
 */
export function useAddWeight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      weight,
      timestamp,
      note,
    }: {
      weight: number;
      timestamp?: number;
      note?: string;
    }) => addWeightRecord(weight, timestamp, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.weight() });
    },
  });
}

/**
 * Hook to update a weight record.
 */
export function useUpdateWeight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: { weight?: number; timestamp?: number; note?: string };
    }) => updateWeightRecord(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.weight() });
    },
  });
}

/**
 * Hook to delete a weight record.
 */
export function useDeleteWeight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteWeightRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.weight() });
    },
  });
}

// ============================================================================
// Blood Pressure Records Hooks
// ============================================================================

/**
 * Hook to get recent blood pressure records.
 */
export function useBloodPressureRecords(limit: number = 5) {
  return useQuery({
    queryKey: healthKeys.bpRecords(limit),
    queryFn: () => getBloodPressureRecords(limit),
  });
}

/**
 * Hook to get the latest blood pressure record.
 */
export function useLatestBloodPressure() {
  return useQuery({
    queryKey: healthKeys.bpLatest(),
    queryFn: async () => {
      const records = await getBloodPressureRecords(1);
      return records[0] ?? null;
    },
  });
}

/**
 * Hook to add a blood pressure record.
 */
export function useAddBloodPressure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      systolic,
      diastolic,
      position,
      arm,
      heartRate,
      timestamp,
      note,
    }: {
      systolic: number;
      diastolic: number;
      position: "sitting" | "standing";
      arm: "left" | "right";
      heartRate?: number;
      timestamp?: number;
      note?: string;
    }) => addBloodPressureRecord(systolic, diastolic, position, arm, heartRate, timestamp, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.bloodPressure() });
    },
  });
}

/**
 * Hook to update a blood pressure record.
 */
export function useUpdateBloodPressure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        systolic?: number;
        diastolic?: number;
        heartRate?: number;
        position?: "sitting" | "standing";
        arm?: "left" | "right";
        timestamp?: number;
        note?: string;
      };
    }) => updateBloodPressureRecord(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.bloodPressure() });
    },
  });
}

/**
 * Hook to delete a blood pressure record.
 */
export function useDeleteBloodPressure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBloodPressureRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.bloodPressure() });
    },
  });
}

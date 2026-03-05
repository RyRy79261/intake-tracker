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
import { unwrap } from "@/lib/service-result";
import { graphKeys } from "@/hooks/use-graph-data";

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
// Query keys factory
// ============================================================================
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
    queryFn: async () => unwrap(await getWeightRecords(limit)),
  });
}

/**
 * Hook to get the latest weight record.
 */
export function useLatestWeight() {
  return useQuery({
    queryKey: healthKeys.weightLatest(),
    queryFn: async () => {
      const records = unwrap(await getWeightRecords(1));
      return records[0] ?? null;
    },
  });
}

/**
 * Hook to add a weight record with optimistic updates.
 */
export function useAddWeight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddWeightParams) =>
      unwrap(await addWeightRecord(params.weight, params.timestamp, params.note)),
    onMutate: async (newWeight) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: healthKeys.weight() });

      // Snapshot the previous value
      const previous = queryClient.getQueryData<WeightRecord[]>(
        healthKeys.weightRecords(5)
      );

      // Optimistically update to the new value
      queryClient.setQueryData<WeightRecord[]>(
        healthKeys.weightRecords(5),
        (old) => [
          {
            id: `temp-${Date.now()}`,
            weight: newWeight.weight,
            timestamp: newWeight.timestamp ?? Date.now(),
            ...(newWeight.note !== undefined && { note: newWeight.note }),
          } as WeightRecord,
          ...(old ?? []).slice(0, 4),
        ]
      );

      // Return context with the previous value
      return { previous };
    },
    onError: (_err, _newWeight, context) => {
      // Rollback to the previous value on error
      if (context?.previous) {
        queryClient.setQueryData(healthKeys.weightRecords(5), context.previous);
      }
    },
    onSettled: () => {
      // Refetch after error or success to ensure we have the correct data
      queryClient.invalidateQueries({ queryKey: healthKeys.weight() });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

/**
 * Hook to update a weight record.
 */
export function useUpdateWeight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateWeightParams) =>
      unwrap(await updateWeightRecord(params.id, params.updates)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.weight() });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

/**
 * Hook to delete a weight record.
 */
export function useDeleteWeight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteWeightRecord(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.weight() });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
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
    queryFn: async () => unwrap(await getBloodPressureRecords(limit)),
  });
}

/**
 * Hook to get the latest blood pressure record.
 */
export function useLatestBloodPressure() {
  return useQuery({
    queryKey: healthKeys.bpLatest(),
    queryFn: async () => {
      const records = unwrap(await getBloodPressureRecords(1));
      return records[0] ?? null;
    },
  });
}

/**
 * Hook to add a blood pressure record with optimistic updates.
 */
export function useAddBloodPressure() {
  const queryClient = useQueryClient();

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
    onMutate: async (newBP) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: healthKeys.bloodPressure() });

      // Snapshot the previous value
      const previous = queryClient.getQueryData<BloodPressureRecord[]>(
        healthKeys.bpRecords(5)
      );

      // Optimistically update to the new value
      queryClient.setQueryData<BloodPressureRecord[]>(
        healthKeys.bpRecords(5),
        (old) => [
          {
            id: `temp-${Date.now()}`,
            systolic: newBP.systolic,
            diastolic: newBP.diastolic,
            position: newBP.position,
            arm: newBP.arm,
            ...(newBP.heartRate !== undefined && { heartRate: newBP.heartRate }),
            timestamp: newBP.timestamp ?? Date.now(),
            ...(newBP.note !== undefined && { note: newBP.note }),
          } as BloodPressureRecord,
          ...(old ?? []).slice(0, 4),
        ]
      );

      // Return context with the previous value
      return { previous };
    },
    onError: (_err, _newBP, context) => {
      // Rollback to the previous value on error
      if (context?.previous) {
        queryClient.setQueryData(healthKeys.bpRecords(5), context.previous);
      }
    },
    onSettled: () => {
      // Refetch after error or success to ensure we have the correct data
      queryClient.invalidateQueries({ queryKey: healthKeys.bloodPressure() });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

/**
 * Hook to update a blood pressure record.
 */
export function useUpdateBloodPressure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateBloodPressureParams) =>
      unwrap(await updateBloodPressureRecord(params.id, params.updates)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.bloodPressure() });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

/**
 * Hook to delete a blood pressure record.
 */
export function useDeleteBloodPressure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteBloodPressureRecord(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.bloodPressure() });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

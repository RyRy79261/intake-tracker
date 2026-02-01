"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { type WeightRecord, type BloodPressureRecord } from "@/lib/db";
import { useSettingsStore } from "@/stores/settings-store";
import * as storageAdapter from "@/lib/storage-adapter";
import * as localHealthService from "@/lib/health-service";

type AuthHeaders = { Authorization: string };

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
  timestamp?: number;
  note?: string;
};

export type UpdateBloodPressureParams = {
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
};

// ============================================================================
// Query keys factory (includes storageMode for proper cache separation)
// ============================================================================
export const healthKeys = {
  all: ["health"] as const,
  weight: (storageMode: string) => [...healthKeys.all, "weight", storageMode] as const,
  weightRecords: (limit: number | undefined, storageMode: string) => 
    [...healthKeys.weight(storageMode), "records", limit] as const,
  weightLatest: (storageMode: string) => [...healthKeys.weight(storageMode), "latest"] as const,
  bloodPressure: (storageMode: string) => [...healthKeys.all, "bloodPressure", storageMode] as const,
  bpRecords: (limit: number | undefined, storageMode: string) => 
    [...healthKeys.bloodPressure(storageMode), "records", limit] as const,
  bpLatest: (storageMode: string) => [...healthKeys.bloodPressure(storageMode), "latest"] as const,
};

// ============================================================================
// Weight Records Hooks
// ============================================================================

/**
 * Hook to get recent weight records.
 * Supports both local and server storage modes.
 */
export function useWeightRecords(limit: number = 5) {
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useQuery({
    queryKey: healthKeys.weightRecords(limit, storageMode),
    queryFn: async () => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.getWeightRecords(limit, { Authorization: `Bearer ${token}` });
        }
      }
      return localHealthService.getWeightRecords(limit);
    },
    enabled: storageMode === "local" || authenticated,
  });
}

/**
 * Hook to get the latest weight record.
 */
export function useLatestWeight() {
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useQuery({
    queryKey: healthKeys.weightLatest(storageMode),
    queryFn: async () => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.getLatestWeightRecord({ Authorization: `Bearer ${token}` });
        }
      }
      return localHealthService.getLatestWeightRecord();
    },
    enabled: storageMode === "local" || authenticated,
  });
}

/**
 * Hook to add a weight record with optimistic updates.
 * Routes to local or server based on storage mode.
 */
export function useAddWeight() {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useMutation({
    mutationFn: async (params: AddWeightParams) => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.addWeightRecord(
            params.weight, params.timestamp, params.note,
            { Authorization: `Bearer ${token}` }
          );
        }
      }
      return storageAdapter.addWeightRecord(params.weight, params.timestamp, params.note);
    },
    onMutate: async (newWeight) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: healthKeys.weight(storageMode) });

      // Snapshot the previous value
      const previous = queryClient.getQueryData<WeightRecord[]>(
        healthKeys.weightRecords(5, storageMode)
      );

      // Optimistically update to the new value
      queryClient.setQueryData<WeightRecord[]>(
        healthKeys.weightRecords(5, storageMode),
        (old = []) => [
          {
            id: `temp-${Date.now()}`,
            weight: newWeight.weight,
            timestamp: newWeight.timestamp ?? Date.now(),
            note: newWeight.note,
          },
          ...old.slice(0, 4),
        ]
      );

      // Return context with the previous value
      return { previous };
    },
    onError: (_err, _newWeight, context) => {
      // Rollback to the previous value on error
      if (context?.previous) {
        queryClient.setQueryData(healthKeys.weightRecords(5, storageMode), context.previous);
      }
    },
    onSettled: () => {
      // Refetch after error or success to ensure we have the correct data
      queryClient.invalidateQueries({ queryKey: healthKeys.weight(storageMode) });
    },
  });
}

/**
 * Hook to update a weight record.
 */
export function useUpdateWeight() {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useMutation({
    mutationFn: async (params: UpdateWeightParams) => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.updateWeightRecord(
            params.id, params.updates,
            { Authorization: `Bearer ${token}` }
          );
        }
      }
      return storageAdapter.updateWeightRecord(params.id, params.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.weight(storageMode) });
    },
  });
}

/**
 * Hook to delete a weight record.
 */
export function useDeleteWeight() {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useMutation({
    mutationFn: async (id: string) => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.deleteWeightRecord(id, { Authorization: `Bearer ${token}` });
        }
      }
      return storageAdapter.deleteWeightRecord(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.weight(storageMode) });
    },
  });
}

// ============================================================================
// Blood Pressure Records Hooks
// ============================================================================

/**
 * Hook to get recent blood pressure records.
 * Supports both local and server storage modes.
 */
export function useBloodPressureRecords(limit: number = 5) {
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useQuery({
    queryKey: healthKeys.bpRecords(limit, storageMode),
    queryFn: async () => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.getBloodPressureRecords(limit, { Authorization: `Bearer ${token}` });
        }
      }
      return localHealthService.getBloodPressureRecords(limit);
    },
    enabled: storageMode === "local" || authenticated,
  });
}

/**
 * Hook to get the latest blood pressure record.
 */
export function useLatestBloodPressure() {
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useQuery({
    queryKey: healthKeys.bpLatest(storageMode),
    queryFn: async () => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.getLatestBloodPressureRecord({ Authorization: `Bearer ${token}` });
        }
      }
      return localHealthService.getLatestBloodPressureRecord();
    },
    enabled: storageMode === "local" || authenticated,
  });
}

/**
 * Hook to add a blood pressure record with optimistic updates.
 * Routes to local or server based on storage mode.
 */
export function useAddBloodPressure() {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useMutation({
    mutationFn: async (params: AddBloodPressureParams) => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.addBloodPressureRecord(
            params.systolic,
            params.diastolic,
            params.position,
            params.arm,
            params.heartRate,
            params.timestamp,
            params.note,
            { Authorization: `Bearer ${token}` }
          );
        }
      }
      return storageAdapter.addBloodPressureRecord(
        params.systolic,
        params.diastolic,
        params.position,
        params.arm,
        params.heartRate,
        params.timestamp,
        params.note
      );
    },
    onMutate: async (newBP) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: healthKeys.bloodPressure(storageMode) });

      // Snapshot the previous value
      const previous = queryClient.getQueryData<BloodPressureRecord[]>(
        healthKeys.bpRecords(5, storageMode)
      );

      // Optimistically update to the new value
      queryClient.setQueryData<BloodPressureRecord[]>(
        healthKeys.bpRecords(5, storageMode),
        (old = []) => [
          {
            id: `temp-${Date.now()}`,
            systolic: newBP.systolic,
            diastolic: newBP.diastolic,
            position: newBP.position,
            arm: newBP.arm,
            heartRate: newBP.heartRate,
            timestamp: newBP.timestamp ?? Date.now(),
            note: newBP.note,
          },
          ...old.slice(0, 4),
        ]
      );

      // Return context with the previous value
      return { previous };
    },
    onError: (_err, _newBP, context) => {
      // Rollback to the previous value on error
      if (context?.previous) {
        queryClient.setQueryData(healthKeys.bpRecords(5, storageMode), context.previous);
      }
    },
    onSettled: () => {
      // Refetch after error or success to ensure we have the correct data
      queryClient.invalidateQueries({ queryKey: healthKeys.bloodPressure(storageMode) });
    },
  });
}

/**
 * Hook to update a blood pressure record.
 */
export function useUpdateBloodPressure() {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useMutation({
    mutationFn: async (params: UpdateBloodPressureParams) => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.updateBloodPressureRecord(
            params.id, params.updates,
            { Authorization: `Bearer ${token}` }
          );
        }
      }
      return storageAdapter.updateBloodPressureRecord(params.id, params.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.bloodPressure(storageMode) });
    },
  });
}

/**
 * Hook to delete a blood pressure record.
 */
export function useDeleteBloodPressure() {
  const queryClient = useQueryClient();
  const { authenticated, getAccessToken } = usePrivy();
  const storageMode = useSettingsStore((state) => state.storageMode);

  return useMutation({
    mutationFn: async (id: string) => {
      if (storageMode === "server" && authenticated) {
        const token = await getAccessToken();
        if (token) {
          return storageAdapter.deleteBloodPressureRecord(id, { Authorization: `Bearer ${token}` });
        }
      }
      return storageAdapter.deleteBloodPressureRecord(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthKeys.bloodPressure(storageMode) });
    },
  });
}

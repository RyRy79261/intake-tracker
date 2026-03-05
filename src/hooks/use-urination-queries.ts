"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type UrinationRecord } from "@/lib/db";
import {
  addUrinationRecord,
  getUrinationRecords,
  getUrinationRecordsByDateRange,
  updateUrinationRecord,
  deleteUrinationRecord,
} from "@/lib/urination-service";
import { graphKeys } from "@/hooks/use-graph-data";
import { unwrap } from "@/lib/service-result";

export type AddUrinationParams = {
  timestamp?: number;
  amountEstimate?: string;
  note?: string;
};

export type UpdateUrinationParams = {
  id: string;
  updates: {
    timestamp?: number;
    amountEstimate?: string;
    note?: string;
  };
};

export const urinationKeys = {
  all: ["urination"] as const,
  records: (limit?: number) => [...urinationKeys.all, "records", limit] as const,
  byDateRange: (start: number, end: number) =>
    [...urinationKeys.all, "dateRange", start, end] as const,
};

export function useUrinationRecords(limit: number = 10) {
  return useQuery({
    queryKey: urinationKeys.records(limit),
    queryFn: async () => unwrap(await getUrinationRecords(limit)),
  });
}

export function useUrinationRecordsByDateRange(
  startTime: number,
  endTime: number
) {
  return useQuery({
    queryKey: urinationKeys.byDateRange(startTime, endTime),
    queryFn: async () => unwrap(await getUrinationRecordsByDateRange(startTime, endTime)),
    enabled: startTime < endTime,
  });
}

export function useAddUrination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddUrinationParams) =>
      unwrap(await addUrinationRecord(
        params.timestamp,
        params.amountEstimate,
        params.note
      )),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: urinationKeys.all });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

export function useUpdateUrination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateUrinationParams) =>
      unwrap(await updateUrinationRecord(params.id, params.updates)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: urinationKeys.all });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

export function useDeleteUrination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteUrinationRecord(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: urinationKeys.all });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

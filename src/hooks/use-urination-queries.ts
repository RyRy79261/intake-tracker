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
    queryFn: () => getUrinationRecords(limit),
  });
}

export function useUrinationRecordsByDateRange(
  startTime: number,
  endTime: number
) {
  return useQuery({
    queryKey: urinationKeys.byDateRange(startTime, endTime),
    queryFn: () => getUrinationRecordsByDateRange(startTime, endTime),
    enabled: startTime < endTime,
  });
}

export function useAddUrination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: AddUrinationParams) =>
      addUrinationRecord(
        params.timestamp,
        params.amountEstimate,
        params.note
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: urinationKeys.all });
    },
  });
}

export function useUpdateUrination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UpdateUrinationParams) =>
      updateUrinationRecord(params.id, params.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: urinationKeys.all });
    },
  });
}

export function useDeleteUrination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteUrinationRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: urinationKeys.all });
    },
  });
}

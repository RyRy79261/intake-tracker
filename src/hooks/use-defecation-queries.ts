"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type DefecationRecord } from "@/lib/db";
import {
  addDefecationRecord,
  getDefecationRecords,
  getDefecationRecordsByDateRange,
  updateDefecationRecord,
  deleteDefecationRecord,
} from "@/lib/defecation-service";
import { graphKeys } from "@/hooks/use-graph-data";
import { unwrap } from "@/lib/service-result";

export type AddDefecationParams = {
  timestamp?: number;
  amountEstimate?: string;
  note?: string;
};

export type UpdateDefecationParams = {
  id: string;
  updates: {
    timestamp?: number;
    amountEstimate?: string;
    note?: string;
  };
};

export const defecationKeys = {
  all: ["defecation"] as const,
  records: (limit?: number) => [...defecationKeys.all, "records", limit] as const,
  byDateRange: (start: number, end: number) =>
    [...defecationKeys.all, "dateRange", start, end] as const,
};

export function useDefecationRecords(limit: number = 10) {
  return useQuery({
    queryKey: defecationKeys.records(limit),
    queryFn: async () => unwrap(await getDefecationRecords(limit)),
  });
}

export function useDefecationRecordsByDateRange(
  startTime: number,
  endTime: number
) {
  return useQuery({
    queryKey: defecationKeys.byDateRange(startTime, endTime),
    queryFn: async () => unwrap(await getDefecationRecordsByDateRange(startTime, endTime)),
    enabled: startTime < endTime,
  });
}

export function useAddDefecation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddDefecationParams) =>
      unwrap(await addDefecationRecord(
        params.timestamp,
        params.amountEstimate,
        params.note
      )),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: defecationKeys.all });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

export function useUpdateDefecation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateDefecationParams) =>
      unwrap(await updateDefecationRecord(params.id, params.updates)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: defecationKeys.all });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

export function useDeleteDefecation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteDefecationRecord(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: defecationKeys.all });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

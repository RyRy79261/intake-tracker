"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type EatingRecord } from "@/lib/db";
import {
  addEatingRecord,
  getEatingRecords,
  getEatingRecordsByDateRange,
  updateEatingRecord,
  deleteEatingRecord,
} from "@/lib/eating-service";
import { graphKeys } from "@/hooks/use-graph-data";
import { unwrap } from "@/lib/service-result";

export type AddEatingParams = {
  timestamp?: number;
  note?: string;
  grams?: number;
};

export type UpdateEatingParams = {
  id: string;
  updates: { timestamp?: number; note?: string; grams?: number };
};

export const eatingKeys = {
  all: ["eating"] as const,
  records: (limit?: number) => [...eatingKeys.all, "records", limit] as const,
  byDateRange: (start: number, end: number) =>
    [...eatingKeys.all, "dateRange", start, end] as const,
};

export function useEatingRecords(limit: number = 10) {
  return useQuery({
    queryKey: eatingKeys.records(limit),
    queryFn: async () => unwrap(await getEatingRecords(limit)),
  });
}

export function useEatingRecordsByDateRange(
  startTime: number,
  endTime: number
) {
  return useQuery({
    queryKey: eatingKeys.byDateRange(startTime, endTime),
    queryFn: async () => unwrap(await getEatingRecordsByDateRange(startTime, endTime)),
    enabled: startTime < endTime,
  });
}

export function useAddEating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddEatingParams) =>
      unwrap(await addEatingRecord(params.timestamp, params.note, params.grams)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eatingKeys.all });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

export function useUpdateEating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateEatingParams) =>
      unwrap(await updateEatingRecord(params.id, params.updates)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eatingKeys.all });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

export function useDeleteEating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteEatingRecord(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eatingKeys.all });
      queryClient.invalidateQueries({ queryKey: graphKeys.all });
    },
  });
}

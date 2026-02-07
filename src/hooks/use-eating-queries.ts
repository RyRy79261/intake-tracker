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

export type AddEatingParams = {
  timestamp?: number;
  note?: string;
};

export type UpdateEatingParams = {
  id: string;
  updates: { timestamp?: number; note?: string };
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
    queryFn: () => getEatingRecords(limit),
  });
}

export function useEatingRecordsByDateRange(
  startTime: number,
  endTime: number
) {
  return useQuery({
    queryKey: eatingKeys.byDateRange(startTime, endTime),
    queryFn: () => getEatingRecordsByDateRange(startTime, endTime),
    enabled: startTime < endTime,
  });
}

export function useAddEating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: AddEatingParams) =>
      addEatingRecord(params.timestamp, params.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eatingKeys.all });
    },
  });
}

export function useUpdateEating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UpdateEatingParams) =>
      updateEatingRecord(params.id, params.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eatingKeys.all });
    },
  });
}

export function useDeleteEating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteEatingRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eatingKeys.all });
    },
  });
}

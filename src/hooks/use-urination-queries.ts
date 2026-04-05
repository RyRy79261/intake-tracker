"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMutation } from "@tanstack/react-query";
import {
  addUrinationRecord,
  getUrinationRecords,
  getUrinationRecordsByDateRange,
  updateUrinationRecord,
  deleteUrinationRecord,
} from "@/lib/urination-service";
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

export function useUrinationRecords(limit: number = 10) {
  return useLiveQuery(() => getUrinationRecords(limit), [limit], []);
}

export function useUrinationRecordsByDateRange(
  startTime: number,
  endTime: number
) {
  return useLiveQuery(
    () => startTime < endTime ? getUrinationRecordsByDateRange(startTime, endTime) : Promise.resolve([]),
    [startTime, endTime],
    []
  );
}

export function useAddUrination() {
  return useMutation({
    mutationFn: async (params: AddUrinationParams) =>
      unwrap(await addUrinationRecord(
        params.timestamp,
        params.amountEstimate,
        params.note
      )),
  });
}

export function useUpdateUrination() {
  return useMutation({
    mutationFn: async (params: UpdateUrinationParams) =>
      unwrap(await updateUrinationRecord(params.id, params.updates)),
  });
}

export function useDeleteUrination() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteUrinationRecord(id)),
  });
}

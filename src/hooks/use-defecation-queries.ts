"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMutation } from "@tanstack/react-query";
import {
  addDefecationRecord,
  getDefecationRecords,
  getDefecationRecordsByDateRange,
  updateDefecationRecord,
  deleteDefecationRecord,
} from "@/lib/defecation-service";
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

export function useDefecationRecords(limit: number = 10) {
  return useLiveQuery(() => getDefecationRecords(limit), [limit], []);
}

export function useDefecationRecordsByDateRange(
  startTime: number,
  endTime: number
) {
  return useLiveQuery(
    () => startTime < endTime ? getDefecationRecordsByDateRange(startTime, endTime) : Promise.resolve([]),
    [startTime, endTime],
    []
  );
}

export function useAddDefecation() {
  return useMutation({
    mutationFn: async (params: AddDefecationParams) =>
      unwrap(await addDefecationRecord(
        params.timestamp,
        params.amountEstimate,
        params.note
      )),
  });
}

export function useUpdateDefecation() {
  return useMutation({
    mutationFn: async (params: UpdateDefecationParams) =>
      unwrap(await updateDefecationRecord(params.id, params.updates)),
  });
}

export function useDeleteDefecation() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteDefecationRecord(id)),
  });
}

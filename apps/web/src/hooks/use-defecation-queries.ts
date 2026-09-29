"use client";

import { useLiveQuery } from "@/hooks/use-live-query";
import { useMutation } from "@tanstack/react-query";
import {
  addDefecationRecord,
  getDefecationRecords,
  getDefecationRecordsByDateRange,
  updateDefecationRecord,
  deleteDefecationRecord,
  undoDeleteDefecationRecord,
} from "@/lib/defecation-service";
import { unwrap } from "@intake/core/service";
import type { HealthRecordSource } from "@/lib/db";
import { useUndoDeleteMutation } from "@/hooks/use-undo-delete-mutation";

export type AddDefecationParams = {
  timestamp?: number;
  amountEstimate?: string;
  note?: string;
  /** How it was entered: "manual" (a form) or "voice". */
  source?: HealthRecordSource;
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
        params.note,
        params.source
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
  return useUndoDeleteMutation(deleteDefecationRecord, undoDeleteDefecationRecord);
}

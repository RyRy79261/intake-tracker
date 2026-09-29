"use client";

import { useLiveQuery } from "@/hooks/use-live-query";
import { useMutation } from "@tanstack/react-query";
import {
  addUrinationRecord,
  getUrinationRecords,
  getUrinationRecordsByDateRange,
  updateUrinationRecord,
  deleteUrinationRecord,
  undoDeleteUrinationRecord,
} from "@/lib/urination-service";
import { unwrap } from "@intake/core/service";
import type { HealthRecordSource } from "@/lib/db";
import { useUndoDeleteMutation } from "@/hooks/use-undo-delete-mutation";

export type AddUrinationParams = {
  timestamp?: number;
  amountEstimate?: string;
  note?: string;
  /** How it was entered: "manual" (a form) or "voice". */
  source?: HealthRecordSource;
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
        params.note,
        params.source
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
  return useUndoDeleteMutation(deleteUrinationRecord, undoDeleteUrinationRecord);
}

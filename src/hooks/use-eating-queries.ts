"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMutation } from "@tanstack/react-query";
import {
  addEatingRecord,
  getEatingRecords,
  getEatingRecordsByDateRange,
  updateEatingRecord,
  deleteEatingRecord,
  undoDeleteEatingRecord,
} from "@/lib/eating-service";
import { unwrap } from "@/lib/service-result";
import { showUndoToast } from "@/components/medications/undo-toast";

export type AddEatingParams = {
  timestamp?: number;
  note?: string;
  grams?: number;
};

export type UpdateEatingParams = {
  id: string;
  updates: { timestamp?: number; note?: string; grams?: number };
};

export function useEatingRecords(limit: number = 10) {
  return useLiveQuery(() => getEatingRecords(limit), [limit], []);
}

export function useEatingRecordsByDateRange(
  startTime: number,
  endTime: number
) {
  return useLiveQuery(
    () => startTime < endTime ? getEatingRecordsByDateRange(startTime, endTime) : Promise.resolve([]),
    [startTime, endTime],
    []
  );
}

export function useAddEating() {
  return useMutation({
    mutationFn: async (params: AddEatingParams) =>
      unwrap(await addEatingRecord(params.timestamp, params.note, params.grams)),
  });
}

export function useUpdateEating() {
  return useMutation({
    mutationFn: async (params: UpdateEatingParams) =>
      unwrap(await updateEatingRecord(params.id, params.updates)),
  });
}

/**
 * Hook to delete an eating record.
 * Shows an undo toast with ~5 second window per D-08.
 */
export function useDeleteEating() {
  return useMutation({
    mutationFn: async (id: string) => unwrap(await deleteEatingRecord(id)),
    onSuccess: (_data, id) => {
      showUndoToast({
        title: "Record deleted",
        onUndo: () => { undoDeleteEatingRecord(id); },
      });
    },
  });
}

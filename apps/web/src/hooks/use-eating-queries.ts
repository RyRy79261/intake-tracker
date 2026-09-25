"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useMutation } from "@tanstack/react-query";
import {
  addEatingRecord,
  getEatingRecords,
  getEatingRecordsByDateRange,
} from "@/lib/eating-service";
import {
  deleteEatingEntry,
  undoDeleteEatingEntry,
  updateEatingEntry,
} from "@/lib/composable-entry-service";
import { unwrap } from "@intake/core/service";
import { useUndoDeleteMutation } from "@/hooks/use-undo-delete-mutation";

export type AddEatingParams = {
  timestamp?: number;
  note?: string;
  grams?: number;
};

export type UpdateEatingParams = {
  id: string;
  /** `note`: key present with `undefined` clears it; key absent leaves it. */
  updates: { timestamp?: number; note?: string | undefined; grams?: number };
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

/**
 * Hook to edit a meal's time / note / grams. A time change moves the meal's
 * linked sodium, water, sugar and potassium rows with it.
 */
export function useUpdateEating() {
  return useMutation({
    mutationFn: async (params: UpdateEatingParams) =>
      unwrap(await updateEatingEntry(params.id, params.updates)),
  });
}

/**
 * Hook to delete a meal — its eating record and every linked row in its group.
 * Shows an undo toast with ~5 second window per D-08; Undo restores exactly
 * the rows this delete removed.
 */
export function useDeleteEating() {
  return useUndoDeleteMutation(
    deleteEatingEntry,
    (id, deleted) => undoDeleteEatingEntry(id, deleted.deletedAt),
  );
}

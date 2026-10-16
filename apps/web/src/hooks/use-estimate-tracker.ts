"use client";

import { useMutation } from "@tanstack/react-query";
import { useLiveQuery } from "@/hooks/use-live-query";
import { useUndoDeleteMutation } from "@/hooks/use-undo-delete-mutation";
import { unwrap } from "@intake/core/service";
import {
  addEstimateRecord,
  deleteEstimateRecord,
  getEstimateRecords,
  getEstimateRecordsBetween,
  undoDeleteEstimateRecord,
  updateEstimateRecord,
  type AddEstimateInput,
  type EstimateUpdates,
} from "@/lib/estimate-tracker-service";
import type { EstimateTrackerId } from "@/lib/estimate-trackers";

export type { AddEstimateInput, EstimateUpdates };

/**
 * The estimate-tracker hooks for components: one set for urination and
 * defecation, picked by the tracker id.
 */

/** Live entries, newest first (default 10). */
export function useEstimateRecords(tracker: EstimateTrackerId, limit: number = 10) {
  return useLiveQuery(() => getEstimateRecords(tracker, limit), [tracker, limit], []);
}

/** Live entries in [startTime, endTime); empty when the range is empty. */
export function useEstimateRecordsBetween(tracker: EstimateTrackerId, startTime: number, endTime: number) {
  return useLiveQuery(
    () => (startTime < endTime ? getEstimateRecordsBetween(tracker, startTime, endTime) : Promise.resolve([])),
    [tracker, startTime, endTime],
    [],
  );
}

export function useAddEstimateRecord(tracker: EstimateTrackerId) {
  return useMutation({
    mutationFn: async (input: AddEstimateInput) => unwrap(await addEstimateRecord(tracker, input)),
  });
}

export function useUpdateEstimateRecord(tracker: EstimateTrackerId) {
  return useMutation({
    mutationFn: async (params: { id: string; updates: EstimateUpdates }) =>
      unwrap(await updateEstimateRecord(tracker, params.id, params.updates)),
  });
}

/** Deletes, then offers Undo in a toast. */
export function useDeleteEstimateRecord(tracker: EstimateTrackerId) {
  return useUndoDeleteMutation(
    (id: string) => deleteEstimateRecord(tracker, id),
    (id: string) => undoDeleteEstimateRecord(tracker, id),
  );
}

/**
 * Soft-delete an entry just made by a quick-log tap (its Undo action), with
 * no second "Record deleted / Undo" toast.
 */
export function removeQuickLoggedEstimate(tracker: EstimateTrackerId, id: string) {
  return deleteEstimateRecord(tracker, id);
}

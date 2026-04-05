"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback } from "react";
import {
  addComposableEntry,
  deleteEntryGroup,
  undoDeleteEntryGroup,
  getEntryGroup,
  deleteSingleGroupRecord,
  undoDeleteSingleRecord,
  type ComposableEntryInput,
  type ComposableEntryResult,
  type EntryGroup,
  type RecordTable,
} from "@/lib/composable-entry-service";

export type { ComposableEntryInput, ComposableEntryResult, EntryGroup, RecordTable };
import { unwrap } from "@/lib/service-result";
import { showUndoToast } from "@/components/medications/undo-toast";

/**
 * Reactive hook for reading all records in a composable entry group.
 * Uses a single useLiveQuery that queries all 3 tables via getEntryGroup,
 * so Dexie's observation system tracks all tables and re-fires as a unit.
 *
 * Returns undefined while loading, null for undefined groupId, or the EntryGroup.
 */
export function useEntryGroup(groupId: string | undefined) {
  return useLiveQuery(
    () => getEntryGroup(groupId),
    [groupId],
    undefined,
  );
}

/**
 * Mutation hook for creating a composable entry.
 * Wraps addComposableEntry with unwrap for throwing on error.
 */
export function useAddComposableEntry() {
  return useCallback(
    async (input: ComposableEntryInput, timestamp?: number): Promise<ComposableEntryResult> => {
      return unwrap(await addComposableEntry(input, timestamp));
    },
    [],
  );
}

/**
 * Mutation hook for deleting an entire composable entry group.
 * Shows an undo toast with 5-second window (per D-06, D-08).
 */
export function useDeleteEntryGroup() {
  return useCallback(
    async (groupId: string) => {
      const result = unwrap(await deleteEntryGroup(groupId));
      showUndoToast({
        title: `Deleted ${result.deletedCount} linked record${result.deletedCount !== 1 ? "s" : ""}`,
        onUndo: async () => {
          await undoDeleteEntryGroup(groupId);
        },
      });
      return result;
    },
    [],
  );
}

/**
 * Mutation hook for deleting a single record within a composable group.
 * Shows an undo toast with 5-second window (per D-05, D-06, D-08).
 * Other group members remain intact.
 */
export function useDeleteSingleGroupRecord() {
  return useCallback(
    async (table: RecordTable, id: string) => {
      const result = unwrap(await deleteSingleGroupRecord(table, id));
      showUndoToast({
        title: "Record deleted",
        onUndo: async () => {
          await undoDeleteSingleRecord(table, id);
        },
      });
      return result;
    },
    [],
  );
}

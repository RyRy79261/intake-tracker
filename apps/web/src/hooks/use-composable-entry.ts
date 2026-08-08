"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo } from "react";
import {
  addComposableEntry,
  deleteEntryGroup,
  undoDeleteEntryGroup,
  getEntryGroup,
  deleteSingleGroupRecord,
  undoDeleteSingleRecord,
  syncEatingGroup,
  syncLiquidEntrySubstances,
  classifyLiquidDelete,
  parseSodiumKindFromSource,
  type ComposableEntryInput,
  type ComposableEntryResult,
  type EntryGroup,
  type RecordTable,
  type SodiumKind,
} from "@/lib/composable-entry-service";
import { unwrap } from "@intake/core/service";
import { showUndoToast } from "@/components/medications/undo-toast";

export type { ComposableEntryInput, ComposableEntryResult, EntryGroup, RecordTable, SodiumKind };

/**
 * Re-exports for component-side use (services may not be imported directly
 * from components per the no-restricted-imports rule).
 */
export const fetchEntryGroup = getEntryGroup;
export const sodiumKindFromSource = parseSodiumKindFromSource;

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
 * Mutation hook for syncing an eating record's linked sodium / water-content
 * intake records (used by the inline edit form on the Food card).
 */
export function useSyncEatingGroup() {
  return useCallback(
    async (
      eatingId: string,
      patch: Parameters<typeof syncEatingGroup>[1],
    ): Promise<void> => {
      unwrap(await syncEatingGroup(eatingId, patch));
    },
    [],
  );
}

/**
 * Mutation hook for syncing a liquid entry's caffeine / alcohol / sugar
 * records (used by the inline edit form on the Liquids card). Creates,
 * updates, or soft-deletes the linked records to match the patch.
 */
export function useSyncLiquidEntrySubstances() {
  return useCallback(
    async (
      intakeId: string,
      patch: Parameters<typeof syncLiquidEntrySubstances>[1],
    ): Promise<void> => {
      unwrap(await syncLiquidEntrySubstances(intakeId, patch));
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
 * Mutation hook for deleting a liquid intake record with the right blast
 * radius: a drink's fluid row takes its substances with it, while a meal's
 * water-content row is removed on its own and the meal survives.
 *
 * Shaped as a `{ mutateAsync }` object so it drops straight into
 * `useDeleteWithToast` in place of the plain single-record delete.
 */
export function useDeleteLiquidEntry(
  deleteIntakeRecord: (id: string) => Promise<unknown>,
) {
  const deleteGroup = useDeleteEntryGroup();
  const mutateAsync = useCallback(
    async (id: string) => {
      const scope = await classifyLiquidDelete(id);
      if (scope.scope === "group") return deleteGroup(scope.groupId);
      return deleteIntakeRecord(id);
    },
    [deleteGroup, deleteIntakeRecord],
  );
  // Memoised so consumers that take this as a dependency (useDeleteWithToast)
  // don't get a new callback identity on every render.
  return useMemo(() => ({ mutateAsync }), [mutateAsync]);
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

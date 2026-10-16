"use client";

import { useCallback } from "react";
import {
  addComposableEntry,
  getEntryGroup,
  syncEatingGroup,
  parseSodiumKindFromSource,
  pickEatingGroupNutrients,
  type ComposableEntryInput,
  type ComposableEntryResult,
  type EntryGroup,
  type RecordTable,
  type SodiumKind,
} from "@/lib/composable-entry-service";
import {
  deleteSubstanceRecord,
  undoDeleteSubstanceRecord,
  previewSubstanceDelete,
} from "@/lib/substance-service";
import { unwrap } from "@intake/core/service";
import { withDbRecovery } from "@/lib/db-recovery";
import { showUndoToast } from "@/components/medications/undo-toast";
import { runUndo } from "@/hooks/use-undo-delete-mutation";

export type { ComposableEntryInput, ComposableEntryResult, EntryGroup, RecordTable, SodiumKind };

/**
 * Re-exports for component-side use (services may not be imported directly
 * from components per the no-restricted-imports rule).
 */
export const fetchEntryGroup = getEntryGroup;
export const sodiumKindFromSource = parseSodiumKindFromSource;
export const eatingGroupNutrients = pickEatingGroupNutrients;

/**
 * Mutation hook for creating a composable entry.
 * Wraps addComposableEntry with unwrap for throwing on error.
 */
export function useAddComposableEntry() {
  return useCallback(
    async (input: ComposableEntryInput, timestamp?: number): Promise<ComposableEntryResult> => {
      return withDbRecovery(async () =>
        unwrap(await addComposableEntry(input, timestamp)),
      );
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

const CASCADE_UNITS: Record<string, string> = {
  water: "ml water",
  salt: "mg sodium",
  sugar: "g sugar",
  potassium: "mg potassium",
};

/**
 * Describe what else a caffeine/alcohol delete will remove — a drink's
 * substance takes the whole drink with it — or `null` when it removes only
 * itself. Used to confirm the delete before it happens.
 */
export async function describeSubstanceDeleteCascade(id: string): Promise<string | null> {
  const { intakes, substances } = await previewSubstanceDelete(id);
  const parts = [
    ...intakes.map((r) => `${r.amount} ${CASCADE_UNITS[r.type] ?? r.type}`),
    ...substances.map((s) =>
      s.type === "caffeine" && s.amountMg !== undefined
        ? `${s.amountMg} mg caffeine`
        : `the ${s.type} record`,
    ),
  ];
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Mutation hook for deleting a caffeine/alcohol record. For a drink this also
 * removes the drink's water, solutes and sibling substances, so it shows an
 * undo toast that restores exactly the rows this delete removed.
 */
export function useDeleteSubstanceWithUndo() {
  return useCallback(async (id: string) => {
    const result = unwrap(await deleteSubstanceRecord(id));
    showUndoToast({
      title: "Record deleted",
      onUndo: () => runUndo(() => undoDeleteSubstanceRecord(id, result.deletedAt)),
    });
    return result;
  }, []);
}

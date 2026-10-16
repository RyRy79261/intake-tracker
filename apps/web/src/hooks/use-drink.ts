"use client";

import { useMemo } from "react";
import {
  logDrink,
  editDrink,
  deleteDrink,
  getDrink,
  findDrinkWaterId,
  drinkAmounts,
  drinkFromRecipe,
  formatStandardDrinks,
  amountForVolume,
  standardDrinks,
  type LogDrinkInput,
  type LogDrinkResult,
  type EditDrinkInput,
  type DeleteDrinkResult,
  type DrinkSnapshot,
  type DrinkKind,
  type DrinkRecipe,
  type DrinkAmounts,
} from "@/lib/drink-service";
import { undoDeleteEntryGroup } from "@/lib/composable-entry-service";
import { undoDeleteIntakeRecord } from "@/lib/intake-service";
import { unwrap } from "@intake/core/service";
import { withDbRecovery } from "@/lib/db-recovery";
import { showUndoToast } from "@/components/medications/undo-toast";
import { runUndo } from "@/hooks/use-undo-delete-mutation";

export type {
  LogDrinkInput,
  LogDrinkResult,
  EditDrinkInput,
  DeleteDrinkResult,
  DrinkSnapshot,
  DrinkKind,
  DrinkRecipe,
  DrinkAmounts,
};

/**
 * Re-exports for component-side use (services may not be imported directly
 * from components per the no-restricted-imports rule). The maths is pure.
 */
export const fetchDrink = getDrink;
export const findDrinkForRow = findDrinkWaterId;
export { drinkAmounts, drinkFromRecipe, formatStandardDrinks, amountForVolume, standardDrinks };

/**
 * The Drink module for components: the only way to log, edit or delete a
 * drink. `log` derives the water row from the volume, so callers never queue
 * their own water intake beside it. `remove` shows the undo toast.
 */
export function useDrink() {
  return useMemo(
    () => ({
      log: (input: LogDrinkInput): Promise<LogDrinkResult> =>
        withDbRecovery(async () => unwrap(await logDrink(input))),

      edit: (waterIntakeId: string, input: EditDrinkInput): Promise<void> =>
        withDbRecovery(async () => unwrap(await editDrink(waterIntakeId, input))),

      remove: async (intakeId: string): Promise<DeleteDrinkResult> => {
        const result = await withDbRecovery(async () =>
          unwrap(await deleteDrink(intakeId)),
        );
        if (result.scope === "group") {
          const { groupId, deletedAt, deletedCount } = result;
          showUndoToast({
            title: `Deleted ${deletedCount} linked record${deletedCount !== 1 ? "s" : ""}`,
            // Restore only what this delete removed (its tombstone stamp).
            onUndo: () => runUndo(() => undoDeleteEntryGroup(groupId, deletedAt)),
          });
        } else {
          showUndoToast({
            title: "Record deleted",
            onUndo: () => runUndo(() => undoDeleteIntakeRecord(intakeId)),
          });
        }
        return result;
      },
    }),
    [],
  );
}

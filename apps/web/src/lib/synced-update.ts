/**
 * Synced-row writes for the medication tables.
 *
 * The push route applies an upsert only when the pushed `updatedAt` is
 * strictly newer than the server's copy (a tie means "server wins"), so an
 * update that forgets to bump `updatedAt` is enqueued, pushed, acked — and
 * silently dropped. Routing every update through `updateSyncedInsideTx`
 * makes the stamp impossible to forget.
 *
 * Soft deletes go through `softDeleteInsideTx`, which also retires the
 * row's lifecycle flag (`isActive`, `status`, `enabled`). Many readers key
 * off those flags rather than `deletedAt`; a tombstone that still says
 * "active" keeps dosing. This mirrors the Dexie v23 tombstone repair.
 *
 * Both helpers assume they run inside a Dexie `rw` transaction that covers
 * the target table and `db._syncQueue`.
 */

import type { UpdateSpec } from "dexie";
import {
  db,
  type Prescription,
  type MedicationPhase,
  type PhaseSchedule,
  type InventoryItem,
  type InventoryTransaction,
  type DoseLog,
  type TitrationPlan,
} from "@/lib/db";
import { enqueueInsideTx, type SyncOp } from "@/lib/sync-queue";

interface MedicationRowMap {
  prescriptions: Prescription;
  medicationPhases: MedicationPhase;
  phaseSchedules: PhaseSchedule;
  inventoryItems: InventoryItem;
  inventoryTransactions: InventoryTransaction;
  doseLogs: DoseLog;
  titrationPlans: TitrationPlan;
}

export type MedicationTableName = keyof MedicationRowMap;

type Changes<K extends MedicationTableName> = Partial<
  Omit<MedicationRowMap[K], "id" | "updatedAt">
>;

/** Update a synced row, stamp `updatedAt`, and enqueue it. */
export async function updateSyncedInsideTx<K extends MedicationTableName>(
  tableName: K,
  id: string,
  changes: Changes<K>,
  opts?: { op?: SyncOp; now?: number },
): Promise<void> {
  const now = opts?.now ?? Date.now();
  await db
    .table<MedicationRowMap[K], string>(tableName)
    .update(id, { ...changes, updatedAt: now } as UpdateSpec<MedicationRowMap[K]>);
  await enqueueInsideTx(tableName, id, opts?.op ?? "upsert");
}

/**
 * The lifecycle-flag changes that retire a tombstoned row. Terminal states
 * (`completed`, `cancelled`) are history and stay as they are.
 */
function retireFields<K extends MedicationTableName>(
  tableName: K,
  row: MedicationRowMap[K],
): Changes<K> {
  let fields: Record<string, unknown> = {};
  switch (tableName) {
    case "prescriptions":
    case "inventoryItems":
      fields = { isActive: false };
      break;
    case "phaseSchedules":
      fields = { enabled: false };
      break;
    case "medicationPhases": {
      const { status } = row as MedicationPhase;
      if (status === "active" || status === "pending") fields = { status: "cancelled" };
      break;
    }
    case "titrationPlans": {
      const { status } = row as TitrationPlan;
      if (status === "active" || status === "draft") fields = { status: "cancelled" };
      break;
    }
  }
  return fields as Changes<K>;
}

/** Soft-delete a synced row: tombstone, retire its lifecycle flag, enqueue a delete. */
export async function softDeleteInsideTx<K extends MedicationTableName>(
  tableName: K,
  row: MedicationRowMap[K],
  now: number = Date.now(),
): Promise<void> {
  await updateSyncedInsideTx(
    tableName,
    row.id,
    { ...retireFields(tableName, row), deletedAt: now } as Changes<K>,
    { op: "delete", now },
  );
}

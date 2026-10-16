/**
 * Synced-row writes for the medication tables, inside a caller's transaction.
 *
 * Thin forms of the synced-write module (lib/synced-write.ts) for services
 * that still open their own Dexie transaction: `updateSyncedInsideTx` is
 * `w.patch` and `softDeleteInsideTx` is `w.tombstone`. Both join the caller's
 * `rw` transaction, which must cover the target table and `db._syncQueue`.
 */

import type {
  DoseLog,
  InventoryItem,
  InventoryTransaction,
  MedicationPhase,
  PhaseSchedule,
  Prescription,
  TitrationPlan,
} from "@/lib/db";
import { syncedWrite, type SyncedChanges } from "@/lib/synced-write";

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

/**
 * Update a synced row, stamp `updatedAt` (with `opts.now` if given), and
 * enqueue it. A row that becomes a tombstone is queued as a delete and has
 * its lifecycle flag retired.
 */
export async function updateSyncedInsideTx<K extends MedicationTableName>(
  tableName: K,
  id: string,
  changes: SyncedChanges<K>,
  opts?: { now?: number },
): Promise<void> {
  await syncedWrite([tableName], (w) => w.patch(tableName, id, changes), opts);
}

/** Soft-delete a synced row: tombstone, retire its lifecycle flag, enqueue a delete. */
export async function softDeleteInsideTx<K extends MedicationTableName>(
  tableName: K,
  row: MedicationRowMap[K],
  now: number = Date.now(),
): Promise<void> {
  await syncedWrite([tableName], (w) => w.tombstone(tableName, row.id), { now });
}

/**
 * Time-framed deletion of the user's logged records.
 *
 * Backs the "Delete data" controls in the Storage settings section: the user
 * can wipe records logged within a time window (e.g. "older than 90 days") or
 * everything. Records are soft-deleted (tombstoned) and enqueued for sync, so
 * the deletion propagates to the cloud copy when cloud-sync is on, exactly like
 * deleting a single record. Local data on the device is updated in place.
 *
 * Scope (audit dates-timezones#9):
 * - A bounded range only touches time-series tables, and judges each row by
 *   when the event happened (`timestamp`, or a dose's `scheduledDate`), not by
 *   when the row was written. Configuration (prescriptions, phases, schedules,
 *   inventory and its transactions, titration plans), notes, audit logs and AI
 *   reports are never deleted by age.
 * - `ALL_TIME` wipes every synced table except `userProfile` and
 *   `userSettings`, which hold account configuration (conditions, AI
 *   consent; limits, presets, day start, home timezone). Tombstoned configuration
 *   is also switched off (inactive / cancelled), matching the Dexie v23
 *   tombstone repair.
 * - `deleteAllMedicationData` (Settings > Data > "Delete all medication
 *   data") wipes only the medication tables, whatever their age. It only
 *   ever runs when the user presses the button and confirms.
 */
import { addDays, isValid, parse } from "date-fns";
import { db } from "@/lib/db";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";
import { syncedWrite } from "@/lib/synced-write";
import { isLive } from "@intake/core/lifecycle";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";

const ACCOUNT_CONFIG_TABLES: ReadonlySet<TableName> = new Set<TableName>([
  "userProfile",
  "userSettings",
]);
const ALL_TIME_TABLES = TABLE_PUSH_ORDER.filter((t) => !ACCOUNT_CONFIG_TABLES.has(t));

/** Time-series tables whose rows carry an event `timestamp` (Unix ms). */
const TIMESTAMPED_TABLES: readonly TableName[] = [
  "intakeRecords",
  "substanceRecords",
  "weightRecords",
  "bloodPressureRecords",
  "eatingRecords",
  "urinationRecords",
  "defecationRecords",
];

export interface DeleteRange {
  /** Inclusive lower bound on the event time (Unix ms), or null for no lower bound. */
  from: number | null;
  /** Inclusive upper bound on the event time (Unix ms), or null for no upper bound. */
  to: number | null;
}

/**
 * Every table that holds medication data, in push order (parents before
 * children). Notes, audit logs and health records are not included.
 */
const MEDICATION_TABLES: readonly TableName[] = TABLE_PUSH_ORDER.filter((t) =>
  (
    [
      "prescriptions",
      "titrationPlans",
      "medicationPhases",
      "phaseSchedules",
      "inventoryItems",
      "doseLogs",
      "inventoryTransactions",
    ] as readonly TableName[]
  ).includes(t),
);

/** Build a range for "records older than `days` days ago". */
export function olderThanDays(days: number): DeleteRange {
  return { from: null, to: Date.now() - days * 24 * 60 * 60 * 1000 };
}

/** A range that matches every record. */
export const ALL_TIME: DeleteRange = { from: null, to: null };

function isAllTime({ from, to }: DeleteRange): boolean {
  return from === null && to === null;
}

function inRange(eventTime: number, { from, to }: DeleteRange): boolean {
  if (from !== null && eventTime < from) return false;
  if (to !== null && eventTime > to) return false;
  return true;
}

/**
 * A dose's `scheduledDate` is a local calendar day. It is in range only when
 * the whole day is, so a bound never splits one day's doses.
 */
function dayInRange(scheduledDate: string, range: DeleteRange): boolean {
  const dayStart = parse(scheduledDate, "yyyy-MM-dd", new Date());
  if (!isValid(dayStart)) return false;
  const dayEnd = addDays(dayStart, 1).getTime() - 1;
  return inRange(dayStart.getTime(), range) && inRange(dayEnd, range);
}

type Row = Record<string, unknown> & { id: string; deletedAt?: number | null };

/**
 * Tombstone and enqueue every live row of one table that `matches`. The
 * synced write switches tombstoned configuration off (inactive / cancelled).
 */
async function tombstoneWhere(
  tableName: TableName,
  matches: (row: Row) => boolean,
): Promise<number> {
  return syncedWrite([tableName], async (w) => {
    let count = 0;
    const rows = await db.table<Row, string>(tableName).toArray();
    for (const row of rows) {
      if (!isLive(row) || !matches(row)) continue;
      if (await w.tombstone(tableName, row.id)) count += 1;
    }
    return count;
  });
}

/**
 * Soft-delete every live record in `range` (see the module comment for which
 * tables a range reaches), enqueuing each for sync. Returns the number of
 * records deleted.
 */
export async function deleteRecordsInRange(
  range: DeleteRange,
): Promise<ServiceResult<number>> {
  try {
    let total = 0;
    if (isAllTime(range)) {
      for (const tableName of ALL_TIME_TABLES) {
        total += await tombstoneWhere(tableName, () => true);
      }
    } else {
      for (const tableName of TIMESTAMPED_TABLES) {
        total += await tombstoneWhere(
          tableName,
          (row) => typeof row.timestamp === "number" && inRange(row.timestamp, range),
        );
      }
      total += await tombstoneWhere(
        "doseLogs",
        (row) => typeof row.scheduledDate === "string" && dayInRange(row.scheduledDate, range),
      );
    }
    return ok(total);
  } catch (e) {
    return err("Failed to delete records", e);
  }
}

/**
 * Soft-delete every live prescription, phase, schedule, inventory item and
 * transaction, dose log and titration plan. Each row is tombstoned, switched
 * off (inactive / disabled / cancelled) and enqueued as a sync delete, so the
 * cloud copy and other devices follow. Returns the number of rows deleted.
 *
 * User-triggered only (behind a typed confirmation); nothing calls it
 * automatically.
 */
export async function deleteAllMedicationData(): Promise<ServiceResult<number>> {
  try {
    // One outer transaction: either every medication table is wiped or none.
    const total = await syncedWrite(MEDICATION_TABLES, async () => {
      let count = 0;
      for (const tableName of MEDICATION_TABLES) {
        count += await tombstoneWhere(tableName, () => true);
      }
      return count;
    });
    return ok(total);
  } catch (e) {
    return err("Failed to delete medication data", e);
  }
}

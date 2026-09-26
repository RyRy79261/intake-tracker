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
 */
import { addDays, isValid, parse } from "date-fns";
import { db } from "@/lib/db";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
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

/** Extra changes that switch a configuration row off as it is tombstoned. */
function deactivate(tableName: TableName, row: Row): Record<string, unknown> {
  switch (tableName) {
    case "prescriptions":
    case "inventoryItems":
      return { isActive: false };
    case "phaseSchedules":
      return { enabled: false };
    case "medicationPhases":
      return row.status === "active" || row.status === "pending"
        ? { status: "cancelled" }
        : {};
    case "titrationPlans":
      return row.status === "active" || row.status === "draft" || row.status === "pending"
        ? { status: "cancelled" }
        : {};
    default:
      return {};
  }
}

type Row = Record<string, unknown> & { id: string; deletedAt?: number | null };

/** Tombstone and enqueue every live row of one table that `matches`. */
async function tombstoneWhere(
  tableName: TableName,
  matches: (row: Row) => boolean,
): Promise<number> {
  const table = db.table<Row, string>(tableName);
  let count = 0;
  await db.transaction("rw", table, db._syncQueue, async () => {
    const now = Date.now();
    const rows = await table.toArray();
    for (const row of rows) {
      if (!isLive(row) || !matches(row)) continue;
      await table.update(row.id, {
        ...deactivate(tableName, row),
        deletedAt: now,
        updatedAt: now,
      });
      await enqueueInsideTx(tableName, row.id, "delete");
      count += 1;
    }
  });
  return count;
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
    if (total > 0) schedulePush();
    return ok(total);
  } catch (e) {
    return err("Failed to delete records", e);
  }
}

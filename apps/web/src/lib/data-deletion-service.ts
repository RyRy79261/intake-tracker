/**
 * Time-framed deletion of the user's logged records.
 *
 * Backs the "Delete data" controls in the Storage settings section: the user
 * can wipe records created within a time window (e.g. "older than 90 days" or
 * everything). Records are soft-deleted (tombstoned) and enqueued for sync, so
 * the deletion propagates to the cloud copy when cloud-sync is on, exactly like
 * deleting a single record. Local data on the device is updated in place.
 *
 * Scope: every synced record table EXCEPT `userProfile`, which holds account
 * configuration (conditions, AI consent) rather than time-series records and
 * therefore isn't a meaningful target for a "by time frame" wipe.
 */
import { db } from "@/lib/db";
import { TABLE_PUSH_ORDER } from "@/lib/sync-topology";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { ok, err, type ServiceResult } from "@/lib/service-result";

const PROFILE_TABLE = "userProfile";
const DELETABLE_TABLES = TABLE_PUSH_ORDER.filter((t) => t !== PROFILE_TABLE);

export interface DeleteRange {
  /** Inclusive lower bound on `createdAt` (Unix ms), or null for no lower bound. */
  from: number | null;
  /** Inclusive upper bound on `createdAt` (Unix ms), or null for no upper bound. */
  to: number | null;
}

/** Build a range for "records older than `days` days ago". */
export function olderThanDays(days: number): DeleteRange {
  return { from: null, to: Date.now() - days * 24 * 60 * 60 * 1000 };
}

/** A range that matches every record. */
export const ALL_TIME: DeleteRange = { from: null, to: null };

function inRange(createdAt: number, { from, to }: DeleteRange): boolean {
  if (from !== null && createdAt < from) return false;
  if (to !== null && createdAt > to) return false;
  return true;
}

/**
 * Soft-delete every non-deleted record whose `createdAt` falls in `range`,
 * across all deletable tables, enqueuing each for sync. Returns the number of
 * records deleted.
 */
export async function deleteRecordsInRange(
  range: DeleteRange,
): Promise<ServiceResult<number>> {
  try {
    let total = 0;
    for (const tableName of DELETABLE_TABLES) {
      const table = db.table<{
        id: string;
        createdAt: number;
        updatedAt: number;
        deletedAt: number | null;
      }>(tableName);
      await db.transaction("rw", table, db._syncQueue, async () => {
        const now = Date.now();
        const rows = await table.toArray();
        for (const row of rows) {
          if (row.deletedAt !== null) continue;
          if (!inRange(row.createdAt, range)) continue;
          await table.update(row.id, { deletedAt: now, updatedAt: now });
          await enqueueInsideTx(tableName, row.id, "delete");
          total += 1;
        }
      });
    }
    return ok(total);
  } catch (e) {
    return err("Failed to delete records", e);
  }
}

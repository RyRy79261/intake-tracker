import type { EntityTable, Table, UpdateSpec } from "dexie";
import { ok, err, type ServiceResult } from "@/lib/service-result";
import { writeWithSync } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import type { TableName } from "@/lib/sync-topology";

/**
 * Shared soft-delete CRUD helpers for the simple per-domain record tables
 * (urination, defecation, eating, …). Each of those services kept its own
 * byte-identical copies of these read/delete/update bodies; this collapses the
 * `writeWithSync` + `schedulePush` ceremony and the `deletedAt === null` read
 * filtering into one place. The per-domain `add` stays in each service because
 * its field shaping differs.
 *
 * Call sites pass an `EntityTable<T, "id">` (what `db.*` exposes) with an
 * explicit `<RecordType>` so T binds concretely; internally we treat it as a
 * `Table<T, string>` so `.get`/`.update` accept the string primary key (Dexie's
 * EntityTable/Table generics don't line up for inference here).
 */

/** Fields every soft-deletable, syncable record table shares. */
export interface SoftDeleteRow {
  id: string;
  timestamp: number;
  updatedAt: number;
  deletedAt: number | null;
}

type RecordTable<T extends SoftDeleteRow> = EntityTable<T, "id">;

const asTable = <T extends SoftDeleteRow>(t: RecordTable<T>): Table<T, string> =>
  t as unknown as Table<T, string>;

/** Active (non-soft-deleted) records, newest first, optionally capped. */
export async function getActiveRecords<T extends SoftDeleteRow>(
  table: RecordTable<T>,
  limit?: number,
): Promise<T[]> {
  const records = await asTable(table).orderBy("timestamp").reverse().toArray();
  const active = records.filter((r) => r.deletedAt === null);
  return limit !== undefined ? active.slice(0, limit) : active;
}

/** Active records whose timestamp falls within [startTime, endTime]. */
export async function getRecordsBetween<T extends SoftDeleteRow>(
  table: RecordTable<T>,
  startTime: number,
  endTime: number,
): Promise<T[]> {
  const records = await asTable(table).where("timestamp").between(startTime, endTime).toArray();
  return records.filter((r) => r.deletedAt === null);
}

/** Soft-delete a record (sets deletedAt) and enqueue a sync delete. */
export async function softDeleteRecord<T extends SoftDeleteRow>(
  table: RecordTable<T>,
  tableName: TableName,
  id: string,
  errorMessage: string,
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await writeWithSync(tableName, "delete", async () => {
      await asTable(table).update(id, { deletedAt: now, updatedAt: now } as unknown as UpdateSpec<T>);
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err(errorMessage, e);
  }
}

/** Reverse a soft-delete (clears deletedAt) and enqueue a sync upsert. */
export async function undoSoftDeleteRecord<T extends SoftDeleteRow>(
  table: RecordTable<T>,
  tableName: TableName,
  id: string,
  errorMessage: string,
): Promise<ServiceResult<void>> {
  try {
    const now = Date.now();
    await writeWithSync(tableName, "upsert", async () => {
      await asTable(table).update(id, { deletedAt: null, updatedAt: now } as unknown as UpdateSpec<T>);
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err(errorMessage, e);
  }
}

/**
 * Apply a partial update (bumping updatedAt) and enqueue a sync upsert.
 * Returns `err("Record not found")` for a missing id rather than silently
 * succeeding — matching the intake/defecation services.
 */
export async function updateRecord<T extends SoftDeleteRow>(
  table: RecordTable<T>,
  tableName: TableName,
  id: string,
  // NoInfer so T binds from `table` alone — otherwise a narrow `updates` object
  // widens T and collides with Dexie's invariant Table<T> typing.
  updates: Partial<NoInfer<T>>,
  errorMessage: string,
): Promise<ServiceResult<void>> {
  try {
    const t = asTable(table);
    const existing = await t.get(id);
    if (!existing) return err("Record not found");
    await writeWithSync(tableName, "upsert", async () => {
      await t.update(id, { ...updates, updatedAt: Date.now() } as UpdateSpec<T>);
      return { id };
    });
    schedulePush();
    return ok(undefined);
  } catch (e) {
    return err(errorMessage, e);
  }
}

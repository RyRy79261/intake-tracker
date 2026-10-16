/**
 * Synced writes: the one way to change a synced table.
 *
 * A service says what changes (insert this row, patch that one, tombstone a
 * group); this module makes each change reach the server:
 *
 * - every change and its sync-queue entry commit in one Dexie transaction;
 * - `patch`, `tombstone` and `restore` stamp `updatedAt` with the write's
 *   `now` (the push route drops an upsert that is not strictly newer than the
 *   server's copy, so a forgotten stamp loses the edit);
 * - the queue op is read off the row as written: a tombstone queues a
 *   "delete", a live row an "upsert". Callers never pick it;
 * - a tombstone retires its row's lifecycle flag (`isActive`, `enabled`,
 *   `status`), however it was written. Many readers trust the flag and not
 *   `deletedAt`, and a tombstone that still says "active" keeps dosing;
 * - audit entries are synced rows like any other;
 * - a debounced push is scheduled once the transaction commits.
 *
 * ```ts
 * await syncedWrite(["prescriptions"], async (w) => {
 *   await w.patch("prescriptions", id, { notes });
 *   await w.audit("prescription_updated", { prescriptionId: id });
 * });
 * ```
 *
 * Called inside a transaction that is already open (a service composing
 * another service's helper), `syncedWrite` joins it: the tables must then be
 * in that transaction's scope, and nothing commits until it does.
 */

import Dexie, { type Table, type UpdateSpec } from "dexie";
import {
  db,
  type AuditAction,
  type AuditLog,
  type BloodPressureRecord,
  type DailyNote,
  type DefecationRecord,
  type DoseLog,
  type EatingRecord,
  type InsightReport,
  type IntakeRecord,
  type InventoryItem,
  type InventoryTransaction,
  type MedicationPhase,
  type PhaseSchedule,
  type Prescription,
  type SubstanceRecord,
  type TitrationPlan,
  type UrinationRecord,
  type UserProfile,
  type UserSettings,
  type WeightRecord,
} from "@/lib/db";
import { enqueueInsideTx, type SyncOp } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";
import type { TableName } from "@/lib/sync-topology";
import { syncFields } from "@/lib/utils";

/** The record type stored in each synced table. */
export interface SyncedRowMap {
  intakeRecords: IntakeRecord;
  weightRecords: WeightRecord;
  bloodPressureRecords: BloodPressureRecord;
  eatingRecords: EatingRecord;
  urinationRecords: UrinationRecord;
  defecationRecords: DefecationRecord;
  substanceRecords: SubstanceRecord;
  prescriptions: Prescription;
  medicationPhases: MedicationPhase;
  phaseSchedules: PhaseSchedule;
  inventoryItems: InventoryItem;
  inventoryTransactions: InventoryTransaction;
  doseLogs: DoseLog;
  dailyNotes: DailyNote;
  titrationPlans: TitrationPlan;
  auditLogs: AuditLog;
  userProfile: UserProfile;
  insightReports: InsightReport;
  userSettings: UserSettings;
}

/** A synced table name. Every one of them has a row type above. */
export type SyncedTable = TableName & keyof SyncedRowMap;
type MissingRowType = Exclude<TableName, keyof SyncedRowMap>;
// Fails to compile if a table is added to sync-topology without a row type.
const _everyTableHasARowType: MissingRowType extends never ? true : never = true;
void _everyTableHasARowType;

export type SyncedRow<K extends SyncedTable> = SyncedRowMap[K];

/**
 * Field changes for `patch`. `id` is the key and `updatedAt` is stamped by the
 * writer, so neither can be set. A key with the value `undefined` clears that
 * field (Dexie removes it), which is how an optional field is cleared.
 */
export type SyncedChanges<K extends SyncedTable> = {
  [F in Exclude<keyof SyncedRow<K>, "id" | "updatedAt">]?: SyncedRow<K>[F] | undefined;
};

type AnyRow = { id: string; deletedAt?: number | null } & Record<string, unknown>;

/** The queue op a row stands for: a tombstone is a delete. */
export function syncOpFor(row: { deletedAt?: number | null }): SyncOp {
  return row.deletedAt != null ? "delete" : "upsert";
}

/**
 * The lifecycle-flag changes that retire a tombstoned row, or `{}` when it is
 * already retired or its table has no flag. A finished phase or plan
 * (`completed`, `cancelled`) is history and keeps its status.
 */
export function retireChanges(
  tableName: SyncedTable,
  row: Record<string, unknown>,
): Record<string, unknown> {
  switch (tableName) {
    case "prescriptions":
    case "inventoryItems":
      return row.isActive === false ? {} : { isActive: false };
    case "phaseSchedules":
      return row.enabled === false ? {} : { enabled: false };
    case "medicationPhases":
      return row.status === "active" || row.status === "pending"
        ? { status: "cancelled" }
        : {};
    case "titrationPlans":
      // TitrationPlan has no "pending" status today; a row written by an
      // older or newer client with that value is retired anyway.
      return row.status === "active" || row.status === "draft" || row.status === "pending"
        ? { status: "cancelled" }
        : {};
    default:
      return {};
  }
}

/** `row` with its lifecycle flag retired when it is a tombstone. */
function retired<T extends AnyRow>(tableName: SyncedTable, row: T): T {
  if (row.deletedAt == null) return row;
  const changes = retireChanges(tableName, row);
  return Object.keys(changes).length === 0 ? row : { ...row, ...changes };
}

/**
 * Build an audit-log row. `details` is stored as JSON; a string is stored as
 * it is.
 */
export function buildAuditEntry(
  action: AuditAction,
  details?: Record<string, unknown> | string,
): AuditLog {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    action,
    ...(details !== undefined && {
      details: typeof details === "string" ? details : JSON.stringify(details),
    }),
    ...syncFields(),
  };
}

/** What a `syncedWrite` body uses to change rows. */
export interface SyncedWriter {
  /** One timestamp for the whole write: every stamp it makes uses it. */
  readonly now: number;

  /** Add a new row as given. Throws if the id already exists. */
  insert<K extends SyncedTable>(table: K, row: SyncedRow<K>): Promise<SyncedRow<K>>;

  /**
   * Write a whole row as given, replacing any row with its id. Its
   * `updatedAt` is kept, not stamped. `{ queue: false }` stores it locally
   * without queueing it (a restored backup tombstone for a record this device
   * never had must not delete the server's copy).
   */
  put<K extends SyncedTable>(
    table: K,
    row: SyncedRow<K>,
    opts?: { queue?: boolean },
  ): Promise<SyncedRow<K>>;

  /**
   * Change some fields of a row and stamp `updatedAt`. Setting `deletedAt`
   * tombstones the row (prefer `tombstone`). Returns the row as written, or
   * `undefined` (writing and queueing nothing) when no row has that id.
   */
  patch<K extends SyncedTable>(
    table: K,
    id: string,
    changes: SyncedChanges<K>,
  ): Promise<SyncedRow<K> | undefined>;

  /**
   * Soft-delete a live row: `deletedAt = now`, lifecycle flag retired.
   * `extra` changes are written with it. Returns `true` if the row was live
   * and is now tombstoned; `false` if it was missing or already a tombstone
   * (nothing is written then).
   */
  tombstone<K extends SyncedTable>(
    table: K,
    id: string,
    extra?: SyncedChanges<K>,
  ): Promise<boolean>;

  /**
   * Bring a tombstone back (`deletedAt = null`), with any `extra` changes.
   * A lifecycle flag the tombstone retired stays retired unless `extra`
   * sets it. Returns `true` if the row was a tombstone and is now live.
   */
  restore<K extends SyncedTable>(
    table: K,
    id: string,
    extra?: SyncedChanges<K>,
  ): Promise<boolean>;

  /** Write a synced audit-log entry. `auditLogs` is always in scope. */
  audit(action: AuditAction, details?: Record<string, unknown> | string): Promise<AuditLog>;

  /**
   * Queue a row that is already stored, as it stands, without writing it
   * (for example to re-send records the server rejected). A missing row
   * queues nothing.
   */
  requeue(table: SyncedTable, id: string): Promise<boolean>;
}

/**
 * The table as `db.<name>` exposes it. Dexie's `db.table(name)` returns a
 * different Table object for the same store; going through the property keeps
 * this module on the one object every other reader and writer uses.
 */
function tableOf<K extends SyncedTable>(name: K): Table<SyncedRow<K>, string> {
  return (db as unknown as Record<K, Table<SyncedRow<K>, string>>)[name];
}

function createWriter(now: number, onQueued: () => void): SyncedWriter {
  const queue = async (tableName: SyncedTable, row: AnyRow) => {
    await enqueueInsideTx(tableName, row.id, syncOpFor(row));
    onQueued();
  };

  const patch = async <K extends SyncedTable>(
    tableName: K,
    id: string,
    changes: SyncedChanges<K>,
  ): Promise<SyncedRow<K> | undefined> => {
    const table = tableOf(tableName);
    const existing = (await table.get(id)) as AnyRow | undefined;
    if (!existing) return undefined;
    const merged: AnyRow = { ...existing, ...(changes as Record<string, unknown>), updatedAt: now };
    const retire = merged.deletedAt != null ? retireChanges(tableName, merged) : {};
    const spec = { ...(changes as Record<string, unknown>), ...retire, updatedAt: now };
    await table.update(id, spec as unknown as UpdateSpec<SyncedRow<K>>);
    const written: AnyRow = { ...merged, ...retire };
    for (const [key, value] of Object.entries(spec)) {
      if (value === undefined) delete written[key];
    }
    await queue(tableName, written);
    return written as unknown as SyncedRow<K>;
  };

  return {
    now,

    async insert(tableName, row) {
      const written = retired(tableName, row as unknown as AnyRow);
      await tableOf(tableName).add(written as never);
      await queue(tableName, written);
      return written as never;
    },

    async put(tableName, row, opts) {
      const written = retired(tableName, row as unknown as AnyRow);
      await tableOf(tableName).put(written as never);
      if (opts?.queue !== false) await queue(tableName, written);
      return written as never;
    },

    patch,

    async tombstone(tableName, id, extra) {
      const existing = (await tableOf(tableName).get(id)) as AnyRow | undefined;
      if (!existing || existing.deletedAt != null) return false;
      await patch(tableName, id, { ...extra, deletedAt: now } as SyncedChanges<typeof tableName>);
      return true;
    },

    async restore(tableName, id, extra) {
      const existing = (await tableOf(tableName).get(id)) as AnyRow | undefined;
      if (!existing || existing.deletedAt == null) return false;
      await patch(tableName, id, { ...extra, deletedAt: null } as SyncedChanges<typeof tableName>);
      return true;
    },

    async audit(action, details) {
      const entry = { ...buildAuditEntry(action, details), timestamp: now };
      await tableOf("auditLogs").add(entry);
      await queue("auditLogs", entry as unknown as AnyRow);
      return entry;
    },

    async requeue(tableName, id) {
      const existing = (await tableOf(tableName).get(id)) as AnyRow | undefined;
      if (!existing) return false;
      await queue(tableName, existing);
      return true;
    },
  };
}

/**
 * Run `body` as one synced write over `tables` (plus `auditLogs` and the sync
 * queue, which every write may use). Everything it changes commits together
 * or not at all; a push is scheduled after it commits if anything was queued.
 *
 * `opts.now` pins the write's timestamp, for a caller that stamps several
 * writes, or a field of its own, with one value.
 */
export async function syncedWrite<R>(
  tables: readonly SyncedTable[],
  body: (w: SyncedWriter) => Promise<R>,
  opts?: { now?: number | undefined },
): Promise<R> {
  let queued = false;
  // An `async` function, not just one returning a promise: Dexie only keeps
  // the transaction alive across native `await`s inside an AsyncFunction.
  const run = async () =>
    body(
      createWriter(opts?.now ?? Date.now(), () => {
        queued = true;
      }),
    );

  const ambient = Dexie.currentTransaction;
  const result =
    ambient && ambient.db === db && ambient.mode === "readwrite"
      ? await run()
      : await db.transaction(
          "rw",
          [...new Set<string>([...tables, "auditLogs", "_syncQueue"])],
          run,
        );

  if (queued) schedulePush();
  return result;
}

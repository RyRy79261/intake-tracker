/**
 * Numeric column shapes of the Neon Postgres tables, mirrored client-side so
 * the push loop can never mint an op the server schema must reject.
 *
 * Why this exists (issue #354, "Can't sync"):
 *   Dexie stores every number as a JS double. Postgres does not. Columns
 *   declared `integer` or `bigint` reject a fractional value, and the push
 *   route validates each op against a drizzle-zod schema derived from those
 *   columns — so `grams: 330.5` on an EatingRecord fails with
 *   "Record failed validation and cannot be synced". The engine treats a
 *   `code: "invalid"` rejection as permanent (correctly — the schema will not
 *   change) and drops the op, so the record silently never reaches the
 *   server. Worse, its *tombstone* is dropped the same way: deleting the
 *   record enqueues another op carrying the same poisoned field, the delete
 *   never propagates, the next pull resurrects the row, and the sync status
 *   sticks on an error the user has no way to clear.
 *
 *   A fractional value could enter Dexie from several writers (AI parse
 *   results, the voice panel's `parseFloat` inputs, a unit conversion), so
 *   guarding each writer individually is a losing game — one new caller
 *   re-opens the hole. `normalizeRowForPush` closes it at the single choke
 *   point every write must pass through, and repairs rows already sitting in
 *   IndexedDB with a bad value.
 *
 * The field lists come from the generated sync manifest
 *   (`@intake/db/sync-manifest`, built from the Drizzle schema by
 *   `pnpm db:generate`). The push loop runs in the browser and must not import
 *   drizzle, so the facts are generated as plain data rather than read from
 *   the schema at run time.
 */

import { SYNC_TABLES } from "@intake/db/sync-manifest";
import { TABLE_PUSH_ORDER, type TableName } from "@/lib/sync-topology";

function fieldsByTable(
  pick: (facts: (typeof SYNC_TABLES)[TableName]) => readonly string[],
): Record<TableName, readonly string[]> {
  return Object.fromEntries(
    TABLE_PUSH_ORDER.map((t) => [t, pick(SYNC_TABLES[t])]),
  ) as Record<TableName, readonly string[]>;
}

/**
 * Fields backed by a Postgres `integer` or `bigint` column — a fractional
 * value is rejected by the push validator. `userId` and `serverUpdatedAt` are
 * left out: the client never sends them.
 */
export const INTEGER_SYNC_FIELDS = fieldsByTable((t) => t.integerFields);

/**
 * Fields backed by a Postgres `real` column. Fractions are fine here; only
 * NaN/Infinity need scrubbing, since the push validator rejects those too.
 */
export const FLOAT_SYNC_FIELDS = fieldsByTable((t) => t.floatFields);

/**
 * Coerce a Dexie row into the numeric shape its Postgres table accepts.
 *
 * - A fractional value in an integer/bigint column is rounded. Postgres has
 *   no representation for it, so the choice is a rounded value or a record
 *   that never syncs — and `drink-service.logDrink` already rounds `volumeMl`
 *   at its own write site on exactly this reasoning.
 * - NaN/Infinity in any numeric column becomes `null`. Nothing meaningful can
 *   be stored, and leaving it in place would fail validation. A non-finite
 *   value in a NOT NULL column (`timestamp`, `createdAt`, `updatedAt`) still
 *   fails — the record is unrecoverable and must not be pushed as a silent
 *   zero.
 *
 * Non-numeric values are returned untouched: this normalizes types, it does
 * not validate. Returns a new object; the caller's row is never mutated.
 */
export function normalizeRowForPush<T extends Record<string, unknown>>(
  tableName: TableName,
  row: T,
): T {
  const normalized: Record<string, unknown> = { ...row };

  for (const field of INTEGER_SYNC_FIELDS[tableName]) {
    const value = normalized[field];
    if (typeof value !== "number") continue;
    if (!Number.isFinite(value)) {
      normalized[field] = null;
    } else if (!Number.isInteger(value)) {
      normalized[field] = Math.round(value);
    }
  }

  for (const field of FLOAT_SYNC_FIELDS[tableName]) {
    const value = normalized[field];
    if (typeof value === "number" && !Number.isFinite(value)) {
      normalized[field] = null;
    }
  }

  return normalized as T;
}

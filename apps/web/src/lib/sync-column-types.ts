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
 * Why the field lists are hand-maintained rather than derived:
 *   `@intake/db/schema` pulls drizzle-orm + drizzle-zod into whatever imports
 *   it. The push loop runs in the browser, so importing the schema here would
 *   drag both into the client bundle of a mobile-first PWA. `sync-topology.ts`
 *   mirrors the FK graph for exactly this reason and pays for it with a
 *   parity test; this module follows that convention.
 *   `src/__tests__/sync-column-types.test.ts` derives the real column types
 *   from the Drizzle schema and fails if either map drifts.
 */

import type { TableName } from "@/lib/sync-topology";

/**
 * Fields backed by a Postgres `integer` or `bigint` column — a fractional
 * value is rejected by the push validator.
 *
 * `userId` is omitted throughout: the client never sends it (the push route
 * stamps it from the session), so it cannot carry a bad value.
 */
export const INTEGER_SYNC_FIELDS: Record<TableName, readonly string[]> = {
  prescriptions: ["createdAt", "updatedAt", "deletedAt"],
  titrationPlans: ["recommendedStartDate", "createdAt", "updatedAt", "deletedAt"],
  medicationPhases: ["startDate", "endDate", "createdAt", "updatedAt", "deletedAt"],
  phaseSchedules: ["scheduleTimeUTC", "createdAt", "updatedAt", "deletedAt"],
  inventoryItems: [
    "refillAlertDays",
    "refillAlertPills",
    "createdAt",
    "updatedAt",
    "deletedAt",
  ],
  doseLogs: ["actionTimestamp", "createdAt", "updatedAt", "deletedAt"],
  inventoryTransactions: ["timestamp", "createdAt", "updatedAt", "deletedAt"],
  dailyNotes: ["createdAt", "updatedAt", "deletedAt"],
  intakeRecords: ["amount", "timestamp", "createdAt", "updatedAt", "deletedAt"],
  substanceRecords: [
    "amountMg",
    "volumeMl",
    "timestamp",
    "createdAt",
    "updatedAt",
    "deletedAt",
  ],
  weightRecords: ["timestamp", "createdAt", "updatedAt", "deletedAt"],
  bloodPressureRecords: [
    "systolic",
    "diastolic",
    "heartRate",
    "timestamp",
    "createdAt",
    "updatedAt",
    "deletedAt",
  ],
  eatingRecords: ["grams", "timestamp", "createdAt", "updatedAt", "deletedAt"],
  urinationRecords: ["timestamp", "createdAt", "updatedAt", "deletedAt"],
  defecationRecords: ["timestamp", "createdAt", "updatedAt", "deletedAt"],
  auditLogs: ["timestamp", "createdAt", "updatedAt", "deletedAt"],
  userProfile: ["aiInsightsConsentAt", "createdAt", "updatedAt", "deletedAt"],
  insightReports: [
    "generatedAt",
    "rangeStart",
    "rangeEnd",
    "createdAt",
    "updatedAt",
    "deletedAt",
  ],
};

/**
 * Fields backed by a Postgres `real` column. Fractions are fine here; only
 * NaN/Infinity need scrubbing, since the push validator rejects those too.
 */
export const FLOAT_SYNC_FIELDS: Record<TableName, readonly string[]> = {
  prescriptions: [],
  titrationPlans: [],
  medicationPhases: [],
  phaseSchedules: ["dosage"],
  inventoryItems: ["currentStock", "strength"],
  doseLogs: ["doseMg"],
  inventoryTransactions: ["amount"],
  dailyNotes: [],
  intakeRecords: [],
  substanceRecords: ["amountStandardDrinks", "abvPercent"],
  weightRecords: ["weight"],
  bloodPressureRecords: [],
  eatingRecords: [],
  urinationRecords: [],
  defecationRecords: [],
  auditLogs: [],
  userProfile: [],
  insightReports: [],
};

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

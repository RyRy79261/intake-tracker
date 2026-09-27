/**
 * Null/undefined translation between Dexie rows and the Neon Postgres tables.
 *
 * Dexie and the `@intake/types` interfaces model an unset optional field as a
 * *missing key* (`note?: string`). Postgres models it as `NULL`. The sync
 * loop has to translate in both directions, or each side misreads the other.
 *
 * Push (audit health-records-inputs#4):
 *   Clearing a field locally (`update(id, { note: undefined })`) deletes the
 *   key. The push serialised the row with the key missing, the route's
 *   `onConflictDoUpdate` only sets the columns it is given, so the server kept
 *   the old value — and the next pull put it back on the device.
 *   `fillClearedFieldsForPush` sends an explicit `null` for every nullable
 *   column the row does not carry, so a cleared field clears on the server.
 *
 * Pull (audit core-duplication#3):
 *   The pull route returns raw drizzle rows: every unset nullable column
 *   arrives as `null`, plus the server's `userId`. Code across the app tests
 *   optional fields with `=== undefined` / `!== undefined`, which a `null`
 *   slips through. `normalizePulledRow` drops those keys so a pulled row has
 *   the same shape as one written locally.
 *
 * `NULLABLE_SYNC_FIELDS` is hand-maintained for the same reason as
 * `sync-column-types.ts`: importing `@intake/db/schema` would drag drizzle into
 * the client bundle. `src/__tests__/sync-nullable-fields.test.ts` derives the
 * real nullable columns from the Drizzle schema and fails if this drifts.
 */

import type { TableName } from "@/lib/sync-topology";

/**
 * Nullable (no `NOT NULL`) columns per synced table, excluding the
 * server-only `userId` / `serverUpdatedAt`.
 */
export const NULLABLE_SYNC_FIELDS: Record<TableName, readonly string[]> = {
  prescriptions: [
    "indication",
    "notes",
    "contraindications",
    "warnings",
    "compounds",
    "deletedAt",
  ],
  titrationPlans: ["recommendedStartDate", "notes", "warnings", "deletedAt"],
  medicationPhases: [
    "endDate",
    "foodNote",
    "notes",
    "titrationPlanId",
    "deletedAt",
  ],
  phaseSchedules: ["unit", "deletedAt"],
  inventoryItems: [
    "currentStock",
    "compounds",
    "visualIdentification",
    "refillAlertDays",
    "refillAlertPills",
    "isArchived",
    "deletedAt",
  ],
  doseLogs: [
    "phaseId",
    "scheduleId",
    "inventoryItemId",
    "doseMg",
    "doseAmount",
    "doseUnit",
    "pillsConsumed",
    "pillStrength",
    "actionTimestamp",
    "rescheduledTo",
    "skipReason",
    "note",
    "deletedAt",
  ],
  inventoryTransactions: ["note", "doseLogId", "deletedAt"],
  dailyNotes: ["prescriptionId", "doseLogId", "deletedAt"],
  intakeRecords: [
    "source",
    "note",
    "groupId",
    "originalInputText",
    "groupSource",
    "sodiumSource",
    "sourceAmount",
    "sourceUnit",
    "deletedAt",
  ],
  substanceRecords: [
    "amountMg",
    "amountStandardDrinks",
    "abvPercent",
    "volumeMl",
    "sourceRecordId",
    "aiEnriched",
    "groupId",
    "originalInputText",
    "groupSource",
    "deletedAt",
  ],
  weightRecords: ["note", "source", "deletedAt"],
  bloodPressureRecords: ["heartRate", "irregularHeartbeat", "note", "source", "deletedAt"],
  eatingRecords: ["grams", "note", "groupId", "originalInputText", "groupSource", "deletedAt"],
  urinationRecords: ["amountEstimate", "note", "source", "deletedAt"],
  defecationRecords: ["amountEstimate", "note", "source", "deletedAt"],
  auditLogs: ["details", "deletedAt"],
  userProfile: ["aiInsightsConsentAt", "deletedAt"],
  insightReports: ["sources", "mode", "deletedAt"],
  userSettings: ["homeTimezone", "homeTimezoneConfirmedAt", "fieldUpdatedAt", "deletedAt"],
};

/**
 * Fields the record interfaces type as `T | null` (not `T?`). A pulled `null`
 * is already the local shape for these, so it is kept.
 */
const NULL_TYPED_FIELDS = new Set([
  "deletedAt",
  "aiInsightsConsentAt",
  "homeTimezone",
  "homeTimezoneConfirmedAt",
]);

/** Keys the server adds that never belong in a Dexie row. */
const SERVER_ONLY_KEYS = ["userId", "serverUpdatedAt"];

/**
 * Give every nullable column the row leaves unset an explicit `null`, so the
 * server's upsert clears it instead of keeping its old value. Returns a new
 * object; the caller's row is never mutated.
 */
export function fillClearedFieldsForPush<T extends Record<string, unknown>>(
  tableName: TableName,
  row: T,
): T {
  const filled: Record<string, unknown> = { ...row };
  for (const field of NULLABLE_SYNC_FIELDS[tableName]) {
    if (filled[field] === undefined) filled[field] = null;
  }
  return filled as T;
}

/**
 * Shape a pulled server row like a locally written one: drop server-only keys
 * and turn `null` optional fields back into missing keys. Returns a new
 * object.
 */
export function normalizePulledRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (SERVER_ONLY_KEYS.includes(key)) continue;
    if (value === null && !NULL_TYPED_FIELDS.has(key)) continue;
    normalized[key] = value;
  }
  return normalized;
}

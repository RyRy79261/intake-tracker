/**
 * Server-only helpers for deleting a user's data from Neon Postgres.
 *
 * Two entry points back the two product flows:
 *   - `wipeCloudData`     — Feature: "switch back to local-only". Removes the
 *     synced data mirror (and push subscriptions) but keeps the account,
 *     login identity, and AI keys so the user can keep using server features.
 *   - `deleteAllUserData` — Feature: "delete my account". Removes every
 *     user-scoped row across every table. The Neon Auth login identity itself
 *     is deleted client-side via the auth SDK (`/delete-user`); this module
 *     only owns the application database.
 *
 * Never trust a client-supplied user id — callers pass `auth.userId!` from the
 * `withAuth` middleware, which derives it from the verified session.
 *
 * IMPORTANT: import only from server code (API routes). It pulls in the
 * Drizzle/Neon client.
 */
import "server-only";
import { eq, or, type SQL } from "drizzle-orm";
import { type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import { db } from "@intake/db/client";
import { schemaByTableName, type TableName } from "@intake/db/sync-payload";
import {
  pushSubscriptions,
  pushSchedules,
  pushSentLog,
  pushSettings,
  userApiKeys,
  userKeyShares,
  aiUsage,
  insightJobs,
  mcpAccessTokens,
  mcpAuthCodes,
  mcpAuditLog,
} from "@intake/db/schema";

/**
 * FK-safe delete order for the 18 synced tables (children before parents).
 *
 * The inner FKs between synced tables do NOT cascade, so every referencing
 * table must be emptied before the table it points at (audit sync-engine#6):
 *   - inventory_transactions → inventory_items, dose_logs
 *   - daily_notes            → prescriptions, dose_logs
 *   - dose_logs              → prescriptions, medication_phases,
 *                              phase_schedules, inventory_items
 *   - inventory_items        → prescriptions
 *   - phase_schedules        → medication_phases
 *   - medication_phases      → prescriptions, titration_plans
 *   - substance_records      → intake_records
 * `userProfile`, `insightReports` and `userSettings` are leaves (insight_jobs' reference to
 * insight_reports is ON DELETE SET NULL).
 */
export const SYNCED_DELETION_ORDER: TableName[] = [
  "inventoryTransactions",
  "dailyNotes",
  "doseLogs",
  "inventoryItems",
  "phaseSchedules",
  "medicationPhases",
  "titrationPlans",
  "prescriptions",
  "substanceRecords",
  "auditLogs",
  "defecationRecords",
  "urinationRecords",
  "eatingRecords",
  "bloodPressureRecords",
  "weightRecords",
  "intakeRecords",
  "userProfile",
  "insightReports",
  "userSettings",
];

/**
 * The tables `/api/sync/cleanup` removes when a migration is cancelled: the
 * record tables a migration uploads. The profile, insight reports and synced
 * settings are left alone, as before.
 */
const MIGRATION_CLEANUP_KEEP: ReadonlySet<TableName> = new Set<TableName>([
  "userProfile",
  "insightReports",
  "userSettings",
]);
export const MIGRATION_CLEANUP_ORDER: TableName[] = SYNCED_DELETION_ORDER.filter(
  (name) => !MIGRATION_CLEANUP_KEEP.has(name),
);

type DeleteStep = { name: string; table: PgTable; where: SQL | undefined };

/**
 * Run a list of deletes as one all-or-nothing unit, in order.
 *
 * Production's Neon HTTP driver has no interactive transactions, but its
 * `batch` runs every statement in a single transaction. The node-postgres
 * driver (integration tests) has no `batch`, so fall back to `transaction`.
 * Either way, a failure part-way through deletes nothing.
 */
async function deleteAtomically(
  steps: DeleteStep[],
): Promise<Record<string, number>> {
  const counts = new Array<number>(steps.length).fill(0);
  const client = db as unknown as {
    batch?: (queries: unknown[]) => Promise<Array<{ rowCount?: number | null }>>;
  };
  if (typeof client.batch === "function") {
    const results = await client.batch(
      steps.map((s) => db.delete(s.table).where(s.where)),
    );
    results.forEach((r, i) => (counts[i] = r?.rowCount ?? 0));
  } else {
    await db.transaction(async (tx) => {
      for (let i = 0; i < steps.length; i++) {
        const result = await tx.delete(steps[i]!.table).where(steps[i]!.where);
        counts[i] = result.rowCount ?? 0;
      }
    });
  }
  return Object.fromEntries(steps.map((s, i) => [s.name, counts[i]!]));
}

/** Deletes for the given synced "data mirror" tables, in the given order. */
function syncedDataSteps(
  userId: string,
  order: TableName[] = SYNCED_DELETION_ORDER,
): DeleteStep[] {
  return order.map((name) => {
    const table = schemaByTableName[name] as PgTable & { userId: PgColumn };
    return { name, table, where: eq(table.userId, userId) };
  });
}

/** Deletes for the user's Web Push subscription, schedules, sent log, settings. */
function pushDataSteps(userId: string): DeleteStep[] {
  return [
    { name: "pushSentLog", table: pushSentLog, where: eq(pushSentLog.userId, userId) },
    { name: "pushSchedules", table: pushSchedules, where: eq(pushSchedules.userId, userId) },
    {
      name: "pushSubscriptions",
      table: pushSubscriptions,
      where: eq(pushSubscriptions.userId, userId),
    },
    { name: "pushSettings", table: pushSettings, where: eq(pushSettings.userId, userId) },
  ];
}

/** Deletes for account-level data: AI keys, key shares, AI usage, jobs, MCP rows. */
function accountLevelSteps(userId: string): DeleteStep[] {
  return [
    { name: "userApiKeys", table: userApiKeys, where: eq(userApiKeys.userId, userId) },
    {
      name: "userKeyShares",
      table: userKeyShares,
      where: or(
        eq(userKeyShares.grantorId, userId),
        eq(userKeyShares.granteeId, userId),
      ),
    },
    { name: "aiUsage", table: aiUsage, where: eq(aiUsage.userId, userId) },
    { name: "insightJobs", table: insightJobs, where: eq(insightJobs.userId, userId) },
    {
      name: "mcpAccessTokens",
      table: mcpAccessTokens,
      where: eq(mcpAccessTokens.userId, userId),
    },
    { name: "mcpAuthCodes", table: mcpAuthCodes, where: eq(mcpAuthCodes.userId, userId) },
    { name: "mcpAuditLog", table: mcpAuditLog, where: eq(mcpAuditLog.userId, userId) },
  ];
}

/**
 * Feature: "cancel migration". Removes the record tables a migration uploaded
 * (see {@link MIGRATION_CLEANUP_ORDER}) in one transaction.
 */
export async function deleteMigratedData(
  userId: string,
): Promise<Record<string, number>> {
  return deleteAtomically(syncedDataSteps(userId, MIGRATION_CLEANUP_ORDER));
}

/**
 * Feature: "switch back to local-only". Removes the cloud data mirror and push
 * subscriptions; keeps the account, identity, and AI keys.
 */
export async function wipeCloudData(
  userId: string,
): Promise<Record<string, number>> {
  return deleteAtomically([
    ...syncedDataSteps(userId),
    ...pushDataSteps(userId),
  ]);
}

/**
 * Feature: "delete my account". Removes every user-scoped row. The Neon Auth
 * identity is deleted separately, client-side, via the auth SDK.
 */
export async function deleteAllUserData(
  userId: string,
): Promise<Record<string, number>> {
  return deleteAtomically([
    ...syncedDataSteps(userId),
    ...pushDataSteps(userId),
    ...accountLevelSteps(userId),
  ]);
}

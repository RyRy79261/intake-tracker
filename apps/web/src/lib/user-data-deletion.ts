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
 * Mirrors `/api/sync/cleanup`'s order, with the two leaf tables it omits
 * (`userProfile`, `insightReports`) appended — nothing references them.
 */
const SYNCED_DELETION_ORDER: TableName[] = [
  "doseLogs",
  "inventoryTransactions",
  "inventoryItems",
  "phaseSchedules",
  "medicationPhases",
  "titrationPlans",
  "prescriptions",
  "substanceRecords",
  "auditLogs",
  "dailyNotes",
  "defecationRecords",
  "urinationRecords",
  "eatingRecords",
  "bloodPressureRecords",
  "weightRecords",
  "intakeRecords",
  "userProfile",
  "insightReports",
];

// Drizzle's table refs are heavily generic; the cleanup route uses the same
// `as any` shape to delete by `userId` across many tables.
async function del(table: any, where: SQL | undefined): Promise<number> {
  const result = await db.delete(table).where(where);
  return result.rowCount ?? 0;
}

/** Delete the 18 synced "data mirror" tables for a user. */
async function deleteSyncedData(userId: string): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  for (const name of SYNCED_DELETION_ORDER) {
    const table = schemaByTableName[name] as any;
    deleted[name] = await del(table, eq(table.userId, userId));
  }
  return deleted;
}

/** Delete the user's Web Push subscription, schedules, sent log, and settings. */
async function deletePushData(userId: string): Promise<Record<string, number>> {
  return {
    pushSentLog: await del(pushSentLog, eq(pushSentLog.userId, userId)),
    pushSchedules: await del(pushSchedules, eq(pushSchedules.userId, userId)),
    pushSubscriptions: await del(
      pushSubscriptions,
      eq(pushSubscriptions.userId, userId),
    ),
    pushSettings: await del(pushSettings, eq(pushSettings.userId, userId)),
  };
}

/** Delete account-level data: AI keys, key shares, AI usage, jobs, MCP rows. */
async function deleteAccountLevelData(
  userId: string,
): Promise<Record<string, number>> {
  return {
    userApiKeys: await del(userApiKeys, eq(userApiKeys.userId, userId)),
    userKeyShares: await del(
      userKeyShares,
      or(
        eq(userKeyShares.grantorId, userId),
        eq(userKeyShares.granteeId, userId),
      ),
    ),
    aiUsage: await del(aiUsage, eq(aiUsage.userId, userId)),
    insightJobs: await del(insightJobs, eq(insightJobs.userId, userId)),
    mcpAccessTokens: await del(
      mcpAccessTokens,
      eq(mcpAccessTokens.userId, userId),
    ),
    mcpAuthCodes: await del(mcpAuthCodes, eq(mcpAuthCodes.userId, userId)),
    mcpAuditLog: await del(mcpAuditLog, eq(mcpAuditLog.userId, userId)),
  };
}

/**
 * Feature: "switch back to local-only". Removes the cloud data mirror and push
 * subscriptions; keeps the account, identity, and AI keys.
 */
export async function wipeCloudData(
  userId: string,
): Promise<Record<string, number>> {
  return {
    ...(await deleteSyncedData(userId)),
    ...(await deletePushData(userId)),
  };
}

/**
 * Feature: "delete my account". Removes every user-scoped row. The Neon Auth
 * identity is deleted separately, client-side, via the auth SDK.
 */
export async function deleteAllUserData(
  userId: string,
): Promise<Record<string, number>> {
  return {
    ...(await deleteSyncedData(userId)),
    ...(await deletePushData(userId)),
    ...(await deleteAccountLevelData(userId)),
  };
}

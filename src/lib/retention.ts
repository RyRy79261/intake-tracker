/**
 * Data retention policy management.
 * 
 * Automatically purges old intake records based on user-configured
 * retention period. This helps with:
 * - Storage management on mobile devices
 * - Privacy compliance (data minimization)
 * - GDPR right to erasure support
 */

import { db, type IntakeRecord } from "./db";
import { logAudit } from "./audit";

export interface RetentionStats {
  totalRecords: number;
  oldestRecord: Date | null;
  newestRecord: Date | null;
  recordsToDelete: number;
}

/**
 * Get statistics about stored data
 */
export async function getRetentionStats(
  retentionDays: number
): Promise<RetentionStats> {
  const allRecords = await db.intakeRecords.toArray();
  const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  
  const timestamps = allRecords.map(r => r.timestamp);
  const oldestTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const newestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;
  
  const recordsToDelete = allRecords.filter(r => r.timestamp < cutoffTime).length;
  
  return {
    totalRecords: allRecords.length,
    oldestRecord: oldestTimestamp ? new Date(oldestTimestamp) : null,
    newestRecord: newestTimestamp ? new Date(newestTimestamp) : null,
    recordsToDelete,
  };
}

/**
 * Purge records older than the retention period
 */
export async function purgeOldRecords(
  retentionDays: number
): Promise<{ deleted: number }> {
  const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  
  const toDelete = await db.intakeRecords
    .filter(record => record.timestamp < cutoffTime)
    .toArray();
  
  const ids = toDelete.map(r => r.id);
  
  if (ids.length > 0) {
    await db.intakeRecords.bulkDelete(ids);
    logAudit("data_clear", `Purged ${ids.length} records older than ${retentionDays} days`);
  }
  
  return { deleted: ids.length };
}

/**
 * Delete all records (GDPR right to erasure)
 */
export async function deleteAllUserData(): Promise<void> {
  await db.intakeRecords.clear();
  await db.table("auditLogs").clear();
  
  // Clear localStorage settings
  if (typeof window !== "undefined") {
    localStorage.removeItem("intake-tracker-settings");
  }
  
  logAudit("data_clear", "All user data deleted");
}

/**
 * Export all user data (GDPR data portability)
 */
export async function exportAllUserData(): Promise<string> {
  const records = await db.intakeRecords.toArray();
  const auditLogs = await db.table("auditLogs").toArray();
  
  let settings = {};
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("intake-tracker-settings");
      if (stored) {
        settings = JSON.parse(stored);
        // Remove sensitive data from export
        if ('state' in settings && typeof settings.state === 'object' && settings.state !== null) {
          const state = settings.state as Record<string, unknown>;
          delete state.perplexityApiKey;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  logAudit("data_export");
  
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: 2,
    intakeRecords: records,
    auditLogs,
    settings,
  }, null, 2);
}

/**
 * Schedule automatic purge (call on app start)
 */
export function scheduleAutoPurge(
  retentionDays: number,
  intervalHours: number = 24
): () => void {
  // Run immediately on first call
  purgeOldRecords(retentionDays).catch(console.error);
  
  // Then run periodically
  const interval = setInterval(
    () => purgeOldRecords(retentionDays).catch(console.error),
    intervalHours * 60 * 60 * 1000
  );
  
  // Return cleanup function
  return () => clearInterval(interval);
}

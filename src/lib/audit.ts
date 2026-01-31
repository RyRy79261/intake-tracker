/**
 * Audit logging for security compliance.
 * 
 * Tracks sensitive operations for:
 * - Security monitoring
 * - Compliance requirements (HIPAA, GDPR)
 * - Debugging data issues
 * 
 * Logs are stored in IndexedDB and can be exported.
 */

import { db, type AuditAction, type AuditLog } from "./db";

// Re-export the types
export type { AuditAction };
export type AuditEntry = AuditLog;

// In-memory buffer for batching writes
const auditBuffer: AuditEntry[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

/**
 * Log an audit event
 */
export function logAudit(action: AuditAction, details?: string): void {
  const entry: AuditEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    action,
    details: details?.slice(0, 100), // Limit detail length
  };
  
  auditBuffer.push(entry);
  
  // Batch writes to reduce IndexedDB operations
  if (!flushTimeout) {
    flushTimeout = setTimeout(flushAuditBuffer, 1000);
  }
}

/**
 * Flush buffered audit entries to IndexedDB
 */
async function flushAuditBuffer(): Promise<void> {
  flushTimeout = null;
  
  if (auditBuffer.length === 0) return;
  
  const entries = [...auditBuffer];
  auditBuffer.length = 0;
  
  try {
    // Bulk add to audit logs table
    await db.auditLogs.bulkAdd(entries);
  } catch (error) {
    // Don't let audit failures break the app
    console.error("Failed to write audit log:", error);
  }
}

/**
 * Get audit logs for a time range
 */
export async function getAuditLogs(
  startTime?: number,
  endTime?: number
): Promise<AuditEntry[]> {
  try {
    const all = await db.auditLogs.toArray();
    return all.filter((entry: AuditEntry) => {
      if (startTime && entry.timestamp < startTime) return false;
      if (endTime && entry.timestamp > endTime) return false;
      return true;
    }).sort((a: AuditEntry, b: AuditEntry) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Failed to get audit logs:", error);
    return [];
  }
}

/**
 * Export audit logs as JSON
 */
export async function exportAuditLogs(): Promise<string> {
  const logs = await getAuditLogs();
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    logs,
  }, null, 2);
}

/**
 * Clear old audit logs (retention policy)
 */
export async function purgeOldAuditLogs(olderThanDays: number = 90): Promise<number> {
  const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
  
  try {
    const toDelete = await db.auditLogs
      .filter((entry: AuditEntry) => entry.timestamp < cutoff)
      .toArray();
    
    const ids = toDelete.map((e: AuditEntry) => e.id);
    await db.auditLogs.bulkDelete(ids);
    
    return ids.length;
  } catch (error) {
    console.error("Failed to purge old audit logs:", error);
    return 0;
  }
}

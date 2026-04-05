/**
 * Audit service — append-only audit log writer.
 *
 * Two usage patterns:
 *   1. `writeAuditLog(action, details)` — standalone, outside transactions
 *   2. `buildAuditEntry(action, details)` + `db.auditLogs.add(entry)` — inside
 *      an existing db.transaction() to stay within the transaction scope
 */

import { db, type AuditAction, type AuditLog } from "@/lib/db";
import { syncFields } from "@/lib/utils";

export type { AuditAction } from "@/lib/db";

/**
 * Build a complete AuditLog record ready for insertion.
 * Does NOT write to the database — the caller is responsible for that.
 * Use this inside transactions where you need to `db.auditLogs.add()` yourself.
 */
export function buildAuditEntry(
  action: AuditAction,
  details: Record<string, unknown>,
): AuditLog {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    action,
    details: JSON.stringify(details),
    ...syncFields(),
  };
}

/**
 * Write an audit log entry to the database.
 * Standalone — creates its own implicit transaction.
 * Do NOT call from inside an existing db.transaction(); use buildAuditEntry instead.
 */
export async function writeAuditLog(
  action: AuditAction,
  details: Record<string, unknown>,
): Promise<void> {
  const entry = buildAuditEntry(action, details);
  await db.auditLogs.add(entry);
}

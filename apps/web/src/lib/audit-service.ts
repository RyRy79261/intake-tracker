/**
 * Audit service — append-only audit log writer.
 *
 * Inside a synced write, use `w.audit(action, details)` (lib/synced-write.ts).
 * `writeAuditLog` is the standalone form, for code that has no write open.
 */

import type { AuditAction } from "@/lib/db";
import { buildAuditEntry, syncedWrite } from "@/lib/synced-write";

export type { AuditAction } from "@/lib/db";
export { buildAuditEntry };

/** Write one synced audit-log entry in its own transaction. */
export async function writeAuditLog(
  action: AuditAction,
  details: Record<string, unknown>,
): Promise<void> {
  await syncedWrite([], (w) => w.audit(action, details));
}

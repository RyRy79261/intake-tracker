/**
 * MCP server-side audit logger.
 *
 * Fire-and-forget insert into `mcp_audit_log` for every tool invocation.
 * Failures are swallowed so they never break a tool response — the caller
 * already has their answer.
 *
 * PII redaction: tool input args are JSON-stringified but free-form fields
 * (note bodies, food descriptions) are NOT logged. The redaction policy is
 * tool-specific — pass `argsForAudit` containing only safe primitives.
 */
import { db } from "@intake/db/client";
import { mcpAuditLog } from "@intake/db/schema";

export interface AuditEvent {
  userId: string;
  clientId: string;
  tool: string;
  argsForAudit: Record<string, unknown> | null;
  status: "success" | "error";
  errorMessage?: string | null;
  durationMs?: number;
}

export async function writeMcpAudit(event: AuditEvent): Promise<void> {
  try {
    await db.insert(mcpAuditLog).values({
      userId: event.userId,
      clientId: event.clientId,
      tool: event.tool,
      argsJson: event.argsForAudit ? JSON.stringify(event.argsForAudit) : null,
      status: event.status,
      errorMessage: event.errorMessage ?? null,
      durationMs: event.durationMs ?? null,
    });
  } catch (err) {
    console.warn("[mcp] failed to write audit log", err);
  }
}

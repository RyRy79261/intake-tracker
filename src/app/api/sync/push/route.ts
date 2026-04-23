/**
 * POST /api/sync/push — batch-upload client writes with server-side
 * Last-Write-Wins conflict resolution.
 *
 * Security contract (43-03-PLAN.md threat model + 43-RESEARCH.md Pattern 9):
 *   - withAuth gates the route behind a valid Neon Auth session. The handler
 *     never trusts a client-supplied userId; every DB write stamps
 *     `auth.userId!` on the row and every SELECT includes
 *     `eq(table.userId, auth.userId!)` so cross-user access is impossible.
 *   - Body is validated by `pushBodySchema` (drizzle-zod discriminated union
 *     keyed by tableName, with `.omit({userId: true})` on every row schema).
 *     Malformed payloads → 400 with Zod flatten details.
 *   - Batch size capped at 500 ops via Zod `.max(500)` — blocks DoS payloads
 *     before any DB round trip.
 *
 * LWW rules (D-12 precedence order):
 *   1. If server row has non-null deletedAt AND incoming op.row.deletedAt is
 *      null → skip write, ack with server's existing updatedAt. Deleted rows
 *      cannot be resurrected by a stale edit.
 *   2. Else if no existing server row OR clampedUpdatedAt > existing.updatedAt
 *      → upsert via onConflictDoUpdate.
 *   3. Else (server row newer OR exact tie) → skip write, ack with
 *      existing.updatedAt. Strict `>` makes ties deterministic: server keeps
 *      its row.
 *
 * Clock skew (Pattern 9):
 *   `clampedUpdatedAt = min(op.row.updatedAt, serverNow + MAX_FUTURE_MS)`
 *   — client clocks ahead by more than 60s get clamped so a misset device
 *   cannot poison future writes.
 *
 * Logging: module prefix `[sync/push]`. The request body is never logged
 * (contains PHI — timestamps, food descriptions, medication names).
 */
import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { withAuth } from "@/lib/auth-middleware";
import { db as drizzleDb } from "@/lib/drizzle";
import { usersSync } from "@/db/schema";
import {
  pushBodySchema,
  schemaByTableName,
  type TableName,
} from "@/lib/sync-payload";

export const maxDuration = 60;

const MAX_FUTURE_MS = 60_000;
const SELECT_CHUNK_SIZE = 100;

function sanitizeRow(obj: Record<string, any>): Record<string, any> {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined || obj[key] === "") {
      obj[key] = null;
    }
  }
  return obj;
}

function extractDbError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as any).cause;
  if (cause instanceof Error) {
    const code = (cause as any).code ?? "";
    const detail = (cause as any).detail ?? "";
    return [cause.message, code && `code=${code}`, detail && `detail=${detail}`]
      .filter(Boolean)
      .join(" | ");
  }
  const msg = err.message;
  const pgMatch = msg.match(/ERROR:\s*(.+?)(?:\n|$)/);
  if (pgMatch) return pgMatch[1]!;
  if (msg.length > 300) return msg.slice(0, 300) + "…";
  return msg;
}

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const body = await request.json();
    const parsed = pushBodySchema.safeParse(body);
    if (!parsed.success) {
      console.error("[sync/push] Zod validation failed:", JSON.stringify(parsed.error.flatten(), null, 2));
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Ensure the user exists in neon_auth.users_sync before any FK-dependent
    // inserts. Neon Auth replicates users asynchronously — on preview branches
    // or during race conditions the row may not exist yet.
    await drizzleDb
      .insert(usersSync)
      .values({ id: auth.userId! })
      .onConflictDoNothing();

    const serverNow = Date.now();
    const accepted: Array<{ queueId: number; serverUpdatedAt: number }> = [];
    const rejected: Array<{
      queueId: number;
      tableName: string;
      error: string;
    }> = [];

    const opsByTable = new Map<
      TableName,
      typeof parsed.data.ops
    >();
    for (const op of parsed.data.ops) {
      const tn = op.tableName as TableName;
      const bucket = opsByTable.get(tn) ?? [];
      bucket.push(op);
      opsByTable.set(tn, bucket);
    }

    for (const [tableName, tableOps] of opsByTable) {
      const table = schemaByTableName[tableName];
      const ids = tableOps.map((op) => op.row.id as string);

      // Chunked SELECT to avoid exceeding Neon HTTP parameter limits
      let existingById: Map<
        string,
        { updatedAt: number; deletedAt: number | null }
      >;
      try {
        existingById = new Map();
        for (let i = 0; i < ids.length; i += SELECT_CHUNK_SIZE) {
          const chunk = ids.slice(i, i + SELECT_CHUNK_SIZE);
          const rows = await drizzleDb
            .select()
            .from(table)
            .where(
              and(
                inArray((table as any).id, chunk),
                eq((table as any).userId, auth.userId!),
              ),
            );
          for (const r of rows) {
            existingById.set((r as any).id as string, r as any);
          }
        }
      } catch (selectErr) {
        const dbErr = extractDbError(selectErr);
        console.error(
          `[sync/push] Batch SELECT failed: table=${tableName} — ${dbErr}`,
        );
        for (const op of tableOps) {
          rejected.push({
            queueId: op.queueId,
            tableName,
            error: dbErr,
          });
        }
        continue;
      }

      for (const op of tableOps) {
        const clampedUpdatedAt = Math.min(
          op.row.updatedAt,
          serverNow + MAX_FUTURE_MS,
        );
        const serverRow = existingById.get(op.row.id as string);

        if (
          serverRow &&
          serverRow.deletedAt != null &&
          op.row.deletedAt == null
        ) {
          accepted.push({
            queueId: op.queueId,
            serverUpdatedAt: serverRow.updatedAt,
          });
          continue;
        }

        if (!serverRow || clampedUpdatedAt > serverRow.updatedAt) {
          const rowWithoutUserId: Record<string, any> = { ...op.row };
          delete rowWithoutUserId.userId;
          sanitizeRow(rowWithoutUserId);

          const writeValues: Record<string, any> = {
            ...rowWithoutUserId,
            userId: auth.userId!,
            updatedAt: clampedUpdatedAt,
          };

          const { id: _id, ...setValues } = writeValues;
          try {
            await (drizzleDb as any)
              .insert(table)
              .values(writeValues)
              .onConflictDoUpdate({
                target: (table as any).id,
                set: setValues,
              });
            accepted.push({
              queueId: op.queueId,
              serverUpdatedAt: clampedUpdatedAt,
            });
          } catch (err: unknown) {
            const dbErr = extractDbError(err);
            console.error(
              `[sync/push] Op failed: table=${tableName} id=${op.row.id} — ${dbErr}`,
            );
            rejected.push({
              queueId: op.queueId,
              tableName,
              error: dbErr,
            });
          }
          continue;
        }

        accepted.push({
          queueId: op.queueId,
          serverUpdatedAt: serverRow.updatedAt,
        });
      }
    }

    return NextResponse.json({ accepted, rejected });
  } catch (error) {
    console.error("[sync/push] Error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      { error: "Failed to apply push batch", detail: message },
      { status: 500 },
    );
  }
});

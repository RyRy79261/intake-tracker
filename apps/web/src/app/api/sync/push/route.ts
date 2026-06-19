/**
 * POST /api/sync/push — batch-upload client writes with server-side
 * Last-Write-Wins conflict resolution.
 *
 * Security contract (43-03-PLAN.md threat model + 43-RESEARCH.md Pattern 9):
 *   - withAuth gates the route behind a valid Neon Auth session. The handler
 *     never trusts a client-supplied userId; every DB write stamps
 *     `auth.userId!` on the row and every SELECT includes
 *     `eq(table.userId, auth.userId!)` so cross-user access is impossible.
 *   - The OUTER envelope (`{ ops: [...] }`, ≤500) is validated by
 *     `pushEnvelopeSchema`; a non-array body or oversized batch → 400.
 *   - Each op is then validated INDIVIDUALLY against `opSchema_` (drizzle-zod
 *     discriminated union keyed by tableName, with `.omit({userId: true})` on
 *     every row schema). A single malformed row is quarantined into the
 *     `rejected` array (code "invalid") rather than 400-ing the whole batch —
 *     otherwise one poisoned record wedges the client's queue forever, since
 *     it just re-sends the same failing batch every cycle. No schema detail is
 *     exposed to the client (only logged server-side).
 *   - Batch size capped at 500 ops via Zod `.max(500)` — blocks DoS payloads
 *     before any DB round trip.
 *
 * LWW rules (D-12 precedence order):
 *   1. If server row has non-null deletedAt AND incoming op.row.deletedAt is
 *      null → skip write, ack with server's existing updatedAt. Deleted rows
 *      cannot be resurrected by a stale edit.
 *   2. Else if no existing server row OR clampedUpdatedAt > existing.updatedAt
 *      → upsert via onConflictDoUpdate.
 *   2b. Tombstone tie-break: if incoming op carries a tombstone AND the
 *      server row is live AND the clamped updatedAt ties exactly with
 *      existing.updatedAt → write the tombstone. Symmetric with rule 1:
 *      deletion is a deliberate user action and a stronger intent than
 *      a concurrent edit, so it wins on ties. Stale tombstones (where
 *      incoming.updatedAt < existing.updatedAt) still lose via rule 3.
 *   3. Else (server row newer OR upsert-vs-upsert tie) → skip write, ack
 *      with existing.updatedAt. Strict `>` keeps upsert ties deterministic
 *      (server's row wins) since both writes carry equivalent intent.
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
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import { withAuth } from "@/lib/auth-middleware";
import { db as drizzleDb } from "@intake/db/client";
import { usersSync } from "@intake/db/schema";
import {
  pushEnvelopeSchema,
  opSchema_,
  schemaByTableName,
  type PushOp,
  type TableName,
} from "@intake/db/sync-payload";

export const maxDuration = 60;

const MAX_FUTURE_MS = 60_000;
const SELECT_CHUNK_SIZE = 100;

function sanitizeRow(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined || obj[key] === "") {
      obj[key] = null;
    }
  }
  return obj;
}

function extractDbError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code ?? "";
    const detail = (cause as { detail?: string }).detail ?? "";
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
    // Validate the OUTER envelope only (ops is an array within the DoS cap).
    // A non-array body or an oversized batch is a malformed request → 400.
    const envelope = pushEnvelopeSchema.safeParse(body);
    if (!envelope.success) {
      console.error("[sync/push] Envelope validation failed:", JSON.stringify(z.flattenError(envelope.error), null, 2));
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 },
      );
    }

    // Validate each op INDIVIDUALLY. One malformed row (e.g. a NaN that
    // serialised to null in a notNull column) must not 400 the whole batch —
    // doing so wedges the entire sync queue forever, because the client just
    // re-sends the same poisoned batch on every cycle. Instead, quarantine the
    // bad op into `rejected` (code "invalid", so the client can drop it) and
    // let every valid op apply.
    const validOps: PushOp[] = [];
    const rejected: Array<{
      queueId: number;
      tableName: string;
      error: string;
      code?: string;
    }> = [];
    for (const rawOp of envelope.data.ops) {
      const parsedOp = opSchema_.safeParse(rawOp);
      if (parsedOp.success) {
        validOps.push(parsedOp.data);
      } else {
        const raw = (rawOp ?? {}) as Record<string, unknown>;
        const queueId = typeof raw.queueId === "number" ? raw.queueId : -1;
        const tableName =
          typeof raw.tableName === "string" ? raw.tableName : "unknown";
        console.error(
          `[sync/push] Op rejected (invalid shape): table=${tableName} queueId=${queueId} — ${JSON.stringify(z.flattenError(parsedOp.error))}`,
        );
        rejected.push({
          queueId,
          tableName,
          error: "Record failed validation and cannot be synced",
          code: "invalid",
        });
      }
    }

    const parsed = { data: { ops: validOps } };

    // Ensure the user exists in neon_auth.users_sync before any FK-dependent
    // inserts. Neon Auth replicates users asynchronously — on preview branches
    // or during race conditions the row may not exist yet.
    await drizzleDb
      .insert(usersSync)
      .values({ id: auth.userId! })
      .onConflictDoNothing();

    const serverNow = Date.now();
    const accepted: Array<{ queueId: number; serverUpdatedAt: number }> = [];

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
                inArray((table as { id: PgColumn }).id, chunk),
                eq((table as { userId: PgColumn }).userId, auth.userId!),
              ),
            );
          for (const r of rows) {
            const row = r as { id: string; updatedAt: number; deletedAt: number | null };
            existingById.set(row.id, row);
          }
        }
      } catch (selectErr) {
        console.error(
          `[sync/push] Batch SELECT failed: table=${tableName} — ${extractDbError(selectErr)}`,
        );
        for (const op of tableOps) {
          rejected.push({
            queueId: op.queueId,
            tableName,
            error: "Server rejected the write",
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

        // Rule 2b (tombstone tie-break): an incoming tombstone against
        // a live server row with the same clamped updatedAt should
        // succeed. Without this, the strict `>` rule below silently
        // drops the delete — discovered by the property test in
        // src/__tests__/sync-conflict.property.test.ts (D-12 finding).
        // Deletion is a deliberate user action and a stronger intent
        // than a concurrent edit, so it wins on ties. Stale tombstones
        // (incoming.updatedAt < existing.updatedAt) still lose.
        const tombstoneTieBreak =
          serverRow != null &&
          serverRow.deletedAt == null &&
          op.row.deletedAt != null &&
          clampedUpdatedAt === serverRow.updatedAt;

        if (!serverRow || clampedUpdatedAt > serverRow.updatedAt || tombstoneTieBreak) {
          const rowWithoutUserId: Record<string, unknown> = { ...op.row };
          delete rowWithoutUserId.userId;
          sanitizeRow(rowWithoutUserId);

          const writeValues: Record<string, unknown> = {
            ...rowWithoutUserId,
            userId: auth.userId!,
            updatedAt: clampedUpdatedAt,
          };

          const { id: _id, ...setValues } = writeValues;
          try {
            await drizzleDb
              .insert(table as PgTable)
              .values(writeValues)
              .onConflictDoUpdate({
                target: (table as { id: PgColumn }).id,
                set: setValues,
              });
            accepted.push({
              queueId: op.queueId,
              serverUpdatedAt: clampedUpdatedAt,
            });
          } catch (err: unknown) {
            console.error(
              `[sync/push] Op failed: table=${tableName} id=${op.row.id} — ${extractDbError(err)}`,
            );
            rejected.push({
              queueId: op.queueId,
              tableName,
              error: "Server rejected the write",
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
    return NextResponse.json(
      { error: "Failed to apply push batch" },
      { status: 500 },
    );
  }
});

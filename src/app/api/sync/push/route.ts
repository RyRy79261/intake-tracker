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
import { eq, and } from "drizzle-orm";
import { withAuth } from "@/lib/auth-middleware";
import { db as drizzleDb } from "@/lib/drizzle";
import {
  pushBodySchema,
  schemaByTableName,
  type TableName,
} from "@/lib/sync-payload";

const MAX_FUTURE_MS = 60_000;

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const body = await request.json();
    const parsed = pushBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const serverNow = Date.now();
    const accepted: Array<{ queueId: number; serverUpdatedAt: number }> = [];

    for (const op of parsed.data.ops) {
      const table = schemaByTableName[op.tableName as TableName];
      const clampedUpdatedAt = Math.min(
        op.row.updatedAt,
        serverNow + MAX_FUTURE_MS,
      );

      // User-scoped fetch: every SELECT filters by both id AND userId so a
      // compromised/forged client id cannot read another user's rows.
      const existing = await drizzleDb
        .select()
        .from(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where(and(eq((table as any).id, op.row.id), eq((table as any).userId, auth.userId!)))
        .limit(1);
      const serverRow = existing[0] as
        | { updatedAt: number; deletedAt: number | null }
        | undefined;

      // D-12 rule 1: non-null deletedAt on server + null on incoming
      // → deleted wins, no resurrection.
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

      // D-12 rule 2: strict `>` — exact tie keeps server row (rule 3 below).
      if (!serverRow || clampedUpdatedAt > serverRow.updatedAt) {
        // Strip any client-forged userId from the row before spreading: the
        // drizzle-zod schema already omits it at parse time, but belt-and-
        // suspenders here prevents any future regression where the schema
        // might re-admit it.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rowWithoutUserId: Record<string, any> = { ...op.row };
        delete rowWithoutUserId.userId;

        const writeValues = {
          ...rowWithoutUserId,
          userId: auth.userId!,
          updatedAt: clampedUpdatedAt,
        };

        // Type cast: `table` is a union across all 16 Drizzle tables from
        // schemaByTableName; TS intersects the insert-shape overloads into a
        // super-type that demands every table's required fields. At runtime
        // drizzle uses only the columns that exist on the specific table
        // passed in, so we cast to `any` for the insert call. Safety is
        // preserved by pushBodySchema — drizzle-zod guarantees the row
        // matches the real table schema before this branch is reached.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (drizzleDb as any)
          .insert(table)
          .values(writeValues)
          .onConflictDoUpdate({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            target: (table as any).id,
            set: writeValues,
          });

        accepted.push({
          queueId: op.queueId,
          serverUpdatedAt: clampedUpdatedAt,
        });
        continue;
      }

      // D-12 rule 3 (implicit): server row newer or exact tie → skip + ack
      // with server's updatedAt so the client overwrites its local copy.
      accepted.push({
        queueId: op.queueId,
        serverUpdatedAt: serverRow.updatedAt,
      });
    }

    return NextResponse.json({ accepted });
  } catch (error) {
    // PHI-safe log: error object only, no request body.
    console.error("[sync/push] Error:", error);
    return NextResponse.json(
      { error: "Failed to apply push batch" },
      { status: 500 },
    );
  }
});

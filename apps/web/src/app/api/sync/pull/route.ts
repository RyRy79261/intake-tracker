/**
 * POST /api/sync/pull — cursor-paginated per-table SELECT returning changes
 * since the client's last-seen `updatedAt` per table.
 *
 * Security contract (43-04-PLAN.md threat model):
 *   - withAuth gates the route behind a valid Neon Auth session. The handler
 *     never trusts a client-supplied userId; every SELECT scopes by
 *     `eq(table.userId, auth.userId!)` so cross-user reads are impossible
 *     (T-sync-05).
 *   - Body is validated by `pullBodySchema` — cursor keys are restricted to
 *     the known tableName literals (z.enum) and cursor values must be
 *     non-negative integers (T-43-04-05 blocks cursor injection).
 *
 * Cursor-race safety (T-sync-07 / 43-RESEARCH.md Pattern 7):
 *   `serverTime = Date.now()` is captured BEFORE any SELECT runs. The client
 *   clamps its next cursor to `min(maxRowUpdatedAt, serverTime - 30s)` so
 *   rows written DURING the query window aren't skipped on the next pull.
 *
 * DoS mitigation (T-43-04-03):
 *   Each table's result is capped at PULL_SOFT_CAP (500) with a `hasMore`
 *   flag. Detection idiom: SELECT `limit(PULL_SOFT_CAP + 1)`; if the DB
 *   returned the extra row, `hasMore = true` and we slice back to the cap.
 *
 * Tombstones (43-RESEARCH.md Pattern 8):
 *   Rows with non-null `deletedAt` ARE returned verbatim. The client applies
 *   them as soft-delete writes. The pull route NEVER filters tombstones.
 *
 * Ordering note (D-08):
 *   Pull iterates `Object.keys(schemaByTableName)` directly rather than
 *   reusing the FK topological order from sync-topology.ts (Plan 05). Pull
 *   order does not matter for correctness — the client re-calls pull until
 *   every table reports `hasMore: false`, and reads tolerate arriving in
 *   any order (unlike pushes, which must respect parent-before-child FK).
 *   Decoupling pull from sync-topology.ts also keeps Plan 04 independent of
 *   Plan 05's wave-2 parallel work.
 *
 * Logging: module prefix `[sync/pull]`. Request body is never logged
 * (cursor map is harmless but the convention is to never log request bodies
 * from sync routes — keeps PHI out of logs by default).
 */
import { NextResponse } from "next/server";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { withAuth } from "@/lib/auth-middleware";
import { db as drizzleDb } from "@intake/db/client";
import {
  PULL_SOFT_CAP,
  pullBodySchema,
  schemaByTableName,
  type TableName,
} from "@intake/db/sync-payload";

export const maxDuration = 60;

export const POST = withAuth(async ({ request, auth }) => {
  try {
    const body = await request.json();
    const parsed = pullBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // MUST be captured before any SELECT runs — see Pattern 7 race mitigation
    // note at the top of the file.
    const serverTime = Date.now();

    const tableNames = (Object.keys(schemaByTableName) as TableName[]).filter(t => t !== 'auditLogs');
    const entries = await Promise.all(
      tableNames.map(async (tableName) => {
        // Keyset cursor: `(updatedAt, id)`. A legacy client may still send a
        // bare `updatedAt` number — normalise it to a zero-id cursor.
        const rawCursor = parsed.data.cursors[tableName];
        const cursorUpdatedAt =
          typeof rawCursor === "number" ? rawCursor : rawCursor?.updatedAt ?? 0;
        const cursorId =
          typeof rawCursor === "number" ? "" : rawCursor?.id ?? "";
        const table = schemaByTableName[tableName] as any;

        // `updatedAt > cursor` OR `(updatedAt = cursor AND id > cursorId)` —
        // the tuple comparison keeps pagination correct when many rows share
        // one `updatedAt`. Ordering matches: `(updatedAt ASC, id ASC)`.
        const rows = (await drizzleDb
          .select()
          .from(table)
          .where(
            and(
              eq(table.userId, auth.userId!),
              or(
                gt(table.updatedAt, cursorUpdatedAt),
                and(
                  eq(table.updatedAt, cursorUpdatedAt),
                  gt(table.id, cursorId),
                ),
              ),
            ),
          )
          .orderBy(asc(table.updatedAt), asc(table.id))
          .limit(PULL_SOFT_CAP + 1)) as Record<string, unknown>[];

        const hasMore = rows.length > PULL_SOFT_CAP;
        return [
          tableName,
          { rows: rows.slice(0, PULL_SOFT_CAP), hasMore },
        ] as const;
      }),
    );

    const result: Record<
      string,
      { rows: Record<string, unknown>[]; hasMore: boolean }
    > = Object.fromEntries(entries);

    return NextResponse.json({ result, serverTime });
  } catch (error) {
    console.error("[sync/pull] Error:", error);
    return NextResponse.json(
      { error: "Failed to pull changes" },
      { status: 500 },
    );
  }
});

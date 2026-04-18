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
 *     the 16 known tableName literals (z.enum) and cursor values must be
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
import { and, asc, eq, gt } from "drizzle-orm";
import { withAuth } from "@/lib/auth-middleware";
import { db as drizzleDb } from "@/lib/drizzle";
import {
  PULL_SOFT_CAP,
  pullBodySchema,
  schemaByTableName,
  type TableName,
} from "@/lib/sync-payload";

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

    const result: Record<
      string,
      { rows: Record<string, unknown>[]; hasMore: boolean }
    > = {};

    const tableNames = Object.keys(schemaByTableName) as TableName[];
    for (const tableName of tableNames) {
      const cursor = parsed.data.cursors[tableName] ?? 0;
      const table = schemaByTableName[tableName] as any;

      const rows = (await drizzleDb
        .select()
        .from(table)
        .where(
          and(
            eq(table.userId, auth.userId!),
            gt(table.updatedAt, cursor),
          ),
        )
        .orderBy(asc(table.updatedAt))
        .limit(PULL_SOFT_CAP + 1)) as Record<string, unknown>[];

      const hasMore = rows.length > PULL_SOFT_CAP;
      result[tableName] = {
        rows: rows.slice(0, PULL_SOFT_CAP),
        hasMore,
      };
    }

    return NextResponse.json({ result, serverTime });
  } catch (error) {
    // PHI-safe log: error object only, no request body.
    console.error("[sync/pull] Error:", error);
    return NextResponse.json(
      { error: "Failed to pull changes" },
      { status: 500 },
    );
  }
});

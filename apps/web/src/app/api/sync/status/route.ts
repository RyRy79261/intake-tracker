/**
 * GET /api/sync/status — check if the authenticated user has previously synced
 * data to the server.
 *
 * Used on cold starts (new device, cleared localStorage) to restore
 * storageMode: "cloud-sync" without requiring the user to re-enable sync
 * manually. Queries a few high-signal tables and short-circuits on the first
 * hit.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { type PgColumn } from "drizzle-orm/pg-core";
import { withAuth } from "@/lib/auth-middleware";
import { db as drizzleDb } from "@intake/db/client";
import {
  intakeRecords,
  weightRecords,
  prescriptions,
  doseLogs,
  auditLogs,
} from "@intake/db/schema";

const PROBE_TABLES = [
  intakeRecords,
  weightRecords,
  prescriptions,
  doseLogs,
  auditLogs,
] as const;

export const GET = withAuth(async ({ auth }) => {
  try {
    for (const table of PROBE_TABLES) {
      const rows = await drizzleDb
        .select({ id: (table as { id: PgColumn }).id })
        .from(table)
        .where(eq((table as { userId: PgColumn }).userId, auth.userId!))
        .limit(1);
      if (rows.length > 0) {
        return NextResponse.json({ hasSyncedData: true });
      }
    }
    return NextResponse.json({ hasSyncedData: false });
  } catch (error) {
    console.error("[sync/status] Error:", error);
    return NextResponse.json(
      { error: "Failed to check sync status" },
      { status: 500 },
    );
  }
});

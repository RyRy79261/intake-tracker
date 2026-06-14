import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { eq, gt, and } from "drizzle-orm";
import { type PgColumn } from "drizzle-orm/pg-core";
import { withAuth } from "@/lib/auth-middleware";
import { db } from "@intake/db/client";
import { schemaByTableName, type TableName } from "@intake/db/sync-payload";

export const maxDuration = 60;

const SELECT_CHUNK_SIZE = 200;

function deterministicJsonRow(row: Record<string, unknown>): string {
  return JSON.stringify(row, (_, value) =>
    value === undefined
      ? null
      : value && typeof value === "object" && !Array.isArray(value)
        ? Object.keys(value)
            .sort()
            .reduce<Record<string, unknown>>((acc, k) => {
              acc[k] = value[k as keyof typeof value];
              return acc;
            }, {})
        : value,
  );
}

export const POST = withAuth(async ({ auth }) => {
  try {
    const hashes: Record<string, string> = {};
    const rowCounts: Record<string, number> = {};

    for (const tableName of Object.keys(schemaByTableName) as TableName[]) {
      const table = schemaByTableName[tableName];
      const hash = createHash("sha256");
      let count = 0;
      let cursor: string | null = null;

      hash.update("[");
      for (;;) {
        const conditions = [
          eq((table as { userId: PgColumn }).userId, auth.userId!),
        ];
        if (cursor) {
          conditions.push(gt((table as { id: PgColumn }).id, cursor));
        }

        const rows = await db
          .select()
          .from(table)
          .where(and(...conditions))
          .orderBy((table as { id: PgColumn }).id)
          .limit(SELECT_CHUNK_SIZE);

        for (const row of rows) {
          const { userId: _, ...rest } = row as Record<string, unknown> & { userId: unknown };
          if (count > 0) hash.update(",");
          hash.update(deterministicJsonRow(rest));
          count++;
        }

        if (rows.length < SELECT_CHUNK_SIZE) break;
        cursor = (rows[rows.length - 1] as { id: string }).id;
      }
      hash.update("]");

      hashes[tableName] = hash.digest("hex");
      rowCounts[tableName] = count;
    }

    console.log(
      "[sync/verify-hash] Computed hashes for %d tables",
      Object.keys(hashes).length,
    );

    return NextResponse.json({ hashes, rowCounts });
  } catch (error) {
    console.error("[sync/verify-hash] Error:", error);
    return NextResponse.json(
      { error: "Failed to compute verification hashes" },
      { status: 500 },
    );
  }
});

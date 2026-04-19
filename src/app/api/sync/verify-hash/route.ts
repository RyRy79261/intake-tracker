import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth-middleware";
import { db } from "@/lib/drizzle";
import { schemaByTableName, type TableName } from "@/lib/sync-payload";

function deterministicJson(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, (_, value) =>
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
      const rows = await db
        .select()
        .from(table)
        .where(eq((table as any).userId, auth.userId!))
        .orderBy((table as any).id);

      const stripped = rows.map((row: Record<string, unknown>) => {
        const { userId: _, ...rest } = row as Record<string, unknown> & { userId: unknown };
        return rest;
      });

      const json = deterministicJson(stripped);
      const hash = createHash("sha256").update(json).digest("hex");

      hashes[tableName] = hash;
      rowCounts[tableName] = stripped.length;
    }

    console.log(
      "[migration/verify-hash] Computed hashes for %d tables",
      Object.keys(hashes).length,
    );

    return NextResponse.json({ hashes, rowCounts });
  } catch (error) {
    console.error("[migration/verify-hash] Error:", error);
    return NextResponse.json(
      { error: "Failed to compute verification hashes" },
      { status: 500 },
    );
  }
});

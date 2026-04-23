import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth-middleware";
import { db } from "@/lib/drizzle";
import { schemaByTableName, type TableName } from "@/lib/sync-payload";

export const maxDuration = 60;

const DELETION_ORDER: TableName[] = [
  "doseLogs",
  "inventoryTransactions",
  "inventoryItems",
  "phaseSchedules",
  "medicationPhases",
  "titrationPlans",
  "prescriptions",
  "substanceRecords",
  "auditLogs",
  "dailyNotes",
  "defecationRecords",
  "urinationRecords",
  "eatingRecords",
  "bloodPressureRecords",
  "weightRecords",
  "intakeRecords",
];

export const POST = withAuth(async ({ auth }) => {
  try {
    const deleted: Record<string, number> = {};

    for (const tableName of DELETION_ORDER) {
      const table = schemaByTableName[tableName];
      const result = await db
        .delete(table)
        .where(eq((table as any).userId, auth.userId!));

      deleted[tableName] = result.rowCount ?? 0;
    }

    console.log(
      "[sync/cleanup] Deleted user rows: %s",
      Object.entries(deleted)
        .map(([t, n]) => `${t}=${n}`)
        .join(", "),
    );

    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("[sync/cleanup] Error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      { error: "Failed to clean up user data", detail: message },
      { status: 500 },
    );
  }
});

import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { db as drizzleDb } from "@/lib/drizzle";
import { intakeRecords } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const POST = withAuth(async ({ auth }) => {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_E2E_TEST_ROUTES !== "true"
  ) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const result = await drizzleDb
    .select({ count: sql<number>`count(*)::int` })
    .from(intakeRecords)
    .where(eq(intakeRecords.userId, auth.userId!));

  return NextResponse.json({ count: result[0]?.count ?? 0 });
});

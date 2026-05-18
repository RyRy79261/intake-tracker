import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { db as drizzleDb } from "@/lib/drizzle";
import { intakeRecords } from "@/db/schema";

export const POST = withAuth(async ({ request, auth }) => {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_E2E_TEST_ROUTES !== "true"
  ) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const now = Date.now();
    const id = body.id ?? crypto.randomUUID();

    const record = {
      id,
      userId: auth.userId!,
      type: body.type ?? "water",
      amount: body.amount ?? 250,
      timestamp: body.timestamp ?? now,
      source: body.source ?? "e2e-server-insert",
      createdAt: body.createdAt ?? now,
      updatedAt: body.updatedAt ?? now,
      deletedAt: body.deletedAt ?? null,
      deviceId: body.deviceId ?? "server-e2e",
      timezone: body.timezone ?? "UTC",
    };

    await drizzleDb.insert(intakeRecords).values(record);

    return NextResponse.json({ ok: true, id, updatedAt: record.updatedAt });
  } catch (error) {
    console.error("[e2e-test/insert-intake] Error:", error);
    return NextResponse.json(
      { error: "Insert failed", detail: String(error) },
      { status: 500 },
    );
  }
});

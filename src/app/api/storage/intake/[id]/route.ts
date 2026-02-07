import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { neonDb, intakeRecords } from "@/lib/neon-db";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  return verifyAndCheckWhitelist(token ?? null);
}

// DELETE /api/storage/intake/[id] - Delete intake record
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await neonDb
      .delete(intakeRecords)
      .where(
        and(eq(intakeRecords.id, id), eq(intakeRecords.userId, auth.userId))
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete intake record:", error);
    return NextResponse.json(
      { error: "Failed to delete record" },
      { status: 500 }
    );
  }
}

// PATCH /api/storage/intake/[id] - Update intake record
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { amount, timestamp, note } = body;

    const updates: Record<string, unknown> = {};
    if (amount !== undefined) updates.amount = amount;
    if (timestamp !== undefined) updates.timestamp = timestamp;
    if (note !== undefined) updates.note = note?.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    await neonDb
      .update(intakeRecords)
      .set(updates)
      .where(
        and(eq(intakeRecords.id, id), eq(intakeRecords.userId, auth.userId))
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update intake record:", error);
    return NextResponse.json(
      { error: "Failed to update record" },
      { status: 500 }
    );
  }
}

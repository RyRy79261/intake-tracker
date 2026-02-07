import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { neonDb, bloodPressureRecords } from "@/lib/neon-db";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  return verifyAndCheckWhitelist(token ?? null);
}

// DELETE /api/storage/blood-pressure/[id] - Delete blood pressure record
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
    await neonDb
      .delete(bloodPressureRecords)
      .where(
        and(
          eq(bloodPressureRecords.id, id),
          eq(bloodPressureRecords.userId, auth.userId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete blood pressure record:", error);
    return NextResponse.json(
      { error: "Failed to delete record" },
      { status: 500 }
    );
  }
}

// PATCH /api/storage/blood-pressure/[id] - Update blood pressure record
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
    const { systolic, diastolic, heartRate, position, arm, timestamp, note } = body;

    const updates: Record<string, unknown> = {};
    if (systolic !== undefined) updates.systolic = systolic;
    if (diastolic !== undefined) updates.diastolic = diastolic;
    if (heartRate !== undefined) updates.heartRate = heartRate;
    if (position !== undefined) updates.position = position;
    if (arm !== undefined) updates.arm = arm;
    if (timestamp !== undefined) updates.timestamp = timestamp;
    if (note !== undefined) updates.note = note?.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    await neonDb
      .update(bloodPressureRecords)
      .set(updates)
      .where(
        and(
          eq(bloodPressureRecords.id, id),
          eq(bloodPressureRecords.userId, auth.userId)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update blood pressure record:", error);
    return NextResponse.json(
      { error: "Failed to update record" },
      { status: 500 }
    );
  }
}

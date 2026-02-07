import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { neonDb, intakeRecords, weightRecords, bloodPressureRecords, userSettings } from "@/lib/neon-db";
import { verifyAndCheckWhitelist } from "@/lib/privy-server";

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  return verifyAndCheckWhitelist(token ?? null);
}

// DELETE /api/storage/clear - Delete all user data from server
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    // Delete all records for this user in parallel
    const [intakeDeleted, weightDeleted, bpDeleted, settingsDeleted] = await Promise.all([
      neonDb.delete(intakeRecords).where(eq(intakeRecords.userId, auth.userId)),
      neonDb.delete(weightRecords).where(eq(weightRecords.userId, auth.userId)),
      neonDb.delete(bloodPressureRecords).where(eq(bloodPressureRecords.userId, auth.userId)),
      neonDb.delete(userSettings).where(eq(userSettings.userId, auth.userId)),
    ]);

    return NextResponse.json({
      success: true,
      deleted: {
        intake: true,
        weight: true,
        bloodPressure: true,
        settings: true,
      },
    });
  } catch (error) {
    console.error("Failed to clear user data:", error);
    return NextResponse.json(
      { error: "Failed to clear user data" },
      { status: 500 }
    );
  }
}

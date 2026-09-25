import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { deleteMigratedData } from "@/lib/user-data-deletion";

export const maxDuration = 60;

export const POST = withAuth(async ({ auth }) => {
  try {
    // FK-safe order, one transaction — shared with wipe/account-delete so the
    // three paths cannot drift apart again (audit sync-engine#6).
    const deleted = await deleteMigratedData(auth.userId!);

    console.log(
      "[sync/cleanup] Deleted user rows: %s",
      Object.entries(deleted)
        .map(([t, n]) => `${t}=${n}`)
        .join(", "),
    );

    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("[sync/cleanup] Error:", error);
    return NextResponse.json(
      { error: "Failed to clean up user data" },
      { status: 500 },
    );
  }
});

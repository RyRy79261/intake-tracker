/**
 * POST /api/account/delete — scrub ALL server-side data for the authenticated
 * user.
 *
 * Backs the "delete my account" flow. Deletes every user-scoped row across the
 * synced data tables, push tables, AI keys/usage, key shares, async insight
 * jobs, and MCP tables. The Neon Auth login identity itself is deleted
 * client-side via the auth SDK (`/delete-user`) AFTER this succeeds — data must
 * be scrubbed while the session is still valid.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { deleteAllUserData } from "@/lib/user-data-deletion";

export const maxDuration = 60;

export const POST = withAuth(async ({ auth }) => {
  try {
    const deleted = await deleteAllUserData(auth.userId!);
    console.log(
      "[account/delete] Scrubbed user data: %s",
      Object.entries(deleted)
        .map(([t, n]) => `${t}=${n}`)
        .join(", "),
    );
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("[account/delete] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete account data" },
      { status: 500 },
    );
  }
});

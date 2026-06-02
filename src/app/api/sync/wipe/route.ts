/**
 * POST /api/sync/wipe — delete the authenticated user's cloud data mirror.
 *
 * Backs the "switch back to local-only" flow: the client first pulls every
 * server row down into IndexedDB, then calls this to remove the cloud copy
 * (synced tables + push subscriptions) while keeping the account, login
 * identity, and AI keys intact. Local data is untouched — it lives on-device.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { wipeCloudData } from "@/lib/user-data-deletion";

export const maxDuration = 60;

export const POST = withAuth(async ({ auth }) => {
  try {
    const deleted = await wipeCloudData(auth.userId!);
    console.log(
      "[sync/wipe] Wiped cloud data: %s",
      Object.entries(deleted)
        .map(([t, n]) => `${t}=${n}`)
        .join(", "),
    );
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("[sync/wipe] Error:", error);
    return NextResponse.json(
      { error: "Failed to wipe cloud data" },
      { status: 500 },
    );
  }
});

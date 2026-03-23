import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { deletePushSubscription } from "@/lib/push-db";

export const POST = withAuth(async ({ request: _request, auth }) => {
  try {
    await deletePushSubscription(auth.userId!);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[push/unsubscribe] Error:", error);
    return NextResponse.json(
      { error: "Failed to remove subscription" },
      { status: 500 }
    );
  }
});

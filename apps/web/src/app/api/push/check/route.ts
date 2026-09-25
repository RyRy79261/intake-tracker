import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { dispatchUserReminders } from "@/lib/push-dispatch";

async function getSendPush() {
  const { sendPush } = await import("@/lib/push-sender");
  return sendPush;
}

/**
 * Foreground dispatch for the signed-in user, pinged by an open client. The
 * cron (/api/push/send) covers the background; both share the same claim-
 * before-send dispatcher, so they never double-send a slot.
 */
export const POST = withAuth(async ({ auth }) => {
  try {
    const sendPush = await getSendPush();
    const { sent, followUps } = await dispatchUserReminders(auth.userId!, new Date(), sendPush);

    if (sent === 0 && followUps === 0) {
      return NextResponse.json({ nothingDue: true });
    }

    return NextResponse.json({ sent, followUps });
  } catch (error) {
    console.error("[push/check] Error:", error);
    return NextResponse.json(
      { error: "Failed to check notifications" },
      { status: 500 }
    );
  }
});

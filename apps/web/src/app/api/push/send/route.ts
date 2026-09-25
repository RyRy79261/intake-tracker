import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { getAllSubscribedUserIds } from "@/lib/push-db";
import { dispatchUserReminders } from "@/lib/push-dispatch";

async function getSendPush() {
  const { sendPush } = await import("@/lib/push-sender");
  return sendPush;
}

/**
 * Background dispatcher for every subscribed user, meant for a scheduler
 * (Vercel Cron invokes with GET, other schedulers may POST). Authenticated by
 * `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron sends itself.
 * Due slots are matched within a window and claimed before sending, so a
 * late or overlapping tick neither drops nor repeats a reminder.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sendPush = await getSendPush();
    const now = new Date();
    const userIds = await getAllSubscribedUserIds();

    let totalSent = 0;
    let totalFollowUps = 0;

    for (const userId of userIds) {
      const { sent, followUps } = await dispatchUserReminders(userId, now, sendPush);
      totalSent += sent;
      totalFollowUps += followUps;
    }

    return NextResponse.json({ sent: totalSent, followUps: totalFollowUps });
  } catch (error) {
    console.error("[push/send] Error:", error);
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;

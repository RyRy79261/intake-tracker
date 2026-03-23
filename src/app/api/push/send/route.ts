import { NextRequest, NextResponse } from "next/server";
import {
  getDueNotifications,
  getFollowUpNotifications,
  logSentNotification,
  deletePushSubscription,
  getSettings,
} from "@/lib/push-db";
// Dynamic import to avoid top-level webpush.setVapidDetails() at build time
async function getSendPush() {
  const { sendPush } = await import("@/lib/push-sender");
  return sendPush;
}

/**
 * Cron-triggered endpoint to send push notifications for due medication doses.
 * Authenticated via CRON_SECRET bearer token (not user auth).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth: CRON_SECRET or LOCAL_AGENT_MODE bypass
  const isLocalAgent =
    process.env.NEXT_PUBLIC_LOCAL_AGENT_MODE === "true" &&
    process.env.NODE_ENV !== "production";

  if (!isLocalAgent) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || token !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const sendPush = await getSendPush();
    const now = new Date();
    const currentTime = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    });
    const today = now.toISOString().split("T")[0]!;
    const dayOfWeek = now.getUTCDay();

    let totalSent = 0;
    let totalFollowUps = 0;

    // --- Initial notifications ---
    const dueRows = await getDueNotifications(currentTime, dayOfWeek, today);

    for (const row of dueRows) {
      const result = await sendPush(
        {
          endpoint: row.endpoint as string,
          keys: {
            p256dh: row.p256dh as string,
            auth: row.auth_key as string,
          },
        },
        JSON.stringify({
          title: `Time for your ${row.time_slot} medications`,
          body: row.medications_json as string,
          tag: `dose-${row.time_slot}`,
          url: "/medications?tab=schedule",
        })
      );

      if (result.success) {
        await logSentNotification(
          row.user_id as string,
          row.time_slot as string,
          today,
          0
        );
        totalSent++;
      } else if (result.statusCode === 410) {
        await deletePushSubscription(row.user_id as string);
      }
    }

    // --- Follow-up reminders ---
    // Collect unique user IDs from due rows for settings lookup
    const userIdMap: Record<string, boolean> = {};
    for (const row of dueRows) {
      userIdMap[row.user_id as string] = true;
    }
    const userIds = Object.keys(userIdMap);

    // Process follow-ups per user based on their settings
    for (const userId of userIds) {
      const settings = await getSettings(userId);
      if (!settings.enabled) continue;

      for (let i = 1; i <= settings.followUpCount; i++) {
        const followUpRows = await getFollowUpNotifications(
          today,
          i,
          settings.followUpIntervalMinutes
        );

        for (const row of followUpRows) {
          if ((row.user_id as string) !== userId) continue;

          const result = await sendPush(
            {
              endpoint: row.endpoint as string,
              keys: {
                p256dh: row.p256dh as string,
                auth: row.auth_key as string,
              },
            },
            JSON.stringify({
              title: `Reminder: your ${row.time_slot} medications`,
              body: row.medications_json as string,
              tag: `dose-${row.time_slot}`,
              url: "/medications?tab=schedule",
            })
          );

          if (result.success) {
            await logSentNotification(
              row.user_id as string,
              row.time_slot as string,
              today,
              i
            );
            totalFollowUps++;
          } else if (result.statusCode === 410) {
            await deletePushSubscription(row.user_id as string);
          }
        }
      }
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

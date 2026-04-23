import { NextRequest, NextResponse } from "next/server";
import {
  getAllSubscribedUserIds,
  getUserTimezone,
  getDueNotificationsForUser,
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
  // Auth: CRON_SECRET bearer token required
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
      const tz = await getUserTimezone(userId);
      const localTime = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: tz,
      });
      const localDay = new Date(
        now.toLocaleString("en-US", { timeZone: tz })
      ).getDay();
      const localToday = now.toLocaleDateString("en-CA", { timeZone: tz });

      // --- Initial notifications ---
      const dueRows = await getDueNotificationsForUser(
        userId,
        localTime,
        localDay,
        localToday
      );

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
          await logSentNotification(userId, row.time_slot as string, localToday, 0);
          totalSent++;
        } else if (result.statusCode === 410) {
          await deletePushSubscription(userId);
        }
      }

      // --- Follow-up reminders ---
      const settings = await getSettings(userId);
      if (!settings.enabled) continue;

      for (let i = 1; i <= settings.followUpCount; i++) {
        const followUpRows = await getFollowUpNotifications(
          localToday,
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
            await logSentNotification(userId, row.time_slot as string, localToday, i);
            totalFollowUps++;
          } else if (result.statusCode === 410) {
            await deletePushSubscription(userId);
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

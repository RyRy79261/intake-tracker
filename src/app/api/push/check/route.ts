import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import {
  getUserTimezone,
  getDueNotificationsForUser,
  getFollowUpNotifications,
  logSentNotification,
  deletePushSubscription,
  getSettings,
} from "@/lib/push-db";

async function getSendPush() {
  const { sendPush } = await import("@/lib/push-sender");
  return sendPush;
}

export const POST = withAuth(async ({ auth }) => {
  try {
    const sendPush = await getSendPush();
    const userId = auth.userId!;
    const now = new Date();

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

    let totalSent = 0;
    let totalFollowUps = 0;

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
    if (settings.enabled) {
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

    if (totalSent === 0 && totalFollowUps === 0) {
      return NextResponse.json({ nothingDue: true });
    }

    return NextResponse.json({ sent: totalSent, followUps: totalFollowUps });
  } catch (error) {
    console.error("[push/check] Error:", error);
    return NextResponse.json(
      { error: "Failed to check notifications" },
      { status: 500 }
    );
  }
});

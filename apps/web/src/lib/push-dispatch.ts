import "server-only";
import {
  getUserTimezone,
  getDueNotificationsForUser,
  getFollowUpNotifications,
  logSentNotification,
  releaseSentNotification,
  deletePushSubscription,
  getSettings,
  getHandledScheduleIds,
} from "@/lib/push-db";

type SendPush = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) => Promise<{ success: boolean; statusCode?: number }>;

type Row = Record<string, unknown>;

/**
 * `push_schedules.medications_json` holds `{ body, scheduleIds }` from current
 * clients and the bare notification body from older ones.
 */
export function decodePushMedications(raw: string): { body: string; scheduleIds: string[] } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { body?: unknown }).body === "string" &&
      Array.isArray((parsed as { scheduleIds?: unknown }).scheduleIds)
    ) {
      const { body, scheduleIds } = parsed as { body: string; scheduleIds: unknown[] };
      return { body, scheduleIds: scheduleIds.filter((id): id is string => typeof id === "string") };
    }
  } catch {
    // Legacy plain-text body.
  }
  return { body: raw, scheduleIds: [] };
}

export interface UserLocalClock {
  localTime: string;
  localDay: number;
  localToday: string;
}

export function userLocalClock(now: Date, tz: string): UserLocalClock {
  return {
    localTime: now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }),
    localDay: new Date(now.toLocaleString("en-US", { timeZone: tz })).getDay(),
    localToday: now.toLocaleDateString("en-CA", { timeZone: tz }),
  };
}

/**
 * Send one user's due reminders and follow-ups. Shared by the cron
 * (/api/push/send) and the foreground ping (/api/push/check).
 *
 * Each slot is claimed in push_sent_log before it is sent, so overlapping
 * dispatchers can't double-send, and a failed send releases its claim for the
 * next tick. A slot whose doses are all already taken or skipped (per the
 * synced dose_logs) is claimed but not sent, which also ends its follow-ups.
 * Initial and follow-up notifications share one tag per slot, the same tag
 * the in-app notifier uses, so they replace each other instead of stacking.
 */
export async function dispatchUserReminders(
  userId: string,
  now: Date,
  sendPush: SendPush,
): Promise<{ sent: number; followUps: number }> {
  const tz = await getUserTimezone(userId);
  const { localTime, localDay, localToday } = userLocalClock(now, tz);

  let sent = 0;
  let followUps = 0;

  const deliver = async (row: Row, followUpIndex: number): Promise<boolean> => {
    const timeSlot = row.time_slot as string;
    const claimed = await logSentNotification(userId, timeSlot, localToday, followUpIndex);
    if (!claimed) return false;

    const { body, scheduleIds } = decodePushMedications(row.medications_json as string);
    if (scheduleIds.length > 0) {
      const handled = await getHandledScheduleIds(userId, localToday, scheduleIds);
      if (scheduleIds.every((id) => handled.has(id))) return false;
    }

    const result = await sendPush(
      {
        endpoint: row.endpoint as string,
        keys: { p256dh: row.p256dh as string, auth: row.auth_key as string },
      },
      JSON.stringify({
        title:
          followUpIndex === 0
            ? `Time for your ${timeSlot} medications`
            : `Reminder: your ${timeSlot} medications`,
        body,
        tag: `dose-${timeSlot}`,
        url: "/medications?tab=schedule",
      }),
    );

    if (result.success) return true;
    if (result.statusCode === 410) {
      await deletePushSubscription(userId);
    } else {
      await releaseSentNotification(userId, timeSlot, localToday, followUpIndex);
    }
    return false;
  };

  const dueRows = await getDueNotificationsForUser(userId, localTime, localDay, localToday);
  for (const row of dueRows) {
    if (await deliver(row, 0)) sent++;
  }

  const settings = await getSettings(userId);
  if (settings.enabled) {
    for (let i = 1; i <= settings.followUpCount; i++) {
      const rows = await getFollowUpNotifications(
        localToday,
        i,
        settings.followUpIntervalMinutes,
        localDay,
        userId,
      );
      for (const row of rows) {
        if ((row.user_id as string) !== userId) continue;
        if (await deliver(row, i)) followUps++;
      }
    }
  }

  return { sent, followUps };
}

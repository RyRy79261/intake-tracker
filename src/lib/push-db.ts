import { neon } from "@neondatabase/serverless";

function getSQL() {
  return neon(process.env.DATABASE_URL!);
}

// ----- Push Subscriptions -----

export async function savePushSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string }; timezone?: string }
): Promise<void> {
  const sql = getSQL();
  const tz = sub.timezone ?? "UTC";
  await sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key, timezone, updated_at)
    VALUES (${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${tz}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      endpoint = EXCLUDED.endpoint,
      p256dh = EXCLUDED.p256dh,
      auth_key = EXCLUDED.auth_key,
      timezone = EXCLUDED.timezone,
      updated_at = NOW()
  `;
}

export async function deletePushSubscription(userId: string): Promise<void> {
  const sql = getSQL();
  await sql`DELETE FROM push_subscriptions WHERE user_id = ${userId}`;
}

// ----- Due Notifications -----

/**
 * Get subscriptions that have a dose schedule matching the current time slot
 * and haven't already been sent the initial notification today.
 */
export async function getDueNotifications(
  currentTime: string,
  dayOfWeek: number,
  today: string
) {
  const sql = getSQL();
  return sql`
    SELECT
      s.user_id,
      s.endpoint,
      s.p256dh,
      s.auth_key,
      d.time_slot,
      d.medications_json
    FROM push_subscriptions s
    JOIN push_schedules d ON d.user_id = s.user_id
    JOIN push_settings ps ON ps.user_id = s.user_id
    WHERE d.time_slot = ${currentTime}
      AND d.day_of_week = ${dayOfWeek}
      AND ps.enabled = true
      AND NOT EXISTS (
        SELECT 1 FROM push_sent_log l
        WHERE l.user_id = s.user_id
          AND l.time_slot = d.time_slot
          AND l.sent_date = ${today}
          AND l.follow_up_index = 0
      )
  `;
}

// ----- Follow-up Notifications -----

/**
 * Get subscriptions that need a follow-up notification.
 * Finds users who received the previous follow-up (followUpIndex-1) at least
 * intervalMinutes ago but haven't received the current follow-up yet.
 */
export async function getFollowUpNotifications(
  today: string,
  followUpIndex: number,
  intervalMinutes: number
) {
  const sql = getSQL();
  return sql`
    SELECT
      s.user_id,
      s.endpoint,
      s.p256dh,
      s.auth_key,
      l.time_slot,
      d.medications_json
    FROM push_sent_log l
    JOIN push_subscriptions s ON s.user_id = l.user_id
    JOIN push_schedules d ON d.user_id = l.user_id AND d.time_slot = l.time_slot
    JOIN push_settings ps ON ps.user_id = l.user_id
    WHERE l.sent_date = ${today}
      AND l.follow_up_index = ${followUpIndex - 1}
      AND l.sent_at <= NOW() - (${intervalMinutes} || ' minutes')::INTERVAL
      AND ps.enabled = true
      AND NOT EXISTS (
        SELECT 1 FROM push_sent_log l2
        WHERE l2.user_id = l.user_id
          AND l2.time_slot = l.time_slot
          AND l2.sent_date = ${today}
          AND l2.follow_up_index = ${followUpIndex}
      )
  `;
}

// ----- Sent Log -----

export async function logSentNotification(
  userId: string,
  timeSlot: string,
  sentDate: string,
  followUpIndex: number
): Promise<void> {
  const sql = getSQL();
  await sql`
    INSERT INTO push_sent_log (user_id, time_slot, sent_date, follow_up_index)
    VALUES (${userId}, ${timeSlot}, ${sentDate}, ${followUpIndex})
    ON CONFLICT (user_id, time_slot, sent_date, follow_up_index) DO NOTHING
  `;
}

// ----- Dose Schedules -----

/**
 * Sync all dose schedules for a user.
 * Deletes existing schedules and inserts the new set.
 */
export async function syncDoseSchedules(
  userId: string,
  schedules: Array<{
    timeSlot: string;
    dayOfWeek: number;
    medicationsJson: string;
  }>
): Promise<void> {
  const sql = getSQL();
  await sql`DELETE FROM push_schedules WHERE user_id = ${userId}`;

  for (const schedule of schedules) {
    await sql`
      INSERT INTO push_schedules (user_id, time_slot, day_of_week, medications_json)
      VALUES (${userId}, ${schedule.timeSlot}, ${schedule.dayOfWeek}, ${schedule.medicationsJson})
    `;
  }
}

// ----- Settings -----

export interface PushSettings {
  enabled: boolean;
  followUpCount: number;
  followUpIntervalMinutes: number;
  dayStartHour: number;
}

const DEFAULT_SETTINGS: PushSettings = {
  enabled: true,
  followUpCount: 2,
  followUpIntervalMinutes: 10,
  dayStartHour: 2,
};

export async function getSettings(userId: string): Promise<PushSettings> {
  const sql = getSQL();
  const rows = await sql`
    SELECT enabled, follow_up_count, follow_up_interval_minutes, day_start_hour
    FROM push_settings
    WHERE user_id = ${userId}
  `;

  if (rows.length === 0) return DEFAULT_SETTINGS;

  const row = rows[0]!;
  return {
    enabled: row.enabled as boolean,
    followUpCount: row.follow_up_count as number,
    followUpIntervalMinutes: row.follow_up_interval_minutes as number,
    dayStartHour: row.day_start_hour as number,
  };
}

export async function saveSettings(
  userId: string,
  settings: PushSettings
): Promise<void> {
  const sql = getSQL();
  await sql`
    INSERT INTO push_settings (user_id, enabled, follow_up_count, follow_up_interval_minutes, day_start_hour)
    VALUES (${userId}, ${settings.enabled}, ${settings.followUpCount}, ${settings.followUpIntervalMinutes}, ${settings.dayStartHour})
    ON CONFLICT (user_id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      follow_up_count = EXCLUDED.follow_up_count,
      follow_up_interval_minutes = EXCLUDED.follow_up_interval_minutes,
      day_start_hour = EXCLUDED.day_start_hour
  `;
}

// ----- Timezone -----

export async function updateTimezone(
  userId: string,
  timezone: string
): Promise<void> {
  const sql = getSQL();
  await sql`
    UPDATE push_subscriptions
    SET timezone = ${timezone}, updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}

export async function getUserTimezone(userId: string): Promise<string> {
  const sql = getSQL();
  const rows = await sql`
    SELECT timezone FROM push_subscriptions WHERE user_id = ${userId}
  `;
  if (rows.length === 0) return "UTC";
  return (rows[0]!.timezone as string) ?? "UTC";
}

// ----- Per-user due notifications -----

export async function getDueNotificationsForUser(
  userId: string,
  userLocalTime: string,
  dayOfWeek: number,
  today: string
) {
  const sql = getSQL();
  return sql`
    SELECT
      s.user_id,
      s.endpoint,
      s.p256dh,
      s.auth_key,
      d.time_slot,
      d.medications_json
    FROM push_subscriptions s
    JOIN push_schedules d ON d.user_id = s.user_id
    JOIN push_settings ps ON ps.user_id = s.user_id
    WHERE s.user_id = ${userId}
      AND d.time_slot = ${userLocalTime}
      AND d.day_of_week = ${dayOfWeek}
      AND ps.enabled = true
      AND NOT EXISTS (
        SELECT 1 FROM push_sent_log l
        WHERE l.user_id = s.user_id
          AND l.time_slot = d.time_slot
          AND l.sent_date = ${today}
          AND l.follow_up_index = 0
      )
  `;
}

// ----- All subscribed user IDs -----

export async function getAllSubscribedUserIds(): Promise<string[]> {
  const sql = getSQL();
  const rows = await sql`
    SELECT s.user_id
    FROM push_subscriptions s
    JOIN push_settings ps ON ps.user_id = s.user_id
    WHERE ps.enabled = true
  `;
  return rows.map((r) => r.user_id as string);
}

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  loadReminderDoses,
  buildReminderOccurrences,
  loadHandledSlots,
} from "@/lib/medication-reminder-builder";
import { getDeviceTimezone } from "@/lib/timezone";
import { useSettingsStore } from "@/stores/settings-store";

/**
 * How far ahead one-shot reminders are scheduled. Every resync (app start,
 * resume, any regimen or dose-log change) rolls the window forward.
 */
export const NATIVE_REMINDER_HORIZON_DAYS = 14;

/** Android caps an app at 500 pending alarms; stay well below it. */
const MAX_PENDING_NOTIFICATIONS = 400;

const NATIVE_REMINDERS_KEY = "intake-tracker-native-dose-reminders";

/**
 * Native reminders are on unless the user switched them off. They predate the
 * Dose Reminders toggle (which defaults to off for web push), so reading that
 * setting here would silently stop reminders for existing Android users.
 */
export function getNativeRemindersEnabled(): boolean {
  try {
    return localStorage.getItem(NATIVE_REMINDERS_KEY) !== "off";
  } catch {
    return true;
  }
}

export async function setNativeRemindersEnabled(enabled: boolean): Promise<void> {
  try {
    localStorage.setItem(NATIVE_REMINDERS_KEY, enabled ? "on" : "off");
  } catch {
    // Storage blocked — the sync below still applies the choice this session.
  }
  await syncMedicationNotifications();
}

export async function initLocalNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const permResult = await LocalNotifications.requestPermissions();
  if (permResult.display !== "granted") {
    console.error("[local-notifications] Permission denied");
    return;
  }

  await syncMedicationNotifications();
}

/**
 * Stable, positive 31-bit notification id for one reminder. Re-deriving the
 * same id on every sync lets a resync replace a reminder in place and cancel
 * exactly the ids that are no longer wanted.
 */
export function reminderNotificationId(scheduleId: string, dateKey: string, followUpIndex: number): number {
  const input = `${scheduleId}|${dateKey}|${followUpIndex}`;
  // FNV-1a
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Keep clear of 0 and of the small sequential ids older builds used.
  return ((hash >>> 1) % 0x7fff0000) + 0x10000;
}

interface NativeNotification {
  id: number;
  title: string;
  body: string;
  isExactNotification: boolean;
  schedule: { at: Date; allowWhileIdle: boolean };
}

async function buildNotifications(now: number): Promise<NativeNotification[]> {
  const doses = await loadReminderDoses();
  const occurrences = buildReminderOccurrences(doses, {
    from: now,
    days: NATIVE_REMINDER_HORIZON_DAYS,
    deviceTz: getDeviceTimezone(),
  });
  const handled = await loadHandledSlots(occurrences);

  const { reminderFollowUpCount, reminderFollowUpInterval } = useSettingsStore.getState();
  const followUps = Math.max(0, reminderFollowUpCount);
  const intervalMs = Math.max(1, reminderFollowUpInterval) * 60_000;

  const notifications: NativeNotification[] = [];
  for (const o of occurrences) {
    if (handled.has(`${o.dose.scheduleId}|${o.dateKey}`)) continue;
    const { genericName, dosageText } = o.dose;
    for (let i = 0; i <= followUps; i++) {
      const at = o.at + i * intervalMs;
      if (at < now) continue;
      notifications.push({
        id: reminderNotificationId(o.dose.scheduleId, o.dateKey, i),
        title: i === 0 ? `Time for ${genericName}` : `Reminder: ${genericName}`,
        body: `Take ${dosageText} of ${genericName}`,
        // @capacitor/local-notifications 8.3.0 added `isExactNotification`,
        // defaulting to TRUE. On API 31+ that makes schedule() open the system
        // "Alarms & reminders" screen whenever SCHEDULE_EXACT_ALARM is not
        // granted — and we target SDK 36, where it is not granted by default.
        // Since syncs run on every cold start, the default would throw the
        // user out to system settings every launch. false keeps an inexact
        // setAndAllowWhileIdle alarm, scheduled silently.
        isExactNotification: false,
        // One-shot `at` alarms, not perpetual `on` ones: the plugin re-arms a
        // fired `on` alarm with a non-wakeup RTC alarm that Doze defers, while
        // every `at` is armed with setAndAllowWhileIdle(RTC_WAKEUP). `at` is
        // an absolute instant, so the device's timezone can't shift it.
        schedule: { at: new Date(at), allowWhileIdle: true },
      });
    }
  }

  notifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  return notifications.slice(0, MAX_PENDING_NOTIFICATIONS);
}

async function runSync(): Promise<void> {
  const pending = await LocalNotifications.getPending();

  const wanted = getNativeRemindersEnabled() ? await buildNotifications(Date.now()) : [];
  const wantedIds = new Set(wanted.map((n) => n.id));

  const stale = pending.notifications.filter((n) => !wantedIds.has(n.id));
  if (stale.length > 0) {
    await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });
  }

  if (wanted.length > 0) {
    await LocalNotifications.schedule({ notifications: wanted });
  }
}

let syncChain: Promise<void> = Promise.resolve();

/**
 * Rebuild the device's medication reminders from the current regimen.
 * Calls are serialized: two overlapping runs would each read the pending
 * list before the other scheduled, and could leave stale reminders behind.
 */
export function syncMedicationNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  const run = syncChain.then(runSync);
  syncChain = run.catch((error) => {
    console.error("[local-notifications] Sync failed:", error);
  });
  return run;
}

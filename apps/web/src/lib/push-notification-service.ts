/**
 * Push notification service: permission, local notifications and web push.
 * Uses the browser's Notification API for local notifications.
 */

import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { apiFetch } from "@/lib/api-fetch";

export type NotificationPermissionState = "granted" | "denied" | "default";

/**
 * Check if notifications are supported
 */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission as NotificationPermissionState;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<ServiceResult<NotificationPermissionState>> {
  if (!isNotificationSupported()) {
    return ok("denied" as NotificationPermissionState);
  }

  try {
    const permission = await Notification.requestPermission();
    return ok(permission as NotificationPermissionState);
  } catch (error) {
    return err("Failed to request notification permission", error);
  }
}

/**
 * Show a local notification using Service Worker (for PWA) or fallback to Notification API
 * 
 * Note: SVG icons don't work well on mobile. For best results, use PNG icons.
 * The badge (small status bar icon) is omitted as it requires a specific monochrome PNG format.
 */
export async function showNotification(
  title: string,
  options?: NotificationOptions
): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== "granted") {
    return false;
  }

  // Note: badge is intentionally omitted - Android requires a specific monochrome PNG
  // and SVG badges often render as white circles. The system will use app icon instead.
  const notificationOptions: NotificationOptions = {
    icon: "/icons/icon-192.svg",
    ...options,
  };

  // Try Service Worker notification first (required for PWAs on mobile)
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, notificationOptions);
      return true;
    } catch (swError) {
      console.warn("Service Worker notification failed, falling back:", swError);
      // Fall through to try direct Notification API
    }
  }

  // Fallback to direct Notification API (works on desktop browsers)
  try {
    new Notification(title, notificationOptions);
    return true;
  } catch (error) {
    console.error("Failed to show notification:", error);
    return false;
  }
}

/**
 * Send a test notification
 */
export async function sendTestNotification(): Promise<boolean> {
  return showNotification("Test Notification", {
    body: "Notifications are working correctly!",
    tag: "test-notification",
  });
}

// Storage key for notification settings
const NOTIFICATION_SETTINGS_KEY = "intake-tracker-notifications";

export interface NotificationSettings {
  enabled: boolean;
  lastCheck: number | null;
  checkIntervalHours: number;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  lastCheck: null,
  checkIntervalHours: 24,
};

/**
 * Get notification settings from localStorage
 */
export function getNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  
  try {
    const stored = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  
  return DEFAULT_SETTINGS;
}

/**
 * Save notification settings to localStorage
 */
export function saveNotificationSettings(settings: Partial<NotificationSettings>): void {
  if (typeof window === "undefined") return;
  
  const current = getNotificationSettings();
  const updated = { ...current, ...settings };
  
  try {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

// ----- Push Subscription Management -----

/**
 * Convert a VAPID public key from URL-safe base64 to Uint8Array
 * (required by PushManager.subscribe applicationServerKey)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Register for push notifications via PushManager and sync subscription to server.
 * Re-sends existing subscriptions in case the server lost them.
 *
 * Auth note: cookie session (set by Neon Auth, read by withAuth() server-side)
 * is attached automatically on same-origin fetch — no Bearer token needed.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ) as BufferSource,
      });
    }

    const subJson = subscription.toJSON();
    await apiFetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
        },
        // Without it the server would fall back to UTC and compare UTC wall
        // time against local-time slots.
        timezone: currentTimezone(),
      }),
    });

    return subscription;
  } catch (error) {
    console.error("[push] Failed to subscribe:", error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications and notify the server.
 *
 * Auth note: cookie session is attached automatically on same-origin fetch.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }
    }

    await apiFetch("/api/push/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    return true;
  } catch (error) {
    console.error("[push] Failed to unsubscribe:", error);
    return false;
  }
}

// ----- Push Schedule Sync -----

function currentTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

let lastPushScheduleHash = "";

async function hasPushSubscription(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  if (typeof window === "undefined" || !("PushManager" in window)) return false;
  try {
    // Not `ready`: it never settles when no worker is registered (dev, or
    // a browser that dropped it), and the reminder resync calls this often.
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    return (await registration.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

/**
 * Send the full weekly reminder schedule, and this device's timezone, to the
 * push server. Built from the whole regimen per weekday (not today's slots)
 * and sent even when empty, so stopping the last medication clears the
 * server's reminders. Skipped when nothing changed since the last send;
 * `force` resends regardless (after a (re)subscribe the server row is new).
 */
export async function syncPushSchedule(opts: { force?: boolean } = {}): Promise<void> {
  const { useSettingsStore } = await import("@/stores/settings-store");
  if (!useSettingsStore.getState().doseRemindersEnabled) return;
  if (!(await hasPushSubscription())) return;

  const { loadReminderDoses, buildWeeklyPushEntries } = await import(
    "@/lib/medication-reminder-builder"
  );
  const timezone = currentTimezone();
  const schedules = buildWeeklyPushEntries(await loadReminderDoses(), timezone);

  // The timezone is part of the hash: an in-session "Adjust schedules" keeps
  // the local slots identical but must still update the server's zone.
  const hash = JSON.stringify({ schedules, timezone });
  if (!opts.force && hash === lastPushScheduleHash) return;

  try {
    const res = await apiFetch("/api/push/sync-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedules, timezone }),
    });
    if (res.ok) lastPushScheduleHash = hash;
  } catch (error) {
    console.warn("[push-schedule-sync] Failed to sync schedule:", error);
  }
}

/** Test-only: forget the last-sent hash. */
export function resetPushScheduleSyncState(): void {
  lastPushScheduleHash = "";
}

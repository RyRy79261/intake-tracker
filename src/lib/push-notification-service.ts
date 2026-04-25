/**
 * Push notification service for retention expiry alerts.
 * Uses the browser's Notification API for local notifications.
 */

import { db } from "./db";
import { ok, err, type ServiceResult } from "./service-result";
import { apiUrl } from "./api-url";

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
 * Check for records expiring soon
 */
export interface ExpiringRecordsInfo {
  totalExpiring: number;
  intakeExpiring: number;
  weightExpiring: number;
  bpExpiring: number;
  oldestExpiringDate: Date | null;
}

export async function checkExpiringRecords(
  retentionDays: number,
  warningDays: number = 7
): Promise<ExpiringRecordsInfo> {
  const now = Date.now();
  const cutoffTime = now - retentionDays * 24 * 60 * 60 * 1000;
  const warningTime = now - (retentionDays - warningDays) * 24 * 60 * 60 * 1000;

  // Get records that are approaching expiration (within warning window)
  const [intakeRecords, weightRecords, bpRecords] = await Promise.all([
    db.intakeRecords.filter((r) => r.timestamp < warningTime && r.timestamp >= cutoffTime).toArray(),
    db.weightRecords.filter((r) => r.timestamp < warningTime && r.timestamp >= cutoffTime).toArray(),
    db.bloodPressureRecords.filter((r) => r.timestamp < warningTime && r.timestamp >= cutoffTime).toArray(),
  ]);

  const allTimestamps = [
    ...intakeRecords.map((r) => r.timestamp),
    ...weightRecords.map((r) => r.timestamp),
    ...bpRecords.map((r) => r.timestamp),
  ];

  return {
    totalExpiring: allTimestamps.length,
    intakeExpiring: intakeRecords.length,
    weightExpiring: weightRecords.length,
    bpExpiring: bpRecords.length,
    oldestExpiringDate: allTimestamps.length > 0 ? new Date(Math.min(...allTimestamps)) : null,
  };
}

/**
 * Notify user about expiring records
 */
export async function notifyExpiringRecords(
  retentionDays: number,
  warningDays: number = 7
): Promise<boolean> {
  if (getNotificationPermission() !== "granted") {
    return false;
  }

  const info = await checkExpiringRecords(retentionDays, warningDays);

  if (info.totalExpiring === 0) {
    return false;
  }

  const daysUntilExpiry = info.oldestExpiringDate
    ? Math.ceil((info.oldestExpiringDate.getTime() + retentionDays * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000))
    : warningDays;

  const sent = await showNotification("Records Expiring Soon", {
    body: `${info.totalExpiring} records will be deleted in ${daysUntilExpiry} days. Export your data to save them.`,
    tag: "expiry-reminder",
    requireInteraction: false,
  });

  return sent;
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

/**
 * Check if it's time to run the expiry notification check
 */
export function shouldCheckExpiry(): boolean {
  const settings = getNotificationSettings();
  
  if (!settings.enabled) return false;
  if (!settings.lastCheck) return true;
  
  const hoursSinceLastCheck = (Date.now() - settings.lastCheck) / (1000 * 60 * 60);
  return hoursSinceLastCheck >= settings.checkIntervalHours;
}

/**
 * Run the expiry check and update last check time
 */
export async function runExpiryCheck(retentionDays: number): Promise<boolean> {
  if (!shouldCheckExpiry()) return false;

  saveNotificationSettings({ lastCheck: Date.now() });

  return notifyExpiringRecords(retentionDays);
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
 */
export async function subscribeToPush(
  authToken: string
): Promise<PushSubscription | null> {
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
    await fetch(apiUrl("/api/push/subscribe"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
        },
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
 */
export async function unsubscribeFromPush(
  authToken: string
): Promise<boolean> {
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }
    }

    await fetch(apiUrl("/api/push/unsubscribe"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

    return true;
  } catch (error) {
    console.error("[push] Failed to unsubscribe:", error);
    return false;
  }
}

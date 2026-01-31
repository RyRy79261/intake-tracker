/**
 * Push notification service for retention expiry alerts.
 * Uses the browser's Notification API for local notifications.
 */

import { db } from "./db";

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
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) {
    return "denied";
  }

  try {
    const permission = await Notification.requestPermission();
    return permission as NotificationPermissionState;
  } catch (error) {
    console.error("Failed to request notification permission:", error);
    return "denied";
  }
}

/**
 * Show a local notification
 */
export function showNotification(
  title: string,
  options?: NotificationOptions
): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== "granted") {
    return null;
  }

  try {
    return new Notification(title, {
      icon: "/icons/icon-192.svg",
      badge: "/icons/icon-192.svg",
      ...options,
    });
  } catch (error) {
    console.error("Failed to show notification:", error);
    return null;
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

  showNotification("Records Expiring Soon", {
    body: `${info.totalExpiring} records will be deleted in ${daysUntilExpiry} days. Export your data to save them.`,
    tag: "expiry-reminder",
    requireInteraction: false,
  });

  return true;
}

/**
 * Send a test notification
 */
export function sendTestNotification(): boolean {
  const notification = showNotification("Test Notification", {
    body: "Notifications are working correctly!",
    tag: "test-notification",
  });

  return notification !== null;
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

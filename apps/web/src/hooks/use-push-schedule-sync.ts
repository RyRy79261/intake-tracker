"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { useSettingsStore } from "@/stores/settings-store";
import { apiFetch } from "@/lib/api-fetch";
import { useAuth } from "@/components/auth-guard";
import {
  subscribeToPush,
  unsubscribeFromPush,
  requestNotificationPermission,
  isNotificationSupported,
  syncPushSchedule,
} from "@/lib/push-notification-service";

// Auth note: all push endpoints run under withAuth() on the server (see
// plan 41-01). Since Neon Auth uses cookie sessions, same-origin fetch
// carries the credential automatically — no Bearer token plumbing.

/**
 * Hook that syncs dose schedule to server when push reminders are enabled.
 * The schedule itself is built and sent by `syncPushSchedule()`, which the
 * app-wide reminder resync (medication-notification-resync) also calls on
 * every regimen change; this hook adds a sync on mount/sign-in, the
 * foreground /api/push/check ping and the follow-up settings sync.
 * No-ops when the user is not signed in (push subscriptions require auth).
 */
export function usePushScheduleSync(): void {
  const doseRemindersEnabled = useSettingsStore((s) => s.doseRemindersEnabled);
  const followUpCount = useSettingsStore((s) => s.reminderFollowUpCount);
  const followUpInterval = useSettingsStore((s) => s.reminderFollowUpInterval);
  const dayStartHour = useSettingsStore((s) => s.dayStartHour);
  const { authenticated } = useAuth();

  const lastSettingsHashRef = useRef<string>("");

  useEffect(() => {
    if (!authenticated) return;
    if (!doseRemindersEnabled) return;
    void syncPushSchedule();
  }, [authenticated, doseRemindersEnabled]);

  // Periodic ping to /api/push/check every 60s
  useEffect(() => {
    if (!doseRemindersEnabled) return;

    const ping = () => {
      apiFetch("/api/push/check", { method: "POST" }).catch((err) =>
        console.warn("[push/check] ping failed:", err)
      );
    };

    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, [doseRemindersEnabled]);

  // Sync follow-up settings and the day-start hour (the server's day
  // boundary, e.g. the MCP today summary) when they change.
  useEffect(() => {
    if (!doseRemindersEnabled) return;

    const hash = JSON.stringify({ followUpCount, followUpInterval, dayStartHour });
    if (hash === lastSettingsHashRef.current) return;
    lastSettingsHashRef.current = hash;

    apiFetch("/api/push/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        followUpCount,
        followUpIntervalMinutes: followUpInterval,
        dayStartHour,
      }),
    }).catch((err) =>
      console.warn("[push/settings] sync failed:", err)
    );
  }, [doseRemindersEnabled, followUpCount, followUpInterval, dayStartHour]);
}

/**
 * Hook that provides a toggle handler for dose reminders.
 * Wraps push subscription/unsubscription logic so components
 * don't need to import service files directly.
 *
 * Platform-aware: in the native app reminders are device-local
 * (Capacitor LocalNotifications) and don't need web push, which Android
 * System WebView doesn't expose anyway. There the toggle drives the native
 * reminders, and switching it off cancels every pending one.
 */
export function useDoseReminderToggle() {
  const setDoseRemindersEnabled = useSettingsStore((s) => s.setDoseRemindersEnabled);
  const webEnabled = useSettingsStore((s) => s.doseRemindersEnabled);
  const [toggling, setToggling] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const [nativeEnabled, setNativeEnabled] = useState(true);
  const supported = isNative || (typeof window !== "undefined" && isNotificationSupported());

  useEffect(() => {
    if (!isNative) return;
    void import("@/lib/local-notifications").then((m) =>
      setNativeEnabled(m.getNativeRemindersEnabled()),
    );
  }, [isNative]);

  const handleToggle = useCallback(async (enabled: boolean) => {
    setToggling(true);
    try {
      if (isNative) {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const { setNativeRemindersEnabled } = await import("@/lib/local-notifications");
        if (enabled) {
          const perm = await LocalNotifications.requestPermissions();
          if (perm.display !== "granted") return;
        }
        await setNativeRemindersEnabled(enabled);
        setNativeEnabled(enabled);
        return;
      }

      if (enabled) {
        const permResult = await requestNotificationPermission();
        if (!permResult.success || permResult.data !== "granted") {
          return;
        }
        const subscription = await subscribeToPush();
        if (!subscription) {
          console.warn("[dose-reminders] Push subscription failed");
          return;
        }
        setDoseRemindersEnabled(true);
        // The (re)created server row has no schedule yet, and the last-sent
        // hash may still match from before the unsubscribe: force a resend.
        await syncPushSchedule({ force: true });
      } else {
        await unsubscribeFromPush();
        setDoseRemindersEnabled(false);
      }
    } catch (error) {
      console.error("[dose-reminders] Toggle failed:", error);
    } finally {
      setToggling(false);
    }
  }, [isNative, setDoseRemindersEnabled]);

  return {
    handleToggle,
    toggling,
    supported,
    isNative,
    enabled: isNative ? nativeEnabled : webEnabled,
  };
}

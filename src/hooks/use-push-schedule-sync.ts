"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useDailyDoseSchedule } from "@/hooks/use-medication-queries";
import { useAuth } from "@/components/auth-guard";
import { useRequireAuth } from "@/components/auth-required-dialog";
import {
  subscribeToPush,
  unsubscribeFromPush,
  requestNotificationPermission,
  isNotificationSupported,
} from "@/lib/push-notification-service";

function getTodayDateStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface ScheduleEntry {
  timeSlot: string;
  dayOfWeek: number;
  medicationsJson: string;
}

/**
 * Build schedule entries from DoseSlot array.
 * Groups by localTime and expands daysOfWeek into individual entries.
 */
function buildScheduleEntries(
  slots: Array<{
    localTime: string;
    prescription: { genericName: string };
    dosageMg: number;
    unit: string;
    schedule: { daysOfWeek?: number[] };
  }>
): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];
  const byTime = new Map<string, typeof slots>();

  for (const slot of slots) {
    const existing = byTime.get(slot.localTime);
    if (existing) {
      existing.push(slot);
    } else {
      byTime.set(slot.localTime, [slot]);
    }
  }

  byTime.forEach((timeSlots, timeSlot) => {
    const medicationsJson = timeSlots
      .map((s) => `${s.prescription.genericName} ${s.dosageMg}${s.unit}`)
      .join(", ");

    // Collect unique days from all schedules at this time
    const daysSet = new Set<number>();
    for (const s of timeSlots) {
      if (s.schedule.daysOfWeek) {
        for (const d of s.schedule.daysOfWeek) {
          daysSet.add(d);
        }
      }
    }

    // If no daysOfWeek specified, assume all 7 days
    const days = daysSet.size > 0 ? Array.from(daysSet) : [0, 1, 2, 3, 4, 5, 6];

    for (const dayOfWeek of days) {
      entries.push({ timeSlot, dayOfWeek, medicationsJson });
    }
  });

  return entries;
}

/**
 * Hook that syncs dose schedule to server when push reminders are enabled.
 * Runs on mount and when schedule data changes. Debounced via schedule hash.
 * No-ops when the user is not signed in (push subscriptions require auth).
 */
export function usePushScheduleSync(): void {
  const doseRemindersEnabled = useSettingsStore((s) => s.doseRemindersEnabled);
  const followUpCount = useSettingsStore((s) => s.reminderFollowUpCount);
  const followUpInterval = useSettingsStore((s) => s.reminderFollowUpInterval);
  const { authenticated, getAuthHeader } = useAuth();

  const todayStr = getTodayDateStr();
  const slots = useDailyDoseSchedule(todayStr);

  const lastHashRef = useRef<string>("");

  const syncSchedule = useCallback(async (entries: ScheduleEntry[]) => {
    try {
      const authHeaders = await getAuthHeader();
      await fetch("/api/push/sync-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ schedules: entries }),
      });
    } catch (error) {
      console.warn("[push-schedule-sync] Failed to sync schedule:", error);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    if (!authenticated) return;
    if (!doseRemindersEnabled) return;
    if (!slots || slots.length === 0) return;

    const entries = buildScheduleEntries(slots);

    // Debounce: only sync if schedule actually changed
    const hash = JSON.stringify({ entries, followUpCount, followUpInterval });
    if (hash === lastHashRef.current) return;
    lastHashRef.current = hash;

    syncSchedule(entries);
  }, [authenticated, slots, doseRemindersEnabled, followUpCount, followUpInterval, syncSchedule]);
}

/**
 * Hook that provides a toggle handler for dose reminders.
 * Wraps push subscription/unsubscription logic so components
 * don't need to import service files directly.
 */
export function useDoseReminderToggle() {
  const setDoseRemindersEnabled = useSettingsStore((s) => s.setDoseRemindersEnabled);
  const [toggling, setToggling] = useState(false);
  const supported = typeof window !== "undefined" && isNotificationSupported();
  const { getAccessToken } = useAuth();
  const { requireAuth } = useRequireAuth();

  const handleToggle = useCallback(async (enabled: boolean) => {
    setToggling(true);
    try {
      if (enabled) {
        // Push subscriptions are stored server-side keyed by Privy user ID.
        const ok = await requireAuth("push");
        if (!ok) return;

        const permResult = await requestNotificationPermission();
        if (!permResult.success || permResult.data !== "granted") {
          return;
        }
        const token = (await getAccessToken()) ?? "";
        const subscription = await subscribeToPush(token);
        if (!subscription) {
          console.warn("[dose-reminders] Push subscription failed");
          return;
        }
        setDoseRemindersEnabled(true);
      } else {
        // Disable: always perform the browser-side unsubscribe so reminders
        // actually stop on this device. If we have a token, also tell the
        // server; otherwise skip the server call (a stale row will be cleaned
        // up by /api/push/send when the dead endpoint 410s).
        const token = await getAccessToken();
        let unsubscribed = false;
        if (token) {
          unsubscribed = await unsubscribeFromPush(token);
        } else if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) await sub.unsubscribe();
            unsubscribed = true;
          } catch {
            unsubscribed = false;
          }
        }
        if (unsubscribed) {
          setDoseRemindersEnabled(false);
        }
      }
    } catch (error) {
      console.error("[dose-reminders] Toggle failed:", error);
    } finally {
      setToggling(false);
    }
  }, [setDoseRemindersEnabled, requireAuth, getAccessToken]);

  return { handleToggle, toggling, supported };
}

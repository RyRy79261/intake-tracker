"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useDailyDoseSchedule } from "@/hooks/use-medication-queries";
import {
  subscribeToPush,
  unsubscribeFromPush,
  requestNotificationPermission,
  isNotificationSupported,
} from "@/lib/push-notification-service";
import { apiUrl } from "@/lib/api-url";

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
 *
 * @param getAuthToken - Optional function to get auth token (e.g., from usePrivy)
 */
export function usePushScheduleSync(getAuthToken?: () => Promise<string | null>): void {
  const doseRemindersEnabled = useSettingsStore((s) => s.doseRemindersEnabled);
  const followUpCount = useSettingsStore((s) => s.reminderFollowUpCount);
  const followUpInterval = useSettingsStore((s) => s.reminderFollowUpInterval);

  const todayStr = getTodayDateStr();
  const slots = useDailyDoseSchedule(todayStr);

  const lastHashRef = useRef<string>("");
  const getAuthTokenRef = useRef(getAuthToken);
  getAuthTokenRef.current = getAuthToken;

  const syncSchedule = useCallback(async (entries: ScheduleEntry[]) => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add auth token if available
      if (getAuthTokenRef.current) {
        try {
          const token = await getAuthTokenRef.current();
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }
        } catch {
          // Auth not available -- continue without token (server falls back to dev user if Privy not configured)
        }
      }

      await fetch(apiUrl("/api/push/sync-schedule"), {
        method: "POST",
        headers,
        body: JSON.stringify({ schedules: entries }),
      });
    } catch (error) {
      console.warn("[push-schedule-sync] Failed to sync schedule:", error);
    }
  }, []);

  useEffect(() => {
    if (!doseRemindersEnabled) return;
    if (!slots || slots.length === 0) return;

    const entries = buildScheduleEntries(slots);

    // Debounce: only sync if schedule actually changed
    const hash = JSON.stringify({ entries, followUpCount, followUpInterval });
    if (hash === lastHashRef.current) return;
    lastHashRef.current = hash;

    syncSchedule(entries);
  }, [slots, doseRemindersEnabled, followUpCount, followUpInterval, syncSchedule]);
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

  const handleToggle = useCallback(async (enabled: boolean) => {
    setToggling(true);
    try {
      if (enabled) {
        const permResult = await requestNotificationPermission();
        if (!permResult.success || permResult.data !== "granted") {
          return;
        }
        const subscription = await subscribeToPush("");
        if (!subscription) {
          console.warn("[dose-reminders] Push subscription failed");
          return;
        }
        setDoseRemindersEnabled(true);
      } else {
        await unsubscribeFromPush("");
        setDoseRemindersEnabled(false);
      }
    } catch (error) {
      console.error("[dose-reminders] Toggle failed:", error);
    } finally {
      setToggling(false);
    }
  }, [setDoseRemindersEnabled]);

  return { handleToggle, toggling, supported };
}

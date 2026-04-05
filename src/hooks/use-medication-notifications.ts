"use client";

import { useEffect } from "react";
import {
  startMedicationNotifications,
  stopMedicationNotifications,
} from "@/lib/medication-notification-service";
import { usePushScheduleSync } from "./use-push-schedule-sync";

/**
 * Hook that starts medication notifications on mount
 * and stops them on unmount. Also syncs dose schedule
 * to the server for push notification delivery.
 */
export function useMedicationNotifications() {
  // Sync dose schedule to server when push reminders are enabled
  usePushScheduleSync();

  useEffect(() => {
    startMedicationNotifications();
    return () => stopMedicationNotifications();
  }, []);
}

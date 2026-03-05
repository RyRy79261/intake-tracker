"use client";

import { useEffect } from "react";
import {
  startMedicationNotifications,
  stopMedicationNotifications,
} from "@/lib/medication-notification-service";

/**
 * Hook that starts medication notifications on mount
 * and stops them on unmount.
 */
export function useMedicationNotifications() {
  useEffect(() => {
    startMedicationNotifications();
    return () => stopMedicationNotifications();
  }, []);
}

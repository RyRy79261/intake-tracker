"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/db";
import { getDeviceTimezone, clearTimezoneCache } from "@/lib/timezone";
import { recalculateScheduleTimezones } from "@/lib/timezone-recalculation-service";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Session-level dismissal flag (D-07)
// Resets naturally on page reload / app restart.
// ---------------------------------------------------------------------------

let _dismissedThisSession = false;

/**
 * Reset the session dismissal flag. Exported for testing only.
 * @internal
 */
export function _resetDismissedFlag(): void {
  _dismissedThisSession = false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimezoneCityName(iana: string): string {
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TimezoneChangeState {
  dialogOpen: boolean;
  oldTimezone: string;
  newTimezone: string;
  isRecalculating: boolean;
  handleConfirm: () => Promise<void>;
  handleDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTimezoneDetection(): TimezoneChangeState {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [oldTimezone, setOldTimezone] = useState("");
  const [newTimezone, setNewTimezone] = useState("");
  const [isRecalculating, setIsRecalculating] = useState(false);
  const { toast } = useToast();

  // Keep toast stable across renders
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const checkTimezoneChange = useCallback(async () => {
    if (_dismissedThisSession) return;

    // Bust the cache so we get the real current timezone
    clearTimezoneCache();
    const deviceTz = getDeviceTimezone();

    try {
      const allSchedules = await db.phaseSchedules.toArray();
      const activeSchedules = allSchedules.filter((s) => s.enabled === true);

      if (activeSchedules.length === 0) return;

      // Get unique anchor timezones from active schedules
      const anchorTimezones = Array.from(
        new Set(activeSchedules.map((s) => s.anchorTimezone)),
      );

      // If any schedule has a different IANA name, prompt
      const hasMismatch = anchorTimezones.some((tz) => tz !== deviceTz);
      if (hasMismatch) {
        // Use the first mismatched timezone as the "old" timezone for display
        const mismatchedTz = anchorTimezones.find(
          (tz) => tz !== deviceTz,
        );
        setOldTimezone(mismatchedTz ?? "");
        setNewTimezone(deviceTz);
        setDialogOpen(true);
      }
    } catch {
      // Silently fail -- don't block app startup over timezone detection
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setIsRecalculating(true);
    try {
      await recalculateScheduleTimezones(newTimezone);
      const cityName = formatTimezoneCityName(newTimezone);
      toastRef.current({
        title: `Schedules adjusted to ${cityName}`,
      });
      setDialogOpen(false);
    } catch {
      toastRef.current({
        title: "Schedule adjustment failed",
        description:
          "Your dose times have not changed. Try reopening the app.",
        variant: "destructive",
      });
    } finally {
      setIsRecalculating(false);
    }
  }, [newTimezone]);

  const handleDismiss = useCallback(() => {
    _dismissedThisSession = true;
    setDialogOpen(false);
  }, []);

  // Check on mount (app open) and on visibility change (app resume)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkTimezoneChange();
      }
    };

    // Check on mount
    checkTimezoneChange();

    // Check on resume from background
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkTimezoneChange]);

  return {
    dialogOpen,
    oldTimezone,
    newTimezone,
    isRecalculating,
    handleConfirm,
    handleDismiss,
  };
}

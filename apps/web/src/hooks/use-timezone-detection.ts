"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getDeviceTimezone, clearTimezoneCache } from "@/lib/timezone";
import {
  findMismatchedAnchors,
  recalculateScheduleTimezones,
  type TimezoneAnchorGroup,
} from "@/lib/timezone-recalculation-service";
import { useToast } from "@intake/ui/use-toast";

// ---------------------------------------------------------------------------
// Persisted "Not now" dismissals
//
// Stored per (deviceTz, anchorTz) pair, so a deliberate choice to keep home
// times on a trip survives reloads and cold starts, while a new zone (or a
// schedule anchored somewhere else) still prompts. Device-local, never synced.
// ---------------------------------------------------------------------------

export const TIMEZONE_DISMISSALS_KEY = "intake-tracker-timezone-dismissals";

/** Cap so the list cannot grow without bound across many trips. */
const MAX_DISMISSALS = 50;

function dismissalKey(deviceTz: string, anchorTz: string): string {
  return `${deviceTz}|${anchorTz}`;
}

function readDismissals(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(TIMEZONE_DISMISSALS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissals(keys: string[]): void {
  try {
    globalThis.localStorage?.setItem(
      TIMEZONE_DISMISSALS_KEY,
      JSON.stringify(keys.slice(-MAX_DISMISSALS)),
    );
  } catch {
    // Storage full or unavailable: the prompt just comes back next launch.
  }
}

/**
 * Anchors the user already dismissed while on `deviceTz`. Dismissals made in
 * any other device zone are dropped: once the device leaves a zone the trip
 * is over, so a later visit to the same zone prompts again.
 */
function dismissedAnchorsFor(deviceTz: string): Set<string> {
  const prefix = `${deviceTz}|`;
  const all = readDismissals();
  const kept = all.filter((k) => k.startsWith(prefix));
  if (kept.length !== all.length) writeDismissals(kept);
  return new Set(kept.map((k) => k.slice(prefix.length)));
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

export type { TimezoneAnchorGroup };

export interface TimezoneChangeState {
  dialogOpen: boolean;
  /** First mismatched anchor; `anchors` lists all of them. */
  oldTimezone: string;
  newTimezone: string;
  /** Every distinct mismatched anchor with its doses' before/after times. */
  anchors: TimezoneAnchorGroup[];
  isRecalculating: boolean;
  handleConfirm: () => Promise<void>;
  handleDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTimezoneDetection(): TimezoneChangeState {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [anchors, setAnchors] = useState<TimezoneAnchorGroup[]>([]);
  const [newTimezone, setNewTimezone] = useState("");
  const [isRecalculating, setIsRecalculating] = useState(false);
  const { toast } = useToast();

  // Keep toast stable across renders
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const checkTimezoneChange = useCallback(async () => {
    // Always bust the cache first, so the dose list and new records pick up
    // the real zone even when the prompt stays dismissed.
    clearTimezoneCache();
    const deviceTz = getDeviceTimezone();

    try {
      // Prompt only if some mismatched anchor is not yet dismissed, but then
      // list them all: confirming re-anchors every mismatched schedule.
      const dismissed = dismissedAnchorsFor(deviceTz);
      const groups = await findMismatchedAnchors(deviceTz);
      if (!groups.some((g) => !dismissed.has(g.anchorTimezone))) return;
      setAnchors(groups);
      setNewTimezone(deviceTz);
      setDialogOpen(true);
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
    const existing = readDismissals();
    const added = anchors
      .map((g) => dismissalKey(newTimezone, g.anchorTimezone))
      .filter((k) => !existing.includes(k));
    writeDismissals([...existing, ...added]);
    setDialogOpen(false);
  }, [anchors, newTimezone]);

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
    oldTimezone: anchors[0]?.anchorTimezone ?? "",
    newTimezone,
    anchors,
    isRecalculating,
    handleConfirm,
    handleDismiss,
  };
}

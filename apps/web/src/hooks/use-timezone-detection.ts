"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getDeviceTimezone, clearTimezoneCache } from "@/lib/timezone";
import {
  findMismatchedAnchors,
  hasTravelSchedules,
  recalculateScheduleTimezones,
  type TimezoneAnchorGroup,
} from "@/lib/timezone-recalculation-service";
import { useToast } from "@intake/ui/use-toast";
import { useSettingsStore } from "@/stores/settings-store";
import { useSyncStatusStore } from "@/stores/sync-status-store";

// ---------------------------------------------------------------------------
// Home timezone (audit gap-timezone-travel-recalc#1)
//
// The travel decision is made against the synced home timezone
// (`homeTimezone` in the settings store, mirrored to the userSettings row),
// not against each schedule's anchor. Anchors are re-stamped by whichever
// device last adjusted or edited a schedule, so with two devices in two zones
// the anchors alone made each device claim the user had travelled.
//
//   - Home set, device in it: no prompt. The device is at home; a schedule
//     anchored elsewhere came from a device that is away, not from travel.
//   - Home set, device elsewhere: this device is away. Prompt to adjust the
//     schedules not anchored here. "Not now" is remembered per
//     (device zone, home zone), so the away device stays quiet even as other
//     devices create or re-anchor schedules.
//   - Home unset (never confirmed): the old per-anchor prompt. Home is
//     recorded once every schedule is anchored to this device's zone.
//   - Adjust makes the device's zone the new home.
//
// A home change arriving from another device (a pull) re-runs the check.
// ---------------------------------------------------------------------------

/**
 * True when this device may write the synced home timezone now. In
 * cloud-sync mode that waits for the first full pull, which may bring the
 * home another device set.
 */
function mayRecordHome(): boolean {
  return (
    useSettingsStore.getState().storageMode !== "cloud-sync" ||
    useSyncStatusStore.getState().initialSyncComplete
  );
}

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
  // The home zone the open prompt was raised against (null: legacy prompt).
  const [promptHome, setPromptHome] = useState<string | null>(null);
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
      const home = useSettingsStore.getState().homeTimezone;
      const dismissed = dismissedAnchorsFor(deviceTz);

      if (home) {
        // At home: nothing to adjust, whatever the anchors say.
        if (home === deviceTz) {
          setDialogOpen(false);
          return;
        }
        if (dismissed.has(home)) return;
        const groups = await findMismatchedAnchors(deviceTz);
        if (groups.length === 0) return;
        setAnchors(groups);
        setPromptHome(home);
        setNewTimezone(deviceTz);
        setDialogOpen(true);
        return;
      }

      // Prompt only if some mismatched anchor is not yet dismissed, but then
      // list them all: confirming re-anchors every mismatched schedule.
      const groups = await findMismatchedAnchors(deviceTz);
      if (!groups.some((g) => !dismissed.has(g.anchorTimezone))) {
        // Every schedule is anchored here: this is home.
        if (groups.length === 0 && mayRecordHome() && (await hasTravelSchedules())) {
          if (useSettingsStore.getState().homeTimezone === null) {
            useSettingsStore.getState().setHomeTimezone(deviceTz);
          }
        }
        return;
      }
      setAnchors(groups);
      setPromptHome(null);
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
      // The schedules now belong to this zone: it is the new home.
      useSettingsStore.getState().setHomeTimezone(newTimezone);
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
    // Against a home zone, "Not now" covers the home zone itself, so new or
    // re-anchored schedules do not bring the prompt back on this trip.
    const dismissedZones = promptHome
      ? [promptHome]
      : anchors.map((g) => g.anchorTimezone);
    const added = dismissedZones
      .map((zone) => dismissalKey(newTimezone, zone))
      .filter((k) => !existing.includes(k));
    writeDismissals([...existing, ...added]);
    setDialogOpen(false);
  }, [anchors, newTimezone, promptHome]);

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

    // Check again when the home zone changes, e.g. pulled from another device.
    const unsubscribeHome = useSettingsStore.subscribe((state, prev) => {
      if (state.homeTimezone !== prev.homeTimezone) checkTimezoneChange();
    });
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsubscribeHome();
    };
  }, [checkTimezoneChange]);

  return {
    dialogOpen,
    oldTimezone: promptHome ?? anchors[0]?.anchorTimezone ?? "",
    newTimezone,
    anchors,
    isRecalculating,
    handleConfirm,
    handleDismiss,
  };
}

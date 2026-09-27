/**
 * The zone a new or re-timed dose schedule is anchored to (audit
 * gap-timezone-travel-recalc#1).
 *
 * A schedule's `time` is a wall-clock time in its `anchorTimezone`. The user's
 * schedules belong to their home zone — the synced `homeTimezone` setting —
 * not to whichever device happens to create or edit one. Anchoring to the
 * editing device's zone meant a schedule added while travelling (or on a
 * second device in another zone) carried the away zone, so a device at home
 * later fired it at the wrong local time until someone adjusted it.
 *
 * Home unset (never confirmed) or not a zone this runtime knows: the device
 * zone, as before.
 */
import { getDeviceTimezone } from "@/lib/timezone";
import { useSettingsStore } from "@/stores/settings-store";

function isKnownTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The synced home timezone, or undefined when unset or unknown. */
export function homeAnchorOrUndefined(): string | undefined {
  const home = useSettingsStore.getState().homeTimezone;
  return home && isKnownTimeZone(home) ? home : undefined;
}

/** Anchor for a new schedule: the home timezone, else the device zone. */
export function getScheduleAnchorTimezone(): string {
  return homeAnchorOrUndefined() ?? getDeviceTimezone();
}

/**
 * Timezone detection and UTC conversion utilities.
 *
 * A schedule's canonical dose time is its wall-clock `time` ("HH:MM") in its
 * `anchorTimezone`. `scheduleTimeUTC` (minutes-from-midnight-UTC) is a cache
 * derived from those two on write; it bakes in the offset of the day it was
 * written, so it drifts by an hour across DST. Resolve a dose time for a
 * specific date with `resolveScheduleLocalTime`, never by decoding
 * `scheduleTimeUTC`.
 */

// ---------------------------------------------------------------------------
// Device timezone (cached, SSR-safe)
// ---------------------------------------------------------------------------

let _cachedTimezone: string | null = null;

/**
 * Returns the device's IANA timezone (e.g. "Europe/Berlin").
 * Returns "UTC" during SSR where `window` is unavailable.
 */
export function getDeviceTimezone(): string {
  if (_cachedTimezone) return _cachedTimezone;
  if (typeof window === "undefined") return "UTC";
  _cachedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return _cachedTimezone;
}

/**
 * Clear the cached timezone so the next getDeviceTimezone() call
 * re-reads from the Intl API. Call this on app resume to detect
 * timezone changes after travel.
 */
export function clearTimezoneCache(): void {
  _cachedTimezone = null;
}

// ---------------------------------------------------------------------------
// UTC offset helpers
// ---------------------------------------------------------------------------

const _offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(timezone: string): Intl.DateTimeFormat {
  let fmt = _offsetFormatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    _offsetFormatters.set(timezone, fmt);
  }
  return fmt;
}

/**
 * Get the UTC offset in minutes for an IANA timezone at a given instant.
 *
 * Positive = east of UTC (e.g. Europe/Berlin CET = +60, CEST = +120).
 * Negative = west of UTC (e.g. America/New_York EST = -300).
 */
export function getTimezoneOffsetAt(instantMs: number, timezone: string): number {
  const parts = offsetFormatter(timezone).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  const wholeSeconds = Math.floor(instantMs / 1000) * 1000;
  return Math.round((wallAsUTC - wholeSeconds) / 60_000);
}

/**
 * Get the UTC offset in minutes for a given IANA timezone *right now*.
 * Only right for encoding the `scheduleTimeUTC` cache; anything that needs a
 * dose time on a particular date must use that date's offset instead.
 */
function getTimezoneOffsetMinutes(timezone: string): number {
  return getTimezoneOffsetAt(Date.now(), timezone);
}

// ---------------------------------------------------------------------------
// Local <-> UTC minutes conversion
// ---------------------------------------------------------------------------

/**
 * Convert a local time (hours + minutes) in a given IANA timezone
 * to minutes-from-midnight-UTC.
 *
 * Example: 08:00 in Europe/Berlin (UTC+1) -> 420 (07:00 UTC = 7*60).
 */
export function localTimeToUTCMinutes(
  hours: number,
  minutes: number,
  timezone: string,
): number {
  const localMinutes = hours * 60 + minutes;
  const offsetMinutes = getTimezoneOffsetMinutes(timezone);
  // local = UTC + offset  =>  UTC = local - offset
  const result = localMinutes - offsetMinutes;
  return ((result % 1440) + 1440) % 1440;
}

/**
 * Convert minutes-from-midnight-UTC back to local hours + minutes
 * in a given IANA timezone.
 */
export function utcMinutesToLocalTime(
  utcMinutes: number,
  timezone: string,
): { hours: number; minutes: number } {
  const offsetMinutes = getTimezoneOffsetMinutes(timezone);
  const localMinutes = ((utcMinutes + offsetMinutes) % 1440 + 1440) % 1440;
  return {
    hours: Math.floor(localMinutes / 60),
    minutes: localMinutes % 60,
  };
}

/**
 * Convenience: format UTC minutes as a local "HH:MM" string.
 */
export function formatLocalTime(
  utcMinutes: number,
  timezone: string,
): string {
  const { hours, minutes } = utcMinutesToLocalTime(utcMinutes, timezone);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Convenience: parse an "HH:MM" string and convert to UTC minutes.
 */
export function localHHMMStringToUTCMinutes(
  timeStr: string,
  timezone: string,
): number {
  const parts = timeStr.split(":").map(Number);
  const hh = parts[0] ?? 0;
  const mm = parts[1] ?? 0;
  return localTimeToUTCMinutes(hh, mm, timezone);
}

// ---------------------------------------------------------------------------
// Wall-clock schedule time resolution (DST-safe)
// ---------------------------------------------------------------------------

const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

function parseHHMM(time: string | undefined): { hours: number; minutes: number } | null {
  const match = HHMM_RE.exec(time?.trim() ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function formatHHMM(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * The instant (epoch ms) at which the wall clock in `timezone` reads `time`
 * on the calendar date `dateKey` (YYYY-MM-DD), using that date's offset.
 *
 * A time inside a spring-forward gap (02:30 on the Europe/Berlin transition
 * day) moves forward by the gap (03:30). An ambiguous fall-back time resolves
 * to the later, standard-time occurrence. Returns null for a malformed date
 * or time.
 */
export function zonedWallClockToInstant(
  dateKey: string,
  time: string,
  timezone: string,
): number | null {
  const hm = parseHHMM(time);
  const [y, mo, d] = dateKey.split("-").map(Number);
  if (!hm || !y || !mo || !d) return null;
  const wallAsUTC = Date.UTC(y, mo - 1, d, hm.hours, hm.minutes);
  const firstOffset = getTimezoneOffsetAt(wallAsUTC, timezone);
  let instant = wallAsUTC - firstOffset * 60_000;
  const secondOffset = getTimezoneOffsetAt(instant, timezone);
  if (secondOffset !== firstOffset) {
    instant = wallAsUTC - secondOffset * 60_000;
  }
  return instant;
}

/** Format an instant as "HH:MM" on the wall clock of `timezone`. */
export function formatInstantInTimezone(instantMs: number, timezone: string): string {
  const local = new Date(instantMs + getTimezoneOffsetAt(instantMs, timezone) * 60_000);
  return formatHHMM(local.getUTCHours(), local.getUTCMinutes());
}

/**
 * A schedule's canonical wall-clock time ("HH:MM") in its `anchorTimezone`.
 *
 * Normally just `time`. Only a legacy record whose `time` is unusable falls
 * back to decoding the `scheduleTimeUTC` cache in the anchor zone.
 */
export function scheduleWallClock(schedule: {
  time: string;
  anchorTimezone: string;
  scheduleTimeUTC: number;
}): string {
  const hm = parseHHMM(schedule.time);
  if (hm) return formatHHMM(hm.hours, hm.minutes);
  return formatLocalTime(schedule.scheduleTimeUTC, schedule.anchorTimezone || "UTC");
}

/**
 * Resolve a schedule's dose time on `dateKey` as "HH:MM" in `deviceTz`.
 *
 * The wall-clock `time` in `anchorTimezone` is the source of truth. It is
 * turned into an instant with that date's anchor offset, then shown on the
 * device's wall clock. An 08:30 Europe/Berlin dose therefore stays 08:30 on
 * a Berlin device on both sides of a DST change, and shows the equivalent
 * local time on a device in another zone.
 *
 * Falls back to the `scheduleTimeUTC` cache only when `time` is unusable.
 */
export function resolveScheduleLocalTime(
  schedule: { time: string; anchorTimezone: string; scheduleTimeUTC: number },
  dateKey: string,
  deviceTz: string,
): string {
  try {
    const instant = zonedWallClockToInstant(
      dateKey,
      schedule.time,
      schedule.anchorTimezone || deviceTz,
    );
    if (instant !== null) return formatInstantInTimezone(instant, deviceTz);
    return formatLocalTime(schedule.scheduleTimeUTC, deviceTz);
  } catch {
    // Unknown IANA name on the record: show the stored wall clock as-is.
    const hm = parseHHMM(schedule.time);
    return hm ? formatHHMM(hm.hours, hm.minutes) : schedule.time;
  }
}

// ---------------------------------------------------------------------------
// Migration helpers
// ---------------------------------------------------------------------------

/**
 * Cutoff timestamp for migration backfill.
 * Records before this date are assigned "Africa/Johannesburg".
 * Records from this date onward are assigned "Europe/Berlin".
 */
export const MIGRATION_TIMEZONE_CUTOFF = new Date(
  "2026-02-12T00:00:00Z",
).getTime();

/**
 * Determine the IANA timezone for a historical record based on timestamp.
 * Used during v11 migration backfill.
 */
export function getTimezoneForTimestamp(timestamp: number): string {
  return timestamp < MIGRATION_TIMEZONE_CUTOFF
    ? "Africa/Johannesburg"
    : "Europe/Berlin";
}

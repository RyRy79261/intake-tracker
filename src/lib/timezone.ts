/**
 * Timezone detection and UTC conversion utilities.
 *
 * Schedule times are stored as minutes-from-midnight-UTC (integer).
 * Every record carries an IANA timezone string for cross-domain analysis.
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

/**
 * Get the UTC offset in minutes for a given IANA timezone *right now*.
 *
 * Positive = east of UTC (e.g. Europe/Berlin CET = +60).
 * Negative = west of UTC (e.g. America/New_York EST = -300).
 *
 * Uses the locale-string diff trick which is the most reliable
 * cross-browser approach without external libraries.
 */
function getTimezoneOffsetMinutes(timezone: string): number {
  const now = new Date();
  // Format the same instant in both UTC and the target timezone
  const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = now.toLocaleString("en-US", { timeZone: timezone });
  // Difference = how far ahead the timezone is from UTC
  const diffMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();
  return Math.round(diffMs / 60_000);
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

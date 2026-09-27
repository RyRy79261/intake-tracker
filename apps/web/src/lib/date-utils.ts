/**
 * Date/time utility functions shared across components.
 */

import { useSettingsStore } from "@/stores/settings-store";

/**
 * Get current datetime in local format for HTML datetime-local inputs.
 * Returns a string like "2024-01-15T14:30"
 */
export function getCurrentDateTimeLocal(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

/**
 * Convert a timestamp to datetime-local input format.
 * Useful for pre-filling datetime inputs with existing record timestamps.
 */
export function timestampToDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

/**
 * Convert a datetime-local input value to a Unix timestamp.
 * @param value - A string in "YYYY-MM-DDTHH:mm" format (from HTML datetime-local input)
 * @returns Unix timestamp in milliseconds
 * @throws Error if the value cannot be parsed as a valid date
 */
export function dateTimeLocalToTimestamp(value: string): number {
  const timestamp = parseDateTimeLocal(value);
  if (timestamp === null) {
    throw new Error(`Invalid date value: "${value}"`);
  }
  return timestamp;
}

/**
 * Non-throwing variant of `dateTimeLocalToTimestamp` for form validation.
 * Mobile pickers can clear a datetime-local input to "", so callers that
 * validate as the user types need a guard rather than an exception.
 * @returns Unix timestamp in milliseconds, or null if the value is not a date
 */
export function parseDateTimeLocal(value: string): number | null {
  const timestamp = new Date(value).getTime();
  return isNaN(timestamp) ? null : timestamp;
}

/**
 * Get the timestamp for when the current "day" started, based on a configurable
 * day-start hour (the app treats a "day" as starting at this local hour rather
 * than midnight). For example, with dayStartHour = 2 (2am):
 * - At 3am Monday, returns 2am Monday
 * - At 1am Monday, returns 2am Sunday (the previous day's start)
 */
export function getDayStartTimestamp(dayStartHour: number): number {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(dayStartHour, 0, 0, 0);

  // If current time is before the day-start hour, use the previous day's start.
  if (now < dayStart) {
    dayStart.setDate(dayStart.getDate() - 1);
  }
  return dayStart.getTime();
}

/**
 * Format a Date or timestamp as a local calendar-day key ("YYYY-MM-DD").
 *
 * Uses the local-time getters (not toISOString) so the key reflects the
 * viewer's calendar day. Defaults to "now" when called with no argument.
 */
export function toLocalDateKey(value: Date | number = new Date()): string {
  const d = typeof value === "number" ? new Date(value) : value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * First day of a displayed week (1 = Monday, JS `getDay()` numbering). One
 * convention for every weekly view: the dashboard's weekly grid, the
 * medications week strip and every day picker start on Monday. Stored
 * `daysOfWeek` stay Sunday-indexed (0 = Sunday); only the display order moves.
 */
export const WEEK_STARTS_ON: number = 1;

/** Sunday-indexed weekdays (0 = Sunday) in display order, first day first. */
export const WEEK_DAY_ORDER: readonly number[] = Array.from(
  { length: 7 },
  (_, i) => (WEEK_STARTS_ON + i) % 7,
);

/** Sunday-indexed weekdays sorted into display order (Monday first). */
export function sortDaysForDisplay(days: readonly number[]): number[] {
  const pos = (d: number) => (d - WEEK_STARTS_ON + 7) % 7;
  return [...days].sort((a, b) => pos(a) - pos(b));
}

export type TimeFormat = "12h" | "24h";

/** The user's Time Format setting (Medications → Settings → Display). */
function currentTimeFormat(): TimeFormat {
  return useSettingsStore.getState().timeFormat === "12h" ? "12h" : "24h";
}

function clockOptions(timeFormat: TimeFormat): Intl.DateTimeFormatOptions {
  // hourCycle h23 (not hour12: false) so midnight reads "00:05", not "24:05".
  return timeFormat === "12h"
    ? { hour: "numeric", minute: "2-digit", hour12: true }
    : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
}

/**
 * Format a timestamp as time only ("14:30", or "2:30 PM" in 12-hour mode).
 * Used for compact displays where date isn't needed.
 */
export function formatTimeOnly(
  timestamp: number,
  timeFormat: TimeFormat = currentTimeFormat()
): string {
  return new Date(timestamp).toLocaleTimeString("en-US", clockOptions(timeFormat));
}

/**
 * Format a timestamp with date and time ("Jan 15, 14:30" / "Jan 15, 2:30 PM").
 * Used for displays showing recent records across days.
 */
export function formatDateTime(
  timestamp: number,
  timeFormat: TimeFormat = currentTimeFormat()
): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...clockOptions(timeFormat),
  });
}

/**
 * Format a wall-clock "HH:mm" string (e.g. a schedule's time) in the user's
 * Time Format, so dose times can match record times.
 */
export function formatClockTime(
  hhmm: string,
  timeFormat: TimeFormat = currentTimeFormat()
): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) {
    return hhmm;
  }
  return formatTimeOnly(new Date(2000, 0, 1, h, m).getTime(), timeFormat);
}

/**
 * Zone-aware "today" for the MCP tools.
 *
 * The MCP server runs in the serverless runtime's zone (UTC on Vercel), so
 * `Date#setHours` would put the day start at the wrong instant for anyone not
 * on UTC. Everything here takes the user's IANA zone explicitly and only uses
 * `Intl`, so the host zone never leaks in.
 */

const DAY_MS = 24 * 60 * 60_000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** First valid zone of (explicit tool arg, stored zone), else UTC. */
export function resolveTimeZone(
  explicit: string | null | undefined,
  stored: string | null | undefined,
): string {
  for (const tz of [explicit, stored]) {
    if (tz && isValidTimeZone(tz)) return tz;
  }
  return "UTC";
}

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(instant: number, tz: string): WallClock {
  let fmt = formatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, fmt);
  }
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** Milliseconds `tz` is ahead of UTC at `instant`. */
function offsetAt(instant: number, tz: string): number {
  const w = wallClock(instant, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a local wall-clock time occurs in `tz`. Two passes so the
 * offset used is the one in force at the result, not at the first guess
 * (matters on DST-change days).
 */
function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  tz: string,
): number {
  const naive = Date.UTC(year, month - 1, day, hour);
  let guess = naive - offsetAt(naive, tz);
  guess = naive - offsetAt(guess, tz);
  return guess;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export interface DayWindow {
  /** When the user's current app day began (local `dayStartHour`). */
  start: number;
  /**
   * Local calendar date ("YYYY-MM-DD") in `tz`. Dose logs are keyed by
   * scheduledDate on the local calendar date, as in the app.
   */
  date: string;
  /** Day of week of `date`, 0 = Sunday (the `daysOfWeek` convention). */
  weekday: number;
}

export function zonedDayWindow(
  now: number,
  tz: string,
  dayStartHour: number,
): DayWindow {
  const w = wallClock(now, tz);
  const date = `${w.year}-${pad(w.month)}-${pad(w.day)}`;
  const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();

  let start = zonedInstant(w.year, w.month, w.day, dayStartHour, tz);
  if (start > now) {
    // Before today's day-start hour: the app day began yesterday. Date.UTC
    // normalises day 0 to the previous month's last day.
    start = zonedInstant(w.year, w.month, w.day - 1, dayStartHour, tz);
  }
  // A day start inside a spring-forward gap can land a little past `now`
  // right after the switch; clamp to a full day back rather than the future.
  if (start > now) start -= DAY_MS;

  return { start, date, weekday };
}

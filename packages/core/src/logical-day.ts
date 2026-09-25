/**
 * The app's "logical day": a calendar day in an IANA timezone that starts at
 * the user's `dayStartHour` (default 2am) rather than midnight, so a drink at
 * 01:30 still counts toward the evening before. The dashboard totals, the
 * analytics buckets and ranges, and the Records-tab day groups all use these
 * helpers so they agree on which day a record belongs to.
 *
 * Medications deliberately do NOT use this. Dose schedules are keyed on the
 * calendar date (`scheduledDate`, local midnight), because a 22:00 dose is
 * that calendar day's dose however late the user stays up.
 *
 * Pure: every function takes the timestamp and zone it needs; nothing reads
 * the clock or the host zone.
 */
import type { DataPoint } from "@intake/types/analytics";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(ts: number, tz: string): WallClock {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(tz).formatToParts(ts)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour! % 24,
    minute: parts.minute!,
    second: parts.second!,
  };
}

/** Offset of `tz` from UTC at instant `ts`, in ms (positive east of UTC). */
function tzOffset(ts: number, tz: string): number {
  const w = wallClock(ts, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - (ts - (((ts % 1000) + 1000) % 1000));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Move a "YYYY-MM-DD" key by `days` calendar days. */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days, 12));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * The logical day ("YYYY-MM-DD") that `ts` belongs to in `tz`. A time before
 * `dayStartHour` on the wall clock belongs to the previous date.
 */
export function logicalDayKey(ts: number, dayStartHour: number, tz: string): string {
  const w = wallClock(ts, tz);
  const key = `${w.year}-${pad(w.month)}-${pad(w.day)}`;
  return w.hour < dayStartHour ? shiftDayKey(key, -1) : key;
}

/** The instant a logical day starts: `dayStartHour`:00 on `key`'s date in `tz`. */
export function logicalDayStart(key: string, dayStartHour: number, tz: string): number {
  const [y, m, d] = key.split("-").map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, dayStartHour);
  // Two passes settle the offset either side of a DST change.
  const guess = wall - tzOffset(wall, tz);
  return wall - tzOffset(guess, tz);
}

/** [start, end] (inclusive, ms) of the logical day containing `now`. */
export function logicalDayRange(
  now: number,
  dayStartHour: number,
  tz: string,
): { start: number; end: number } {
  return logicalDaysRange(now, 1, dayStartHour, tz);
}

/**
 * [start, end] (inclusive, ms) covering `days` whole logical days, ending with
 * the logical day that contains `now`.
 */
export function logicalDaysRange(
  now: number,
  days: number,
  dayStartHour: number,
  tz: string,
): { start: number; end: number } {
  const today = logicalDayKey(now, dayStartHour, tz);
  const first = shiftDayKey(today, -(Math.max(1, days) - 1));
  return {
    start: logicalDayStart(first, dayStartHour, tz),
    end: logicalDayStart(shiftDayKey(today, 1), dayStartHour, tz) - 1,
  };
}

/**
 * Average per logged day: the total divided by the number of logical days that
 * have at least one point. The current logical day is still being logged, so
 * it is left out unless it is the only day with data. Days the user did not
 * log at all never drag the average down.
 */
export function averagePerLoggedDay(
  points: readonly Pick<DataPoint, "timestamp" | "value">[],
  opts: { now: number; dayStartHour: number; tz: string },
): { total: number; days: number; average: number } {
  if (points.length === 0) return { total: 0, days: 0, average: 0 };
  const today = logicalDayKey(opts.now, opts.dayStartHour, opts.tz);
  const byDay = new Map<string, number>();
  for (const p of points) {
    const key = logicalDayKey(p.timestamp, opts.dayStartHour, opts.tz);
    byDay.set(key, (byDay.get(key) ?? 0) + p.value);
  }
  const complete = [...byDay.entries()].filter(([k]) => k !== today);
  const used = complete.length > 0 ? complete : [...byDay.entries()];
  const total = used.reduce((s, [, v]) => s + v, 0);
  return { total, days: used.length, average: total / used.length };
}

/**
 * The logical week: seven logical days (each starting at `dayStartHour`),
 * beginning on the user's first day of the week. Shared by the Today gadget
 * and the legacy TextMetrics summary.
 */

import { toLocalDateKey, weekDayPosition } from "@/lib/date-utils";

/** The calendar date a timestamp's logical day (starting at dayStartHour) belongs to. */
export function logicalDate(timestamp: number, dayStartHour: number): Date {
  const d = new Date(timestamp);
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  return d;
}

export interface LogicalWeek {
  /** Start of the week's first logical day (ms). */
  start: number;
  /** Start of the next week's first logical day (ms, exclusive). */
  end: number;
  /** "YYYY-MM-DD" of each of the seven days, in display order. */
  dayKeys: string[];
  /** Column of today (0-6). */
  todayIndex: number;
}

/**
 * The logical week containing `now`, starting on `weekStartsOn` (0-6, JS
 * getDay): its seven day keys, the [start, end) timestamps to query, and
 * today's column. Days are calendar dates shifted by dayStartHour, and the end
 * is the next logical day start rather than start + 7 × 24h, so 23h/25h DST
 * days don't drop or borrow an hour.
 */
export function getLogicalWeek(now: Date, dayStartHour: number, weekStartsOn: number): LogicalWeek {
  const today = logicalDate(now.getTime(), dayStartHour);
  const todayIndex = weekDayPosition(today.getDay(), weekStartsOn);

  const first = new Date(today);
  first.setDate(today.getDate() - todayIndex);
  first.setHours(dayStartHour, 0, 0, 0);

  const dayKeys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    dayKeys.push(toLocalDateKey(d));
  }

  const next = new Date(first);
  next.setDate(first.getDate() + 7);
  next.setHours(dayStartHour, 0, 0, 0);

  return { start: first.getTime(), end: next.getTime(), dayKeys, todayIndex };
}

/** Sum records into the week's columns by the logical day each belongs to. */
export function bucketByLogicalDay<T extends { timestamp: number }>(
  records: readonly T[], dayKeys: readonly string[], dayStartHour: number, accessor: (r: T) => number
): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  for (const r of records) {
    const i = dayKeys.indexOf(toLocalDateKey(logicalDate(r.timestamp, dayStartHour)));
    if (i >= 0) buckets[i] = (buckets[i] ?? 0) + accessor(r);
  }
  return buckets;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Parse a "YYYY-MM-DD" key as a local date at noon. */
function keyDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12);
}

/** "21–27 Sep", or "28 Sep–4 Oct" when the week spans two months. */
export function weekRangeLabel(dayKeys: readonly string[]): string {
  const a = keyDate(dayKeys[0]!);
  const b = keyDate(dayKeys[dayKeys.length - 1]!);
  const first = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MONTHS[a.getMonth()]}`;
  return `${first}–${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/** The weekday (0-6, JS getDay) of a "YYYY-MM-DD" key. */
export function dayKeyWeekday(key: string): number {
  return keyDate(key).getDay();
}

/**
 * The day prefix for a record in a Recent list: "" for today's logical day,
 * "Yest" for yesterday, the weekday ("Fri") within the last week, otherwise
 * the date ("12 Sep").
 */
export function recentDayLabel(timestamp: number, dayStartHour: number, now: number = Date.now()): string {
  const day = logicalDate(timestamp, dayStartHour);
  const today = logicalDate(now, dayStartHour);
  const a = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (diff <= 0) return "";
  if (diff === 1) return "Yest";
  if (diff < 7) return a.toLocaleDateString("en-GB", { weekday: "short" });
  return `${a.getDate()} ${MONTHS[a.getMonth()]}`;
}

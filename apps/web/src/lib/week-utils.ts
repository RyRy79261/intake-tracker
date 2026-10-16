/**
 * Day labels for Home: the week range and weekday of the Today gadget's day
 * keys, and the "Yest"/weekday prefix in Recent lists. Which day a record
 * belongs to, and the week itself, come from `@intake/core/daily-totals`.
 */

/** The calendar date a timestamp's logical day (starting at dayStartHour) belongs to. */
export function logicalDate(timestamp: number, dayStartHour: number): Date {
  const d = new Date(timestamp);
  if (d.getHours() < dayStartHour) d.setDate(d.getDate() - 1);
  return d;
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

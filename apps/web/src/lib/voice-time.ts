import type { VoiceParsedItem } from "@/lib/voice-types";

/**
 * Spoken times on voice items ("lunch at 1pm", "an hour ago").
 *
 * The parser returns a bare clock time — it doesn't know the user's date or
 * day-start hour — and the client turns it into a timestamp here.
 */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Start of the logical day containing `now`, given the day-start hour. */
function logicalDayStart(now: number, dayStartHour: number): number {
  const start = new Date(now);
  start.setHours(dayStartHour, 0, 0, 0);
  if (start.getTime() > now) start.setDate(start.getDate() - 1);
  return start.getTime();
}

/**
 * Resolve an "HH:mm" spoken time to a timestamp at or before `now`.
 *
 * The time is placed in the current logical day (which starts at
 * `dayStartHour`, not midnight): at 01:00 with a 2am day start, "11pm" is the
 * 23:00 that just passed. A time that would still be in the future is the
 * previous day's — nobody logs what they are about to drink. A malformed
 * value resolves to `now`.
 */
export function resolveSpokenTime(time: string, now: number, dayStartHour: number): number {
  const match = HHMM.exec(time);
  if (!match) return now;
  const dayStart = logicalDayStart(now, dayStartHour);
  const candidate = new Date(dayStart);
  candidate.setHours(Number(match[1]), Number(match[2]), 0, 0);
  // A clock time before the day-start hour belongs to the logical day's
  // second calendar date.
  if (candidate.getTime() < dayStart) candidate.setDate(candidate.getDate() + 1);
  if (candidate.getTime() > now) candidate.setDate(candidate.getDate() - 1);
  return candidate.getTime();
}

/** True when `timestamp` falls before the logical day containing `now`. */
export function isEarlierLogicalDay(timestamp: number, now: number, dayStartHour: number): boolean {
  return timestamp < logicalDayStart(now, dayStartHour);
}

function toHHMM(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Collapse an item's timing onto the single editable `time` field: a relative
 * `minutesAgo` becomes the clock time it points at (measured from `now`, the
 * moment the parse arrived). An explicit `time` wins over an offset.
 */
export function normalizeSpokenTiming<T extends VoiceParsedItem>(item: T, now: number): T {
  if (item.minutesAgo === undefined) return item;
  const { minutesAgo, ...rest } = item;
  if (rest.time !== undefined) return rest as T;
  return { ...rest, time: toHHMM(now - minutesAgo * 60_000) } as T;
}

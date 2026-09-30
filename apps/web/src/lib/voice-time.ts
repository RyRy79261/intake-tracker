import type { SpokenWhen, VoiceParsedItem, VoiceParseClientNow } from "@/lib/voice-types";
import { getTimezoneOffsetAt, zonedWallClockToInstant } from "@/lib/timezone";
import { shiftDayKey } from "@intake/core/logical-day";

/**
 * Spoken times on voice items ("a beer yesterday at 8pm", "water an hour ago").
 *
 * The parser is told the device's local time and returns, per item, either a
 * local wall-clock date-time or a number of minutes ago. Everything that turns
 * those into a timestamp happens here, with the device's IANA zone: the model
 * never does offset or DST arithmetic.
 *
 * On the client an item's time is one string, `at`: a local wall-clock
 * "YYYY-MM-DDTHH:mm" — the value of a datetime-local input. Absent means "when
 * saved". Every function takes `now` and the zone, so nothing here reads the
 * clock or the host zone.
 */

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

/** A spoken time further back than this is kept, but the row asks for a check. */
export const REVIEW_AFTER_DAYS = 7;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** The wall clock of `timeZone` at `timestamp`, as "YYYY-MM-DDTHH:mm". */
export function formatLocalDateTime(timestamp: number, timeZone: string): string {
  const offsetMs = getTimezoneOffsetAt(timestamp, timeZone) * 60_000;
  return new Date(timestamp + offsetMs).toISOString().slice(0, 16);
}

/**
 * The instant at which the wall clock of `timeZone` reads `value`
 * ("YYYY-MM-DDTHH:mm"), or null when `value` is not a real date-time. A time
 * inside a spring-forward gap moves forward by the gap; an ambiguous
 * fall-back time is the later one (see `zonedWallClockToInstant`).
 */
export function parseLocalDateTime(value: string, timeZone: string): number | null {
  const m = LOCAL_DATE_TIME.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return zonedWallClockToInstant(`${m[1]}-${m[2]}-${m[3]}`, `${m[4]}:${m[5]}`, timeZone);
}

/** The clock the parse request carries, so the model can date what was said. */
export function clientNowForParse(now: number, timeZone: string): VoiceParseClientNow {
  return {
    localDateTime: formatLocalDateTime(now, timeZone),
    timeZone,
    utcOffsetMinutes: getTimezoneOffsetAt(now, timeZone),
  };
}

/**
 * Turn the parser's `when` into an item's `at`, or `undefined` for "now".
 *
 * `now` is the moment the request was made — what the model was told, and
 * what "an hour ago" counts back from. A time the model put in the future, a
 * string that is not a date, and the current minute itself all mean "now".
 */
export function resolveSpokenWhen(
  when: SpokenWhen | null | undefined,
  now: number,
  timeZone: string,
): string | undefined {
  if (!when) return undefined;
  let timestamp: number | null;
  if (when.kind === "relative") {
    if (!Number.isFinite(when.minutesAgo)) return undefined;
    timestamp = now - Math.round(when.minutesAgo) * 60_000;
  } else if (when.kind === "absolute" && typeof when.localDateTime === "string") {
    timestamp = parseLocalDateTime(when.localDateTime.slice(0, 16), timeZone);
  } else {
    return undefined;
  }
  if (timestamp === null || timestamp > now) return undefined;
  const at = formatLocalDateTime(timestamp, timeZone);
  return at === formatLocalDateTime(now, timeZone) ? undefined : at;
}

/**
 * Replace an item's wire-form `when` with the single editable `at` field, so
 * the review row shows and edits one value.
 */
export function normalizeSpokenTiming<T extends VoiceParsedItem>(
  item: T,
  now: number,
  timeZone: string,
): T {
  if (item.when === undefined) return item;
  const { when, ...rest } = item;
  const at = resolveSpokenWhen(when, now, timeZone);
  return (at === undefined ? rest : { ...rest, at }) as T;
}

/**
 * The timestamp an item is saved with: its `at` on the device's wall clock,
 * or `now` when it has none. A time that is not a date, or is later than
 * `now`, also saves as `now` — nobody logs what they are about to drink.
 */
export function spokenTimestamp(
  item: Pick<VoiceParsedItem, "at">,
  now: number,
  timeZone: string,
): number {
  if (item.at === undefined) return now;
  const timestamp = parseLocalDateTime(item.at, timeZone);
  return timestamp === null || timestamp > now ? now : timestamp;
}

/** Why an edited `at` cannot be saved, or null. */
export function spokenTimeError(
  at: string | undefined,
  now: number,
  timeZone: string,
): string | null {
  if (at === undefined) return null;
  const timestamp = parseLocalDateTime(at, timeZone);
  if (timestamp === null) return "Time must be a valid date and time.";
  if (timestamp > now) return "Time cannot be in the future.";
  return null;
}

/** True when `at` is more than {@link REVIEW_AFTER_DAYS} days before `now`. */
export function isLongAgo(at: string | undefined, now: number, timeZone: string): boolean {
  if (at === undefined) return false;
  const timestamp = parseLocalDateTime(at, timeZone);
  return timestamp !== null && timestamp < now - REVIEW_AFTER_DAYS * 86_400_000;
}

/**
 * How the review row names an item's time: "Today 13:00", "Yesterday 20:00",
 * "Mon 28 Sep 20:00" (with the year when it is not this one). Days are
 * calendar days on the device's wall clock, as the user said them.
 */
export function describeSpokenTime(at: string, now: number, timeZone: string): string {
  const m = LOCAL_DATE_TIME.exec(at);
  if (!m) return at;
  const dateKey = at.slice(0, 10);
  const clock = at.slice(11, 16);
  const todayKey = formatLocalDateTime(now, timeZone).slice(0, 10);
  if (dateKey === todayKey) return `Today ${clock}`;
  if (dateKey === shiftDayKey(todayKey, -1)) return `Yesterday ${clock}`;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const year = m[1] === todayKey.slice(0, 4) ? "" : ` ${m[1]}`;
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}${year} ${clock}`;
}

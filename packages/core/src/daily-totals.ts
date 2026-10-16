/**
 * Daily Totals: what the user has taken today (and this week) against their
 * targets. The Today gadget, the Liquids card header, the Food card and the
 * MCP today summary all render the output of {@link dailyTotals}, so they
 * agree on three rules:
 *
 * - **Which day a record belongs to**: its logical day (see `logical-day.ts`):
 *   a day in the user's zone that starts at `dayStartHour`.
 * - **Records dated in the future do not count.** A record stamped after
 *   `now` (a mistyped date, or a time picked later today) is left out of
 *   every total until its time comes.
 * - **Where a total sits against its target** ({@link metricDay}): at or
 *   under the target is `ok`; past the target but inside the buffer is
 *   `extended`; past target + buffer (or past the target with no buffer) is
 *   `over`. With no target set it is `none`. A soft target (a minimum to
 *   reach, potassium) is never over.
 *
 * Pure: the caller passes `now`, the zone and the rows.
 */
import { getProgressStatus, type ProgressStatus } from "./progress-utils";
import { logicalDayKey, logicalDayStart, shiftDayKey } from "./logical-day";

export const METRIC_KEYS = ["water", "sodium", "sugar", "potassium", "caffeine", "alcohol"] as const;

/** A daily total the app tracks. Sodium is stored as intake `type: "salt"`. */
export type MetricKey = (typeof METRIC_KEYS)[number];

/** Where a day's total sits against its target. `none`: no target set. */
export type MetricStatus = "none" | ProgressStatus;

export interface MetricTarget {
  /** Daily target. 0 or less: no target. */
  limit: number;
  /** Allowance past the target before the total is over the limit. */
  buffer?: number;
  /** A minimum to reach (potassium): never `extended` or `over`. */
  soft?: boolean;
}

/** One metric on one day, measured against its target. */
export interface MetricDay {
  value: number;
  limit: number;
  buffer: number;
  soft: boolean;
  status: MetricStatus;
  /** How much is left before the target (0 once it is reached). */
  left: number;
  /** How far past the target the total is (0 at or under it). */
  overTarget: number;
}

/** {@link MetricDay} for a total against a target. */
export function metricDay(value: number, target: MetricTarget = { limit: 0 }): MetricDay {
  const limit = target.limit > 0 ? target.limit : 0;
  const buffer = Math.max(0, target.buffer ?? 0);
  const soft = target.soft ?? false;
  let status: MetricStatus = "none";
  if (limit > 0) status = soft ? "ok" : getProgressStatus(value, limit, buffer);
  return {
    value,
    limit,
    buffer,
    soft,
    status,
    left: limit > 0 ? Math.max(0, limit - value) : 0,
    overTarget: limit > 0 ? Math.max(0, value - limit) : 0,
  };
}

/** One live record's contribution to a metric. */
export interface TotalsRow {
  metric: MetricKey;
  timestamp: number;
  amount: number;
}

export interface TotalsWindow {
  /** Today's logical day ("YYYY-MM-DD"). */
  today: string;
  /** The days shown, in order: the logical week, or just today. */
  dayKeys: string[];
  /** Position of today in `dayKeys`. */
  todayIndex: number;
  /** When today's logical day started (ms). */
  dayStart: number;
  /** [start, end) of the days shown (ms). */
  start: number;
  end: number;
  /**
   * Earliest timestamp a caller must read to fill these totals: the first
   * day shown, or 24 hours ago for the rolling total, whichever is earlier.
   * Read from here with no upper bound; {@link dailyTotals} drops the future.
   */
  readFrom: number;
}

const DAY_MS = 24 * 60 * 60_000;

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" key. */
function keyWeekday(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/**
 * The days {@link dailyTotals} covers: the logical week containing `now`,
 * starting on `weekStartsOn` (0-6, 0 = Sunday), or just today when
 * `weekStartsOn` is left out.
 */
export function totalsWindow(
  now: number,
  tz: string,
  dayStartHour: number,
  weekStartsOn?: number,
): TotalsWindow {
  const today = logicalDayKey(now, dayStartHour, tz);
  const todayIndex = weekStartsOn === undefined ? 0 : (keyWeekday(today) - weekStartsOn + 7) % 7;
  const length = weekStartsOn === undefined ? 1 : 7;
  const dayKeys = Array.from({ length }, (_, i) => shiftDayKey(today, i - todayIndex));
  const start = logicalDayStart(dayKeys[0]!, dayStartHour, tz);
  const end = logicalDayStart(shiftDayKey(dayKeys[length - 1]!, 1), dayStartHour, tz);
  return {
    today,
    dayKeys,
    todayIndex,
    dayStart: logicalDayStart(today, dayStartHour, tz),
    start,
    end,
    readFrom: Math.min(start, now - DAY_MS),
  };
}

export interface MetricTotals {
  /** Today's total against the target. */
  today: MetricDay;
  /** Each day in `dayKeys`; days still to come are 0. */
  days: MetricDay[];
  /** The last 24 hours up to now. */
  rolling24h: number;
}

export interface DailyTotals extends TotalsWindow {
  now: number;
  metrics: Record<MetricKey, MetricTotals>;
}

export interface DailyTotalsInput {
  now: number;
  /** IANA zone the day boundaries are in. */
  tz: string;
  dayStartHour: number;
  /** Cover the logical week starting on this weekday; omit for today only. */
  weekStartsOn?: number;
  /** Live (not deleted) records. Rows outside the window are ignored. */
  rows: Iterable<TotalsRow>;
  targets?: Partial<Record<MetricKey, MetricTarget>>;
}

/** Today's (and optionally this week's) totals per metric. */
export function dailyTotals(input: DailyTotalsInput): DailyTotals {
  const { now, tz, dayStartHour, weekStartsOn, targets = {} } = input;
  const window = totalsWindow(now, tz, dayStartHour, weekStartsOn);
  const index = new Map(window.dayKeys.map((k, i) => [k, i]));
  const sums = new Map<MetricKey, { days: number[]; rolling: number }>(
    METRIC_KEYS.map((k) => [k, { days: window.dayKeys.map(() => 0), rolling: 0 }]),
  );

  for (const row of input.rows) {
    if (row.timestamp > now) continue; // the future does not count yet
    const sum = sums.get(row.metric);
    if (!sum) continue;
    if (row.timestamp >= now - DAY_MS) sum.rolling += row.amount;
    if (row.timestamp < window.start) continue;
    const i = index.get(logicalDayKey(row.timestamp, dayStartHour, tz));
    if (i !== undefined) sum.days[i]! += row.amount;
  }

  const metrics = {} as Record<MetricKey, MetricTotals>;
  for (const key of METRIC_KEYS) {
    const sum = sums.get(key)!;
    const days = sum.days.map((v) => metricDay(v, targets[key]));
    metrics[key] = { today: days[window.todayIndex]!, days, rolling24h: sum.rolling };
  }
  return { ...window, now, metrics };
}

/**
 * The line shown once a total is past its target (the #309 rule): how far
 * into the buffer it is, against the buffer's size ("1,001 / 500 ml extra"),
 * or how far over the target when no buffer is set ("200 ml over"). "" at or
 * under the target, and for a soft target. `fmt` formats an amount; `unit`
 * (with its leading space, if any) is written once, after the last amount.
 */
export function overTargetText(
  day: MetricDay,
  fmt: (amount: number) => string,
  unit = "",
): string {
  if (day.soft || day.overTarget <= 0) return "";
  return day.buffer > 0
    ? `${fmt(day.overTarget)} / ${fmt(day.buffer)}${unit} extra`
    : `${fmt(day.overTarget)}${unit} over`;
}

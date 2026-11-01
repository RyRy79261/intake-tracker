/**
 * Metrics derived from a blood-pressure reading's systolic and diastolic
 * values. They add no new measurement; they re-express the cuff's numbers in
 * forms that are easier to read for heart failure monitoring.
 *
 * - Pulse pressure (SBP - DBP) loosely tracks stroke volume.
 * - Proportional pulse pressure ((SBP - DBP) / SBP) corrects pulse pressure
 *   for the overall pressure level. Below 25% was linked to a cardiac index
 *   under 2.2 L/min/m2 in advanced chronic heart failure (Stevenson & Perloff,
 *   JAMA 1989). That threshold comes from bedside readings at rest; on home
 *   data it is a trend signal, not a rule.
 * - Mean arterial pressure here is CALCULATED (DBP + 1/3 pulse pressure). An
 *   oscillometric cuff measures its own MAP first and estimates SBP/DBP from
 *   it; the two MAPs are not interchangeable. 65 mmHg is the usual perfusion
 *   floor.
 *
 * Pure: nothing reads the clock or the host zone.
 */
import { logicalDayKey } from "./logical-day";

/** Proportional pulse pressure below this is the low-output signal. */
export const PPP_LOW_THRESHOLD = 0.25;
/** Calculated MAP below this is under the usual perfusion floor (mmHg). */
export const MAP_LOW_THRESHOLD = 65;

export function pulsePressure(systolic: number, diastolic: number): number {
  return systolic - diastolic;
}

/** (SBP - DBP) / SBP, as a fraction (0.32 = 32%). */
export function proportionalPulsePressure(systolic: number, diastolic: number): number {
  if (systolic <= 0) return 0;
  return (systolic - diastolic) / systolic;
}

/** DBP + (SBP - DBP) / 3, in mmHg. */
export function meanArterialPressure(systolic: number, diastolic: number): number {
  return diastolic + (systolic - diastolic) / 3;
}

export interface DerivedBloodPressure {
  pulsePressure: number;
  proportionalPulsePressure: number;
  meanArterialPressure: number;
}

export function deriveBloodPressure(systolic: number, diastolic: number): DerivedBloodPressure {
  return {
    pulsePressure: pulsePressure(systolic, diastolic),
    proportionalPulsePressure: proportionalPulsePressure(systolic, diastolic),
    meanArterialPressure: meanArterialPressure(systolic, diastolic),
  };
}

export interface DailyDerivedBloodPressure extends DerivedBloodPressure {
  /** Logical day, "YYYY-MM-DD". */
  day: string;
  /** Readings that went into the day's means. */
  count: number;
}

/**
 * One row per logical day that has readings, oldest first. Each metric is the
 * mean of that day's per-reading values, so a day with an evening reading as
 * well as a morning one is still a single point.
 */
export function dailyDerivedBloodPressure(
  readings: readonly { systolic: number; diastolic: number; timestamp: number }[],
  opts: { dayStartHour: number; tz: string },
): DailyDerivedBloodPressure[] {
  const byDay = new Map<string, DerivedBloodPressure[]>();
  for (const r of readings) {
    const key = logicalDayKey(r.timestamp, opts.dayStartHour, opts.tz);
    const list = byDay.get(key) ?? [];
    list.push(deriveBloodPressure(r.systolic, r.diastolic));
    byDay.set(key, list);
  }
  const mean = (list: DerivedBloodPressure[], f: keyof DerivedBloodPressure) =>
    list.reduce((s, x) => s + x[f], 0) / list.length;
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, list]) => ({
      day,
      count: list.length,
      pulsePressure: mean(list, "pulsePressure"),
      proportionalPulsePressure: mean(list, "proportionalPulsePressure"),
      meanArterialPressure: mean(list, "meanArterialPressure"),
    }));
}

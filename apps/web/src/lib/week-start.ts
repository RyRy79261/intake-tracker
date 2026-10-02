/**
 * Week-start helpers. Pure (no store import) so the settings store can use
 * them without an import cycle; re-exported from `@/lib/date-utils`.
 *
 * Weekdays use JS `getDay()` numbering throughout (0 = Sunday). The user's
 * first day of the week is the synced `weekStartsOn` setting; every weekly
 * view (the dashboard's weekly grid, the medications week strip, every day
 * picker and day list) reads it and passes it in here. Stored `daysOfWeek`
 * stay Sunday-indexed; only the display order moves.
 */

/** Default first day of a displayed week: Monday. */
export const DEFAULT_WEEK_STARTS_ON = 1;

/** A week start as a whole weekday 0-6; anything else reads as the default. */
export function normalizeWeekStartsOn(value: unknown): number {
  return isWeekStartsOn(value) ? value : DEFAULT_WEEK_STARTS_ON;
}

/** Whether `value` is a whole weekday 0-6. */
export function isWeekStartsOn(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

/** Where a Sunday-indexed weekday sits (0-6) in a week starting on `weekStartsOn`. */
export function weekDayPosition(day: number, weekStartsOn: number): number {
  return (((day - weekStartsOn) % 7) + 7) % 7;
}

/** Sunday-indexed weekdays in display order, `weekStartsOn` first. */
export function weekDayOrder(weekStartsOn: number): number[] {
  return Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);
}

/** Sunday-indexed weekdays sorted into display order, `weekStartsOn` first. */
export function sortDaysForDisplay(days: readonly number[], weekStartsOn: number): number[] {
  return [...days].sort(
    (a, b) => weekDayPosition(a, weekStartsOn) - weekDayPosition(b, weekStartsOn),
  );
}

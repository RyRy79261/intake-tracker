/**
 * "Apply from" schedule edits (Medisafe "edit the med").
 *
 * A schedule edit never rewrites the days before it applies. Save closes the
 * old `PhaseSchedule` rows at the "Apply from" date (`effectiveTo`) and
 * creates new rows from it (`effectiveFrom`). Both fields are device-local
 * date keys ("YYYY-MM-DD"), the same key a dose log's `scheduledDate` uses:
 * from is inclusive, to is exclusive.
 *
 * A row without the fields (every row written before this change) keeps its
 * old dating: it applies from the day it was created and until it is
 * deleted. Readers that date by `createdAt` and `deletedAt` keep doing that;
 * the window is an extra condition on top.
 *
 * Pure and structurally typed, so the server (Drizzle rows, `null` for an
 * unset column) and the app use the same rules.
 */

/** The window fields a reader needs. */
export interface ScheduleWindowLike {
  effectiveFrom?: string | null | undefined;
  effectiveTo?: string | null | undefined;
}

/** Whether `dateKey` is inside the row's explicit window (ignores createdAt and deletedAt). */
export function scheduleInEffectOn(schedule: ScheduleWindowLike, dateKey: string): boolean {
  if (schedule.effectiveFrom && dateKey < schedule.effectiveFrom) return false;
  if (schedule.effectiveTo && dateKey >= schedule.effectiveTo) return false;
  return true;
}

/** `dateKey` plus `days` calendar days ("YYYY-MM-DD"). */
export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

/** What a schedule row says: when, how much, which weekdays. */
export interface ScheduleContent {
  time: string;
  dosage: number;
  daysOfWeek: readonly number[];
}

/** A live row of the phase, with the first day it applies. */
export interface PlannedRow extends ScheduleContent, ScheduleWindowLike {
  id: string;
  enabled: boolean;
  /** First day the row applies: `effectiveFrom`, else the local date of `createdAt`. */
  start: string;
  /** The unit the row's dose is read in (a closed row keeps its own). Unset: not compared. */
  unit?: string | undefined;
}

/** A row the user wants from the "Apply from" date on. `id` is the row it was edited from. */
export interface DesiredRow extends ScheduleContent {
  id?: string;
}

/**
 * What to do when a row that changes already has a logged dose (taken,
 * skipped or rescheduled) on the change day or later.
 *
 * - `"start-next-day"` (the product rule): the whole change starts on the
 *   day after the last such logged dose. The logged dose stays with its row,
 *   so the day keeps the time, dose and log it had, and no part of the new
 *   regimen is added on top of it.
 * - `"move-logs"`: the change starts on the "Apply from" date, and those logs
 *   move to the new row (same write). A removed row has no new row, so it
 *   stays until after its last logged dose.
 */
export type ChangeDayRule = "start-next-day" | "move-logs";

export interface ScheduleChangeInput {
  rows: readonly PlannedRow[];
  desired: readonly DesiredRow[];
  /** "Apply from" date key. */
  applyFrom: string;
  /** Per row id, the date keys (>= applyFrom) that have a logged dose. */
  loggedDates: ReadonlyMap<string, readonly string[]>;
  rule: ChangeDayRule;
  /** The phase's unit after the edit. A row read in another unit is a changed row. */
  unit?: string | undefined;
}

export interface ScheduleChangePlan {
  /** Changes to existing rows. `effectiveTo: null` re-opens a row. */
  patches: {
    id: string;
    changes: Partial<ScheduleContent> & { effectiveFrom?: string; effectiveTo?: string | null };
  }[];
  /** New rows. `replaces` is the old row it continues (for a log move). */
  inserts: { content: ScheduleContent; effectiveFrom: string; replaces?: string }[];
  /** Rows that never applied before the change and are dropped. */
  tombstones: string[];
  /** Logs to move to the new row at `insertIndex` ("move-logs" rule). */
  logMoves: { fromScheduleId: string; insertIndex: number; dates: string[] }[];
  /**
   * The day the new regimen starts: `applyFrom`, or later when a logged dose
   * moved it ("start-next-day").
   */
  startsOn: string;
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((d, i) => d === sb[i]);
}

function sameContent(a: ScheduleContent, b: ScheduleContent): boolean {
  return a.time === b.time && a.dosage === b.dosage && sameDays(a.daysOfWeek, b.daysOfWeek);
}

/** Same time, dose and weekdays, read in the same unit. */
function rowMatches(row: PlannedRow, d: DesiredRow, unit: string | undefined): boolean {
  if (unit !== undefined && row.unit !== undefined && row.unit !== unit) return false;
  return sameContent(row, d);
}

function contentOf(d: ScheduleContent): ScheduleContent {
  return { time: d.time, dosage: d.dosage, daysOfWeek: [...d.daysOfWeek] };
}

/**
 * Whether `desired` is the phase's newest regimen (the enabled rows no edit
 * has closed, also those that start later), in the same unit. Re-saving what
 * a drawer shows is then not a change, so it must not move a pending one.
 */
export function isNewestRegimen(
  rows: readonly PlannedRow[],
  desired: readonly DesiredRow[],
  unit?: string,
): boolean {
  const left = rows.filter((r) => r.enabled === true && !r.effectiveTo);
  if (left.length !== desired.length) return false;
  for (const d of desired) {
    const i = left.findIndex((r) => rowMatches(r, d, unit));
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

/**
 * Plan an "Apply from" edit of one phase's schedules: make the regimen from
 * the change day on equal `desired`, and keep every day before it as it was.
 *
 * The change day is `applyFrom`. Under "start-next-day" it is the day after
 * the last logged dose (on or after `applyFrom`) of any row that changes, so
 * the whole regimen switches on one day.
 *
 * On the change day:
 * - A row in effect that is unchanged is kept (and re-opened if a later
 *   change was pending).
 * - A changed row that already applied before the change day is closed
 *   there, and a new row starts there. A changed row that never applied
 *   before it (a pending change, or a row added that day) is edited in place.
 * - A removed row is closed at the change day, or dropped when it never
 *   applied. A row with a logged dose is never dropped.
 * - Rows that ended before the change day are history and stay as they are.
 */
export function planScheduleChange(input: ScheduleChangeInput): ScheduleChangePlan {
  const { applyFrom, rule, unit } = input;
  const enabled = input.rows.filter((r) => r.enabled === true);
  const logged = (id: string) =>
    (input.loggedDates.get(id) ?? []).filter((k) => k >= applyFrom).sort();

  /** Which rows the change touches when it starts on `day`, and which desired rows they already are. */
  const layout = (day: string) => {
    const affected = enabled.filter((r) => !r.effectiveTo || r.effectiveTo > day);
    const inEffect = affected.filter((r) => r.start <= day);
    const kept = new Set<string>();
    const remaining: DesiredRow[] = [];
    for (const d of input.desired) {
      const free = (r: PlannedRow) => !kept.has(r.id) && rowMatches(r, d, unit);
      const same = inEffect.find((r) => r.id === d.id && free(r)) ?? inEffect.find(free);
      if (same) kept.add(same.id);
      else remaining.push(d);
    }
    const changing = affected.filter((r) => !kept.has(r.id));
    return { affected, kept, remaining, changing };
  };

  let day = applyFrom;
  if (rule === "start-next-day") {
    for (;;) {
      const last = layout(day)
        .changing.flatMap((r) => logged(r.id))
        .sort()
        .at(-1);
      const next = last && addDaysToKey(last, 1) > day ? addDaysToKey(last, 1) : day;
      if (next === day) break;
      day = next;
    }
  }
  const { affected, kept, remaining, changing } = layout(day);
  const plan: ScheduleChangePlan = { patches: [], inserts: [], tombstones: [], logMoves: [], startsOn: day };

  // 1. Unchanged rows stay, open-ended.
  for (const r of affected) {
    if (kept.has(r.id) && r.effectiveTo) plan.patches.push({ id: r.id, changes: { effectiveTo: null } });
  }

  // 2. Pair each changed row with the row it was edited from: by id, else
  // by time order (rows in effect on the day first).
  const free = new Set(changing.map((r) => r.id));
  const pairs: { desired: DesiredRow; from?: PlannedRow }[] = [];
  const unpaired: DesiredRow[] = [];
  for (const d of remaining) {
    const from = changing.find((r) => r.id === d.id && free.has(r.id));
    if (from) {
      free.delete(from.id);
      pairs.push({ desired: d, from });
    } else {
      unpaired.push(d);
    }
  }
  const leftovers = changing
    .filter((r) => free.has(r.id))
    .sort((a, b) => Number(a.start > day) - Number(b.start > day) || a.time.localeCompare(b.time));
  unpaired.sort((a, b) => a.time.localeCompare(b.time));
  unpaired.forEach((d, i) => {
    const from = leftovers[i];
    if (from) free.delete(from.id);
    pairs.push({ desired: d, ...(from && { from }) });
  });

  for (const { desired, from } of pairs) {
    const content = contentOf(desired);
    if (!from) {
      plan.inserts.push({ content, effectiveFrom: day });
      continue;
    }
    if (from.start >= day) {
      // Never applied before the change day: nothing to keep, edit in place
      // (a "move-logs" log on it stays with it, which is the move).
      plan.patches.push({
        id: from.id,
        changes: {
          ...content,
          ...(from.effectiveFrom && from.effectiveFrom !== day && { effectiveFrom: day }),
          ...(from.effectiveTo && { effectiveTo: null }),
        },
      });
      continue;
    }
    if (from.effectiveTo !== day) plan.patches.push({ id: from.id, changes: { effectiveTo: day } });
    plan.inserts.push({ content, effectiveFrom: day, replaces: from.id });
    const moved = logged(from.id).filter((k) => k >= day);
    if (moved.length > 0) {
      plan.logMoves.push({ fromScheduleId: from.id, insertIndex: plan.inserts.length - 1, dates: moved });
    }
  }

  // 3. Removed rows end at the change day. A logged dose keeps its row
  // through its day (only "move-logs" can leave one after the change day).
  for (const row of changing) {
    if (!free.has(row.id)) continue;
    const last = logged(row.id).at(-1);
    const end = last && addDaysToKey(last, 1) > day ? addDaysToKey(last, 1) : day;
    if (row.start >= end && !last) plan.tombstones.push(row.id);
    else if (row.effectiveTo !== end) plan.patches.push({ id: row.id, changes: { effectiveTo: end } });
  }

  return plan;
}

/** True when the plan writes nothing. */
export function isEmptyPlan(plan: ScheduleChangePlan): boolean {
  return (
    plan.patches.length === 0 &&
    plan.inserts.length === 0 &&
    plan.tombstones.length === 0 &&
    plan.logMoves.length === 0
  );
}

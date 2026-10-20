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
}

/** A row the user wants from the "Apply from" date on. `id` is the row it was edited from. */
export interface DesiredRow extends ScheduleContent {
  id?: string;
}

/**
 * What to do with an old row that already has a logged dose (taken, skipped
 * or rescheduled) on the change day or later.
 *
 * - `"start-next-day"` (the product rule): the change for that row starts on
 *   the day after its last logged dose. The logged dose stays with the old
 *   row, so the day keeps the time, dose and log it had.
 * - `"move-logs"`: the change starts on the "Apply from" date, and those logs
 *   move to the new row (same write).
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
  /** Rows whose change starts after `applyFrom` because a dose is already logged. */
  deferred: { scheduleId: string; startsOn: string }[];
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

function contentOf(d: ScheduleContent): ScheduleContent {
  return { time: d.time, dosage: d.dosage, daysOfWeek: [...d.daysOfWeek] };
}

/**
 * Plan an "Apply from" edit of one phase's schedules: make the regimen from
 * `applyFrom` on equal `desired`, and keep every day before it as it was.
 *
 * - A row that is unchanged is kept (and re-opened if a later change was
 *   pending).
 * - A changed row that already applied before the change day is closed
 *   there, and a new row starts there. A changed row that never applied
 *   before it is edited in place.
 * - A removed row is closed at the change day, or dropped when it never
 *   applied.
 * - A row that only starts after `applyFrom` (a pending change) is replaced.
 *
 * The change day of a row is `applyFrom`, unless the row has a logged dose on
 * or after it (see ChangeDayRule).
 */
export function planScheduleChange(input: ScheduleChangeInput): ScheduleChangePlan {
  const { applyFrom, rule } = input;
  const plan: ScheduleChangePlan = { patches: [], inserts: [], tombstones: [], logMoves: [], deferred: [] };

  const enabled = input.rows.filter((r) => r.enabled === true);
  // Rows in effect on the change date or later.
  const current = enabled.filter(
    (r) => r.start <= applyFrom && (!r.effectiveTo || r.effectiveTo > applyFrom),
  );
  // Rows of a pending change that starts after the change date.
  const upcoming = enabled.filter((r) => r.start > applyFrom);

  const unmatched = new Set(current.map((r) => r.id));
  const remaining: DesiredRow[] = [];

  // 1. Unchanged rows stay as they are.
  for (const d of input.desired) {
    const byId = current.find((r) => r.id === d.id && unmatched.has(r.id) && sameContent(r, d));
    const same = byId ?? current.find((r) => unmatched.has(r.id) && sameContent(r, d));
    if (!same) {
      remaining.push(d);
      continue;
    }
    unmatched.delete(same.id);
    if (same.effectiveTo) plan.patches.push({ id: same.id, changes: { effectiveTo: null } });
  }

  // 2. Pair each changed row with the row it was edited from: by id, else
  // by time order (a row edited from a pending change continues the row
  // that change replaces).
  const pairs: { desired: DesiredRow; from?: PlannedRow }[] = [];
  const unpaired: DesiredRow[] = [];
  for (const d of remaining) {
    const from = current.find((r) => r.id === d.id && unmatched.has(r.id));
    if (from) {
      unmatched.delete(from.id);
      pairs.push({ desired: d, from });
    } else {
      unpaired.push(d);
    }
  }
  const leftovers = current
    .filter((r) => unmatched.has(r.id))
    .sort((a, b) => a.time.localeCompare(b.time));
  unpaired.sort((a, b) => a.time.localeCompare(b.time));
  unpaired.forEach((d, i) => {
    const from = leftovers[i];
    if (from) unmatched.delete(from.id);
    pairs.push({ desired: d, ...(from && { from }) });
  });

  const loggedOnOrAfter = (id: string) =>
    (input.loggedDates.get(id) ?? []).filter((k) => k >= applyFrom).sort();

  /** The day the change of `row` starts, and the logs that move with it. */
  const changeDayOf = (row: PlannedRow, canMove: boolean): { day: string; moved: string[] } => {
    const logged = loggedOnOrAfter(row.id);
    if (logged.length === 0) return { day: applyFrom, moved: [] };
    if (rule === "move-logs" && canMove) return { day: applyFrom, moved: logged };
    const day = addDaysToKey(logged[logged.length - 1]!, 1);
    plan.deferred.push({ scheduleId: row.id, startsOn: day });
    return { day, moved: [] };
  };

  for (const { desired, from } of pairs) {
    const content = contentOf(desired);
    if (!from) {
      plan.inserts.push({ content, effectiveFrom: applyFrom });
      continue;
    }
    const { day, moved } = changeDayOf(from, true);
    if (from.start >= day) {
      // Never applied before the change day (a "move-logs" log on it already
      // belongs to it): nothing to keep, edit in place.
      plan.patches.push({
        id: from.id,
        changes: { ...content, ...(from.effectiveTo && { effectiveTo: null }) },
      });
      continue;
    }
    if (from.effectiveTo !== day) plan.patches.push({ id: from.id, changes: { effectiveTo: day } });
    plan.inserts.push({ content, effectiveFrom: day, replaces: from.id });
    if (moved.length > 0) {
      plan.logMoves.push({ fromScheduleId: from.id, insertIndex: plan.inserts.length - 1, dates: moved });
    }
  }

  // 3. Removed rows end at the change day. A logged dose keeps its row.
  for (const row of current) {
    if (!unmatched.has(row.id)) continue;
    const { day } = changeDayOf(row, false);
    if (row.start >= day) plan.tombstones.push(row.id);
    else if (row.effectiveTo !== day) plan.patches.push({ id: row.id, changes: { effectiveTo: day } });
  }

  // 4. A pending change is replaced by this one.
  for (const row of upcoming) plan.tombstones.push(row.id);

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

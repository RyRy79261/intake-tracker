import { db, type PhaseSchedule } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { baseSyncFields } from "@/lib/utils";
import { localHHMMStringToUTCMinutes } from "@/lib/timezone";
import { getScheduleAnchorTimezone, homeAnchorOrUndefined } from "@/lib/schedule-anchor";
import { isLive } from "@intake/core/lifecycle";
import {
  isEmptyPlan,
  isNewestRegimen,
  planScheduleChange,
  scheduleInEffectOn,
  type ChangeDayRule,
  type DesiredRow,
  type PlannedRow,
} from "@intake/core/schedule-window";
import { syncedWrite, type SyncedWriter } from "@/lib/synced-write";
import { toLocalDateKey } from "@/lib/date-utils";

/**
 * The first day a schedule applies: its "Apply from" date, else the day it
 * was added.
 */
export function scheduleStartKey(schedule: Pick<PhaseSchedule, "createdAt" | "effectiveFrom">): string {
  return schedule.effectiveFrom || toLocalDateKey(schedule.createdAt);
}

// ---------------------------------------------------------------------------
// Read functions — return T directly (throw on error)
// ---------------------------------------------------------------------------

/**
 * The phase's live schedules in effect on `dateKey` (default today): what
 * the prescription card, refill and titration views show. A row closed by an
 * "Apply from" edit, or one that starts later, is left out.
 */
export async function getSchedulesForPhase(
  phaseId: string,
  dateKey: string = toLocalDateKey(),
): Promise<PhaseSchedule[]> {
  const records = await db.phaseSchedules.where("phaseId").equals(phaseId).toArray();
  return records.filter((s) => isLive(s) && scheduleInEffectOn(s, dateKey));
}

/**
 * The phase's newest regimen: live rows that no "Apply from" edit has
 * closed, also those that start later. The edit drawer edits these.
 */
export async function getLatestSchedulesForPhase(phaseId: string): Promise<PhaseSchedule[]> {
  const records = await db.phaseSchedules.where("phaseId").equals(phaseId).toArray();
  return records.filter((s) => isLive(s) && !s.effectiveTo);
}

/**
 * The schedule changes that are saved but have not started yet. `steps`
 * lists each one in date order: the day it starts and the rows in effect
 * from that day. `until` is the rows in effect today. `undefined` when none
 * is pending on `todayKey`.
 */
export interface PendingScheduleChange {
  /** The first day a saved change starts. */
  startsOn: string;
  until: PhaseSchedule[];
  steps: { startsOn: string; schedules: PhaseSchedule[] }[];
}

export async function getPendingScheduleChange(
  phaseId: string,
  todayKey: string = toLocalDateKey(),
): Promise<PendingScheduleChange | undefined> {
  const live = (await db.phaseSchedules.where("phaseId").equals(phaseId).toArray()).filter(
    (s) => isLive(s) && s.enabled === true,
  );
  // A change starts where a row starts or ends: a removed time only ends.
  const days = [
    ...new Set(
      live
        .flatMap((s) => [s.effectiveFrom, s.effectiveTo])
        .filter((k): k is string => !!k && k > todayKey),
    ),
  ].sort();
  const startsOn = days[0];
  if (!startsOn) return undefined;
  const onDay = (key: string) =>
    live.filter((s) => scheduleStartKey(s) <= key && scheduleInEffectOn(s, key));
  return {
    startsOn,
    until: onDay(todayKey),
    steps: days.map((key) => ({ startsOn: key, schedules: onDay(key) })),
  };
}

// ---------------------------------------------------------------------------
// "Apply from" schedule change
// ---------------------------------------------------------------------------

/** The product rule for a dose already logged on the change day (see ChangeDayRule). */
export const DEFAULT_CHANGE_DAY_RULE: ChangeDayRule = "start-next-day";

export interface ScheduleChangeOptions {
  /** First day of the new regimen ("YYYY-MM-DD"). Default today. Not before today. */
  applyFrom?: string;
  rule?: ChangeDayRule;
  /**
   * The phase's unit before this edit. A closed row keeps it, so its days
   * still read "0.1 mg" after the phase moves to mcg.
   */
  closedUnit?: string;
  /** The phase's unit after this edit. A row in another unit is a changed row. */
  unit?: string;
  /**
   * Write nothing when `desired` is the newest regimen already (a drawer
   * re-saving what it shows), so a pending change keeps its date.
   */
  skipIfNewest?: boolean;
}

/**
 * The unit a row's dose is in: a row closed by an "Apply from" edit keeps
 * the unit it had (stamped when it closed); every other row follows its
 * phase. An older row's own `unit` can be stale, so it is not read.
 */
export function scheduleDoseUnit(
  schedule: Pick<PhaseSchedule, "effectiveTo" | "unit">,
  phaseUnit: string,
): string {
  return schedule.effectiveTo && schedule.unit ? schedule.unit : phaseUnit;
}

export interface ScheduleChangeOutcome {
  applyFrom: string;
  /**
   * The day the change starts, when a logged dose moved it after
   * `applyFrom` ("start-next-day"); else `undefined`.
   */
  deferredTo?: string;
  /** True when nothing was written (the schedule was already this). */
  unchanged?: boolean;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A user-action log: the dose of that day belongs to its row. */
function isLoggedDose(log: { status: string; kind?: string; deletedAt?: number | null }): boolean {
  return (
    isLive(log) &&
    log.kind !== "prn" &&
    (log.status === "taken" || log.status === "skipped" || log.status === "rescheduled")
  );
}

/**
 * Write an "Apply from" change of one phase's schedules inside an open
 * synced write (scope: phaseSchedules and doseLogs). Days before the change
 * keep their rows; see planScheduleChange for the rules. Throws for a date
 * before today: that would rewrite logged history.
 */
export async function writeScheduleChange(
  w: SyncedWriter,
  phaseId: string,
  desired: readonly DesiredRow[],
  opts: ScheduleChangeOptions = {},
): Promise<ScheduleChangeOutcome> {
  const today = toLocalDateKey(w.now);
  const applyFrom = opts.applyFrom ?? today;
  if (!DATE_KEY.test(applyFrom)) throw new Error("Pick a valid date.");
  if (applyFrom < today) throw new Error("Pick today or a later date.");
  const rule = opts.rule ?? DEFAULT_CHANGE_DAY_RULE;

  const live = (await db.phaseSchedules.where("phaseId").equals(phaseId).toArray()).filter(isLive);
  const rows: PlannedRow[] = live.map((s) => ({
    id: s.id,
    time: s.time,
    dosage: s.dosage,
    daysOfWeek: s.daysOfWeek,
    enabled: s.enabled,
    start: scheduleStartKey(s),
    ...(s.effectiveFrom && { effectiveFrom: s.effectiveFrom }),
    ...(s.effectiveTo && { effectiveTo: s.effectiveTo }),
    ...(opts.closedUnit && { unit: scheduleDoseUnit(s, opts.closedUnit) }),
  }));
  if (opts.skipIfNewest && isNewestRegimen(rows, desired, opts.unit)) {
    return { applyFrom, unchanged: true };
  }

  const loggedDates = new Map<string, string[]>();
  const logIdsBySlot = new Map<string, string[]>();
  for (const s of live) {
    const logs = await db.doseLogs
      .where("[scheduleId+scheduledDate]")
      .between([s.id, applyFrom], [s.id, "\uffff"], true, true)
      .toArray();
    for (const log of logs.filter(isLoggedDose)) {
      const dates = loggedDates.get(s.id) ?? [];
      if (!dates.includes(log.scheduledDate)) dates.push(log.scheduledDate);
      loggedDates.set(s.id, dates);
    }
    for (const log of logs.filter(isLive)) {
      const key = `${s.id}|${log.scheduledDate}`;
      logIdsBySlot.set(key, [...(logIdsBySlot.get(key) ?? []), log.id]);
    }
  }

  const plan = planScheduleChange({
    rows,
    desired,
    applyFrom,
    loggedDates,
    rule,
    ...(opts.closedUnit && opts.unit && { unit: opts.unit }),
  });
  if (isEmptyPlan(plan)) return { applyFrom, unchanged: true };
  const byId = new Map(live.map((s) => [s.id, s]));

  /** Time fields for `time` on a row continuing `prev`: re-encode only a changed time. */
  const timeFields = (time: string, prev: PhaseSchedule | undefined) => {
    if (prev && prev.time === time) {
      return { time, scheduleTimeUTC: prev.scheduleTimeUTC, anchorTimezone: prev.anchorTimezone };
    }
    // A typed time is a home time when a home zone is set, else it keeps the
    // schedule's own anchor; never the away device's zone.
    const anchor = homeAnchorOrUndefined() || prev?.anchorTimezone || getScheduleAnchorTimezone();
    return { time, scheduleTimeUTC: localHHMMStringToUTCMinutes(time, anchor), anchorTimezone: anchor };
  };

  for (const id of plan.tombstones) await w.tombstone("phaseSchedules", id);
  for (const { id, changes } of plan.patches) {
    const prev = byId.get(id);
    const { effectiveTo, time, daysOfWeek, ...rest } = changes;
    await w.patch("phaseSchedules", id, {
      ...rest,
      ...(daysOfWeek !== undefined && { daysOfWeek: [...daysOfWeek] }),
      ...(time !== undefined && (prev?.time === time ? {} : timeFields(time, prev))),
      ...(effectiveTo !== undefined && { effectiveTo: effectiveTo ?? undefined }),
      // A row keeps the unit its dose was in when it first closes. A row
      // closed again (an earlier date) already has it: the phase unit may
      // be the new one by now.
      ...(effectiveTo && opts.closedUnit && !prev?.effectiveTo && { unit: opts.closedUnit }),
    });
  }
  const insertedIds: string[] = [];
  for (const ins of plan.inserts) {
    const prev = ins.replaces ? byId.get(ins.replaces) : undefined;
    const schedule: PhaseSchedule = {
      id: crypto.randomUUID(),
      phaseId,
      ...timeFields(ins.content.time, prev),
      dosage: ins.content.dosage,
      daysOfWeek: [...ins.content.daysOfWeek],
      enabled: true,
      effectiveFrom: ins.effectiveFrom,
      ...baseSyncFields(),
    };
    await w.insert("phaseSchedules", schedule);
    insertedIds.push(schedule.id);
  }
  for (const move of plan.logMoves) {
    const to = insertedIds[move.insertIndex];
    if (!to) continue;
    for (const date of move.dates) {
      for (const logId of logIdsBySlot.get(`${move.fromScheduleId}|${date}`) ?? []) {
        await w.patch("doseLogs", logId, { scheduleId: to });
      }
    }
  }

  return { applyFrom, ...(plan.startsOn > applyFrom && { deferredTo: plan.startsOn }) };
}

// ---------------------------------------------------------------------------
// Mutation functions — keep ServiceResult with audit logging
// ---------------------------------------------------------------------------

export async function addSchedule(
  input: Omit<PhaseSchedule, "id" | "createdAt" | "updatedAt" | "deletedAt" | "deviceId" | "enabled">,
): Promise<ServiceResult<PhaseSchedule>> {
  try {
    const tz = getScheduleAnchorTimezone();
    const schedule: PhaseSchedule = {
      ...input,
      id: crypto.randomUUID(),
      enabled: true,
      scheduleTimeUTC: localHHMMStringToUTCMinutes(input.time, tz),
      anchorTimezone: tz,
      ...baseSyncFields(),
    };
    await syncedWrite(["phaseSchedules"], async (w) => {
      await w.insert("phaseSchedules", schedule);
      await w.audit("prescription_updated", {
        action: "schedule_added",
        scheduleId: schedule.id,
        phaseId: input.phaseId,
        time: input.time,
        dosage: input.dosage,
      });
    });
    return ok(schedule);
  } catch (e) {
    return err("Failed to add schedule", e);
  }
}

export async function updateSchedule(
  id: string,
  updates: Partial<Omit<PhaseSchedule, "id" | "createdAt" | "phaseId">>,
): Promise<ServiceResult<void>> {
  try {
    const { updatedAt: _ignored, ...finalUpdates } = updates;

    // If the time changed, encode it in the home zone when one is set (the
    // time the user typed is a home time), else in the schedule's own anchor.
    // Never the away device's zone: re-anchoring to it is the travel
    // prompt's job.
    if (updates.time) {
      const prev = await db.phaseSchedules.get(id);
      if (prev && prev.time === updates.time) {
        delete finalUpdates.time;
      } else {
        const anchor =
          updates.anchorTimezone ||
          homeAnchorOrUndefined() ||
          prev?.anchorTimezone ||
          getScheduleAnchorTimezone();
        finalUpdates.scheduleTimeUTC = localHHMMStringToUTCMinutes(updates.time, anchor);
        finalUpdates.anchorTimezone = anchor;
      }
    }

    await syncedWrite(["phaseSchedules"], async (w) => {
      await w.patch("phaseSchedules", id, finalUpdates);
      await w.audit("prescription_updated", {
        action: "schedule_updated",
        scheduleId: id,
        updatedFields: Object.keys(updates),
      });
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to update schedule", e);
  }
}

export async function deleteSchedule(id: string): Promise<ServiceResult<void>> {
  try {
    await syncedWrite(["phaseSchedules"], async (w) => {
      const schedule = await db.phaseSchedules.get(id);
      if (!schedule) throw new Error("Schedule not found");
      await w.tombstone("phaseSchedules", schedule.id);
      await w.audit("prescription_updated", {
        action: "schedule_deleted",
        scheduleId: id,
      });
    });
    return ok(undefined);
  } catch (e) {
    return err("Failed to delete schedule", e);
  }
}

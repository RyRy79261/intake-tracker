/**
 * Timezone recalculation service.
 *
 * When the user travels between timezones, this re-anchors the live
 * PhaseSchedule records to the new zone so wall-clock dose times are
 * preserved (D-01).
 *
 * `time` in `anchorTimezone` is the canonical dose time. Recalculation never
 * decodes `scheduleTimeUTC` back into `time`: that cache bakes in the offset
 * of the day it was written, so decoding it after a DST change would store a
 * time an hour off as the user's intended time.
 */

import { isLive } from "@intake/core/lifecycle";
import {
  db,
  type MedicationPhase,
  type PhaseSchedule,
  type Prescription,
} from "@/lib/db";
import {
  localHHMMStringToUTCMinutes,
  resolveScheduleLocalTime,
  scheduleWallClock,
} from "@/lib/timezone";
import { toLocalDateKey } from "@/lib/date-utils";
import { buildAuditEntry } from "@/lib/audit-service";
import { enqueueInsideTx } from "@/lib/sync-queue";
import { schedulePush } from "@/lib/sync-engine";

// ---------------------------------------------------------------------------
// Which schedules travel
// ---------------------------------------------------------------------------

/** Phase statuses whose schedules still drive (or will drive) doses. */
const TRAVEL_PHASE_STATUSES: ReadonlySet<string> = new Set(["active", "pending"]);

export interface TravelSchedule {
  schedule: PhaseSchedule;
  phase: MedicationPhase;
  prescription: Prescription | undefined;
}

/**
 * Enabled, live schedules of live active/pending phases. Tombstones and the
 * schedules of completed or deleted phases never raise the travel prompt and
 * are never rewritten (gap-timezone-travel-recalc#6).
 */
async function loadTravelSchedules(): Promise<TravelSchedule[]> {
  const [phases, schedules, prescriptions] = await Promise.all([
    db.medicationPhases.toArray(),
    db.phaseSchedules.toArray(),
    db.prescriptions.toArray(),
  ]);
  const phaseById = new Map(
    phases
      .filter((p) => isLive(p) && TRAVEL_PHASE_STATUSES.has(p.status))
      .map((p) => [p.id, p]),
  );
  const prescriptionById = new Map(prescriptions.map((p) => [p.id, p]));

  const result: TravelSchedule[] = [];
  for (const schedule of schedules) {
    if (schedule.enabled !== true || !isLive(schedule)) continue;
    const phase = phaseById.get(schedule.phaseId);
    if (!phase) continue;
    result.push({ schedule, phase, prescription: prescriptionById.get(phase.prescriptionId) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** True when at least one schedule is subject to travel adjustment. */
export async function hasTravelSchedules(): Promise<boolean> {
  return (await loadTravelSchedules()).length > 0;
}

export interface TimezoneAnchorDose {
  scheduleId: string;
  name: string;
  /** "HH:MM" the dose list shows on this device today, before adjusting. */
  before: string;
  /** "HH:MM" on this device after adjusting (the unchanged wall clock). */
  after: string;
}

export interface TimezoneAnchorGroup {
  anchorTimezone: string;
  doses: TimezoneAnchorDose[];
}

/**
 * Every distinct anchor zone of a travel-relevant schedule that differs from
 * `deviceTz`, with each dose's before/after time on this device. Anchors in
 * `dismissedAnchors` (the user chose "Not now" for them) are left out. An
 * empty result means there is nothing to prompt for.
 */
export async function findMismatchedAnchors(
  deviceTz: string,
  dismissedAnchors: ReadonlySet<string> = new Set(),
): Promise<TimezoneAnchorGroup[]> {
  const today = toLocalDateKey();
  const groups = new Map<string, TimezoneAnchorDose[]>();

  for (const { schedule, prescription } of await loadTravelSchedules()) {
    const anchor = schedule.anchorTimezone;
    if (anchor === deviceTz || dismissedAnchors.has(anchor)) continue;

    const dose: TimezoneAnchorDose = {
      scheduleId: schedule.id,
      name: prescription?.genericName ?? "Medication",
      before: resolveScheduleLocalTime(schedule, today, deviceTz),
      after: scheduleWallClock(schedule),
    };
    const bucket = groups.get(anchor);
    if (bucket) bucket.push(dose);
    else groups.set(anchor, [dose]);
  }

  return Array.from(groups, ([anchorTimezone, doses]) => ({
    anchorTimezone,
    doses: doses.sort((a, b) => a.after.localeCompare(b.after)),
  }));
}

// ---------------------------------------------------------------------------
// Recalculation
// ---------------------------------------------------------------------------

/**
 * Re-anchor every travel-relevant schedule to `newTimezone`, keeping its
 * wall-clock time.
 *
 * Per D-01: Wall-clock times are preserved. 08:00 stays 08:00.
 * Per D-02: anchorTimezone is updated to the new timezone.
 * Per D-03: Only PhaseSchedule records are modified -- dose logs are untouched.
 *
 * `time` is kept as-is and `scheduleTimeUTC` is recomputed from it; the UTC
 * cache is never decoded back into `time` (gap-timezone-travel-recalc#0).
 *
 * @param newTimezone - The IANA timezone string to recalculate for
 * @returns The number of schedules that were updated
 */
export async function recalculateScheduleTimezones(
  newTimezone: string,
): Promise<number> {
  let updatedCount = 0;

  await db.transaction(
    "rw",
    [db.phaseSchedules, db.medicationPhases, db.prescriptions, db.auditLogs, db._syncQueue],
    async () => {
      const toMove = (await loadTravelSchedules()).filter(
        ({ schedule }) => schedule.anchorTimezone !== newTimezone,
      );

      for (const { schedule } of toMove) {
        const time = scheduleWallClock(schedule);
        await db.phaseSchedules.update(schedule.id, {
          time,
          scheduleTimeUTC: localHHMMStringToUTCMinutes(time, newTimezone),
          anchorTimezone: newTimezone,
          updatedAt: Date.now(),
        });
        await enqueueInsideTx("phaseSchedules", schedule.id, "upsert");

        updatedCount++;
      }

      if (updatedCount > 0) {
        const auditEntry = buildAuditEntry("timezone_adjusted", {
          newTimezone,
          schedulesUpdated: updatedCount,
        });
        await db.auditLogs.add(auditEntry);
        await enqueueInsideTx("auditLogs", auditEntry.id, "upsert");
      }
    },
  );

  if (updatedCount > 0) {
    schedulePush();
  }

  return updatedCount;
}

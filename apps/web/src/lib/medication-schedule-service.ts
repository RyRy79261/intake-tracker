import { db, type PhaseSchedule } from "@/lib/db";
import { ok, err } from "@intake/core/service";
import type { ServiceResult } from "@intake/types/service";
import { baseSyncFields } from "@/lib/utils";
import { localHHMMStringToUTCMinutes } from "@/lib/timezone";
import { getScheduleAnchorTimezone, homeAnchorOrUndefined } from "@/lib/schedule-anchor";
import { isLive } from "@intake/core/lifecycle";
import { syncedWrite } from "@/lib/synced-write";

// ---------------------------------------------------------------------------
// Read functions — return T directly (throw on error)
// ---------------------------------------------------------------------------

export async function getSchedulesForPhase(phaseId: string): Promise<PhaseSchedule[]> {
  const records = await db.phaseSchedules.where("phaseId").equals(phaseId).toArray();
  return records.filter(isLive);
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

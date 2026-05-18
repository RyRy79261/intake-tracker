/**
 * Timezone recalculation service.
 *
 * When the user travels between timezones, this recalculates all active
 * PhaseSchedule records to preserve wall-clock dose times (D-01).
 */

import { db } from "./db";
import { utcMinutesToLocalTime, localTimeToUTCMinutes } from "./timezone";
import { buildAuditEntry } from "./audit-service";
import { enqueueInsideTx } from "./sync-queue";
import { schedulePush } from "./sync-engine";

/**
 * Recalculate scheduleTimeUTC for all active (enabled) PhaseSchedule records
 * to preserve wall-clock times in the new timezone.
 *
 * Per D-01: Wall-clock times are preserved. 08:00 stays 08:00.
 * Per D-02: anchorTimezone is updated to the new timezone.
 * Per D-03: Only PhaseSchedule records are modified -- dose logs are untouched.
 *
 * @param newTimezone - The IANA timezone string to recalculate for
 * @returns The number of schedules that were updated
 */
export async function recalculateScheduleTimezones(
  newTimezone: string,
): Promise<number> {
  let updatedCount = 0;

  await db.transaction("rw", [db.phaseSchedules, db.auditLogs, db._syncQueue], async () => {
    const allSchedules = await db.phaseSchedules.toArray();
    const activeSchedules = allSchedules.filter(
      (s) => s.enabled === true && s.anchorTimezone !== newTimezone,
    );

    for (const schedule of activeSchedules) {
      const { hours, minutes } = utcMinutesToLocalTime(
        schedule.scheduleTimeUTC,
        schedule.anchorTimezone,
      );

      const newUTC = localTimeToUTCMinutes(hours, minutes, newTimezone);

      const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

      await db.phaseSchedules.update(schedule.id, {
        scheduleTimeUTC: newUTC,
        anchorTimezone: newTimezone,
        time: timeStr,
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
  });

  if (updatedCount > 0) {
    schedulePush();
  }

  return updatedCount;
}

/**
 * Timezone recalculation service.
 *
 * When the user travels between timezones, this recalculates all active
 * PhaseSchedule records to preserve wall-clock dose times (D-01).
 */

import { db } from "./db";
import { utcMinutesToLocalTime, localTimeToUTCMinutes } from "./timezone";
import { buildAuditEntry } from "./audit-service";

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

  await db.transaction("rw", [db.phaseSchedules, db.auditLogs], async () => {
    const allSchedules = await db.phaseSchedules.toArray();
    const activeSchedules = allSchedules.filter(
      (s) => s.enabled === true && s.anchorTimezone !== newTimezone,
    );

    for (const schedule of activeSchedules) {
      // Step 1: Convert stored UTC minutes back to local HH:MM using OLD timezone
      const { hours, minutes } = utcMinutesToLocalTime(
        schedule.scheduleTimeUTC,
        schedule.anchorTimezone,
      );

      // Step 2: Convert that same local HH:MM to UTC minutes using NEW timezone
      const newUTC = localTimeToUTCMinutes(hours, minutes, newTimezone);

      // Step 3: Build the local time string for the deprecated `time` field
      const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

      // Step 4: Update the schedule
      await db.phaseSchedules.update(schedule.id, {
        scheduleTimeUTC: newUTC,
        anchorTimezone: newTimezone,
        time: timeStr,
        updatedAt: Date.now(),
      });

      updatedCount++;
    }

    if (updatedCount > 0) {
      await db.auditLogs.add(
        buildAuditEntry("timezone_adjusted", {
          newTimezone,
          schedulesUpdated: updatedCount,
        }),
      );
    }
  });

  return updatedCount;
}

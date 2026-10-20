/**
 * Reading a scheduled dose's log: which log stands for a slot, and when a
 * rescheduled dose reminds. Shared by the dose services, the Today screen
 * and the reminder builder (no write code, so the builder can use it
 * without an import cycle).
 */
import type { DoseLog, DoseStatus } from "@/lib/db";
import { isLive } from "@intake/core/lifecycle";
import { getDeviceTimezone, zonedWallClockToInstant } from "@/lib/timezone";

const SLOT_LOG_RANK: Record<DoseStatus, number> = {
  taken: 3,
  skipped: 2,
  rescheduled: 1,
  pending: 0,
};

/**
 * Pick THE log for one dose slot out of every log stored for it. Older builds
 * (and two offline devices) could leave several live logs for one slot, so the
 * choice must not depend on IndexedDB iteration order: the strongest status
 * wins, then the newest write, then the larger id.
 */
export function selectSlotLog(logs: readonly DoseLog[]): DoseLog | undefined {
  let best: DoseLog | undefined;
  for (const log of logs) {
    if (!isLive(log) || log.kind === "prn") continue;
    if (!best) {
      best = log;
      continue;
    }
    const byRank = SLOT_LOG_RANK[log.status] - SLOT_LOG_RANK[best.status];
    if (
      byRank > 0 ||
      (byRank === 0 && log.updatedAt > best.updatedAt) ||
      (byRank === 0 && log.updatedAt === best.updatedAt && log.id > best.id)
    ) {
      best = log;
    }
  }
  return best;
}

/**
 * The reminder instant of a rescheduled log. A log written by an older
 * build has only `rescheduledTo` ("HH:MM" on the device's clock, no date):
 * it is converted when its day is today or later, on the next day when that
 * time is before the scheduled one (the old picker had no date). A past
 * legacy log is ignored and follows the past-day rule.
 */
export function effectiveRemindAt(
  log: Pick<DoseLog, "status" | "remindAt" | "rescheduledTo" | "scheduledDate" | "timezone"> | undefined,
  scheduledAt: number,
  todayStr: string,
  deviceTz: string = getDeviceTimezone(),
): number | undefined {
  if (log?.status !== "rescheduled") return undefined;
  if (log.remindAt != null && Number.isFinite(log.remindAt)) return log.remindAt;
  if (!log.rescheduledTo || log.scheduledDate < todayStr) return undefined;
  let instant: number | null;
  try {
    instant = zonedWallClockToInstant(log.scheduledDate, log.rescheduledTo, log.timezone || deviceTz);
  } catch {
    instant = zonedWallClockToInstant(log.scheduledDate, log.rescheduledTo, deviceTz);
  }
  if (instant === null) return undefined;
  return instant < scheduledAt ? instant + 24 * 60 * 60 * 1000 : instant;
}

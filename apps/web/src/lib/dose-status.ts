/**
 * The one rule for what state a scheduled dose is in.
 *
 * Owner decision (live-data-forensics#7): a scheduled dose on a PAST day with
 * no taken/skipped log counts as MISSED, until the user updates it (take,
 * skip or edit). A "pending" log (an untaken dose) and a "rescheduled" one
 * (still owed, at its new time) are outstanding too, so the date decides.
 * Today's and future outstanding doses are pending, never missed.
 *
 * One exception: a dose rescheduled from an earlier day is not missed while
 * the reminder period after its `remindAt` has not ended (it waits in "Moved
 * to today"). The period here is the default, not the device setting, so
 * history (export, MCP on the server) does not change with a setting.
 *
 * The schedule view, analytics adherence, export, MCP tools and the insights
 * snapshot all resolve slots through this, so they agree. Pure (no Dexie),
 * so server code can use it too.
 */

import { isRescheduleWaiting } from "@intake/core/dose-rules";

export type ResolvedDoseStatus = "taken" | "skipped" | "pending" | "missed";

/** The carried-over exception: a rescheduled dose and the time to judge it at. */
export interface RescheduleContext {
  remindAt?: number | null | undefined;
  now: number;
}

/**
 * @param logStatus the slot's dose-log status, or null/undefined when unlogged
 * @param scheduledDate the slot's local calendar day (YYYY-MM-DD)
 * @param todayKey today's local calendar day (YYYY-MM-DD)
 * @param reschedule the log's `remindAt` and now, for the carried-over exception
 */
export function resolveDoseStatus(
  logStatus: string | null | undefined,
  scheduledDate: string,
  todayKey: string,
  reschedule?: RescheduleContext,
): ResolvedDoseStatus {
  if (logStatus === "taken") return "taken";
  if (logStatus === "skipped") return "skipped";
  // A rescheduled dose is judged by its new time, whatever its own day
  // (it can move to an earlier day, so this comes before the date rule).
  if (logStatus === "rescheduled" && reschedule?.remindAt != null && Number.isFinite(reschedule.remindAt)) {
    return isRescheduleWaiting(logStatus, reschedule.remindAt, reschedule.now) ? "pending" : "missed";
  }
  if (scheduledDate >= todayKey) return "pending";
  return "missed";
}

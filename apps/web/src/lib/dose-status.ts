/**
 * The one rule for what state a scheduled dose is in.
 *
 * Owner decision (live-data-forensics#7): a scheduled dose on a PAST day with
 * no taken/skipped log counts as MISSED, until the user updates it (take,
 * skip or edit). A "pending" log (an untaken dose) and a "rescheduled" one
 * (still owed, at its new time) are outstanding too, so the date decides.
 * Today's and future outstanding doses are pending, never missed.
 *
 * The schedule view, analytics adherence, export, MCP tools and the insights
 * snapshot all resolve slots through this, so they agree. Pure (no Dexie),
 * so server code can use it too.
 */

export type ResolvedDoseStatus = "taken" | "skipped" | "pending" | "missed";

/**
 * @param logStatus the slot's dose-log status, or null/undefined when unlogged
 * @param scheduledDate the slot's local calendar day (YYYY-MM-DD)
 * @param todayKey today's local calendar day (YYYY-MM-DD)
 */
export function resolveDoseStatus(
  logStatus: string | null | undefined,
  scheduledDate: string,
  todayKey: string,
): ResolvedDoseStatus {
  if (logStatus === "taken") return "taken";
  if (logStatus === "skipped") return "skipped";
  return scheduledDate < todayKey ? "missed" : "pending";
}

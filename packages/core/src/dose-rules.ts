/**
 * The rules for one scheduled dose on the Today screen: when Take asks for
 * the time taken, when an open dose becomes Missed, which buttons a slot
 * shows, and which doses a bulk action changes.
 *
 * Pure: every rule takes `now` and the settings as arguments. Times are
 * instants (epoch ms), never minutes of the day, so a dose near midnight
 * compares correctly with a tap after midnight.
 */

/** "Always ask": the late window is 0 minutes. */
export const LATE_WINDOW_ALWAYS = 0;
/** "Never ask": Take always records the current time. */
export const LATE_WINDOW_NEVER = -1;
export const DEFAULT_LATE_WINDOW_MINUTES = 40;
export const LATE_WINDOW_OPTIONS = [15, 30, 40, 45, 60, 90, 120] as const;

export const DEFAULT_REMINDER_PERIOD_MINUTES = 30;
export const REMINDER_PERIOD_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120] as const;

const MINUTE_MS = 60_000;

/** Whole minutes from `from` to `to` (negative when `to` is earlier). */
function minutesBetween(from: number, to: number): number {
  return Math.floor((to - from) / MINUTE_MS);
}

/** True when a late-window value is one the setting can hold. */
export function isLateWindowMinutes(value: unknown): value is number {
  return (
    value === LATE_WINDOW_ALWAYS ||
    value === LATE_WINDOW_NEVER ||
    (LATE_WINDOW_OPTIONS as readonly unknown[]).includes(value)
  );
}

/** True when a reminder-period value is one the setting can hold. */
export function isReminderPeriodMinutes(value: unknown): value is number {
  return (REMINDER_PERIOD_OPTIONS as readonly unknown[]).includes(value);
}

/**
 * Whether Take must ask "When did you take your meds?". It asks only when
 * the tap is more than `lateWindowMinutes` whole minutes after the dose was
 * due. An early tap never asks. With the default 40 minutes, an 08:30 dose
 * asks from 09:11. `LATE_WINDOW_ALWAYS` asks from 08:31;
 * `LATE_WINDOW_NEVER` never asks.
 */
export function needsTakenTimePrompt(
  dueAt: number,
  now: number,
  lateWindowMinutes: number,
): boolean {
  if (lateWindowMinutes < 0) return false;
  return minutesBetween(dueAt, now) > lateWindowMinutes;
}

/** A dose's state as the Today screen shows it. */
export type LiveDoseStatus = "taken" | "skipped" | "pending" | "missed";

/**
 * The live state of a scheduled dose. Taken and skipped come only from the
 * user's log. A dose with no such log is open; it becomes Missed when the
 * reminder period after its due instant has ended (an 08:30 dose with the
 * default 30 minutes is missed from 09:01). Missed is derived from time and
 * never written, so it stays missed until the user marks the dose.
 */
export function resolveLiveDoseStatus(
  logStatus: string | null | undefined,
  dueAt: number,
  now: number,
  reminderPeriodMinutes: number,
): LiveDoseStatus {
  if (logStatus === "taken") return "taken";
  if (logStatus === "skipped") return "skipped";
  return minutesBetween(dueAt, now) > Math.max(0, reminderPeriodMinutes) ? "missed" : "pending";
}

/** True for a dose with no final user action: it can still be taken or skipped. */
export function isOpenDoseStatus(status: string): boolean {
  return status !== "taken" && status !== "skipped";
}

/**
 * How many repeat reminders follow the first one: one every
 * `intervalMinutes` while it is still inside the reminder period. With the
 * defaults (10 and 30) an 08:30 dose is reminded at 08:40, 08:50 and 09:00.
 */
export function reminderRepeatCount(intervalMinutes: number, periodMinutes: number): number {
  if (!(intervalMinutes > 0) || !(periodMinutes > 0)) return 0;
  return Math.floor(periodMinutes / intervalMinutes);
}

export type BulkDoseAction = "take" | "skip" | "untake" | "unskip" | "reschedule";

/**
 * The doses a bulk action changes. Take all, Skip all and Reschedule
 * change only the open doses: a dose the user already took or skipped is never overridden.
 * Untake all changes the taken doses; Unskip all the skipped ones.
 */
export function bulkDoseTargets<T extends { status: string }>(
  doses: readonly T[],
  action: BulkDoseAction,
): T[] {
  switch (action) {
    case "take":
    case "skip":
    case "reschedule":
      return doses.filter((d) => isOpenDoseStatus(d.status));
    case "untake":
      return doses.filter((d) => d.status === "taken");
    case "unskip":
      return doses.filter((d) => d.status === "skipped");
  }
}

export type SlotDay = "past" | "today" | "future";

/** The buttons of the "Mark all doses" modal for one slot. */
export interface SlotActions {
  skipAll: boolean;
  unskipAll: boolean;
  takeAll: boolean;
  /**
   * "primary": in the action bar, in place of Take all (no dose is open).
   * "secondary": a text button above the bar (some doses are still open).
   */
  untakeAll: "primary" | "secondary" | false;
  reschedule: boolean;
}

/**
 * Which bulk buttons a slot shows. A future day can only be rescheduled:
 * its doses cannot be taken or skipped yet. Reschedule shows while at least
 * one dose is open (a rescheduled dose is still open).
 */
export function slotActions(
  doses: readonly { status: string }[],
  day: SlotDay,
): SlotActions {
  const open = doses.filter((d) => isOpenDoseStatus(d.status)).length;
  const taken = doses.filter((d) => d.status === "taken").length;
  const skipped = doses.filter((d) => d.status === "skipped").length;
  const markable = day !== "future";
  return {
    skipAll: markable && open > 0,
    unskipAll: markable && open === 0 && skipped > 0,
    takeAll: markable && open > 0,
    untakeAll: !markable || taken === 0 ? false : open === 0 ? "primary" : "secondary",
    reschedule: open > 0,
  };
}

// ---------------------------------------------------------------------------
// Rescheduling
// ---------------------------------------------------------------------------

/**
 * When a dose is due: its reminder instant while it is rescheduled, else its
 * scheduled instant. `remindAt` counts only while the status is
 * "rescheduled"; on a taken, skipped or pending log it is history.
 */
export function dueInstant(
  log: { status?: string | null; remindAt?: number | null } | null | undefined,
  scheduledAt: number,
): number {
  return log?.status === "rescheduled" && log.remindAt != null && Number.isFinite(log.remindAt)
    ? log.remindAt
    : scheduledAt;
}

/**
 * The status a dose goes back to when the user reverses a take or a skip:
 * "rescheduled" while its reminder instant is still ahead, else "pending"
 * (the missed rule then applies from the original time).
 */
export function reopenedStatus(
  remindAt: number | null | undefined,
  now: number,
): "rescheduled" | "pending" {
  return remindAt != null && remindAt > now ? "rescheduled" : "pending";
}

/** A reason to look again at a new reminder time. A warning never blocks the save. */
export type RescheduleWarning =
  | { kind: "past" }
  | { kind: "after-next-dose"; nextDoseAt: number };

/**
 * The warnings for a new reminder instant. There is no time limit: any
 * instant can be saved. "past": the instant is not after now (the reminder
 * fires at once). "after-next-dose": the instant is at or after the next
 * scheduled dose of the same medicine, so the user could take two doses
 * close together.
 */
export function rescheduleWarnings(
  newAt: number,
  now: number,
  nextDoseAt?: number | null,
): RescheduleWarning[] {
  const out: RescheduleWarning[] = [];
  if (newAt <= now) out.push({ kind: "past" });
  if (nextDoseAt != null && newAt >= nextDoseAt) out.push({ kind: "after-next-dose", nextDoseAt });
  return out;
}

/**
 * True while a rescheduled dose of an earlier day is still waiting: its
 * reminder period after `remindAt` has not ended. Such a dose is not missed
 * yet, also on a past day (the "From earlier days" group).
 */
export function isRescheduleWaiting(
  logStatus: string | null | undefined,
  remindAt: number | null | undefined,
  now: number,
  reminderPeriodMinutes: number = DEFAULT_REMINDER_PERIOD_MINUTES,
): boolean {
  if (logStatus !== "rescheduled" || remindAt == null || !Number.isFinite(remindAt)) return false;
  return minutesBetween(remindAt, now) <= Math.max(0, reminderPeriodMinutes);
}

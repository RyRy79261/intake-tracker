import type { DoseSlot } from "@/lib/dose-schedule-service";
import type { InventoryItem, MedicationPhase } from "@/lib/db";
import { isCleanFraction } from "@/lib/dose-log-service";
import { formatClockTime, formatTimeOnly, toLocalDateKey } from "@/lib/date-utils";
import {
  isCombo,
  isValidPillStrength,
  scaleCompounds,
  formatCompoundShort,
} from "@intake/core/compound";

/**
 * The maintenance ("baseline") phase for a prescription — what the Rx says when
 * no titration is running. Prefers the active one, falls back to any.
 */
export function getMaintenancePhase(
  phases: MedicationPhase[],
): MedicationPhase | undefined {
  return (
    phases.find((p) => p.type === "maintenance" && p.status === "active") ??
    phases.find((p) => p.type === "maintenance")
  );
}

/** An active titration phase that belongs to a titration plan, if one is running. */
export function getActiveTitrationPhase(
  phases: MedicationPhase[],
): MedicationPhase | undefined {
  return phases.find(
    (p) =>
      p.type === "titration" && p.status === "active" && !!p.titrationPlanId,
  );
}

/** A titration phase that is planned but not yet running. */
export function getPendingTitrationPhase(
  phases: MedicationPhase[],
): MedicationPhase | undefined {
  return phases.find(
    (p) =>
      p.type === "titration" && p.status === "pending" && !!p.titrationPlanId,
  );
}

/**
 * The phase that actually governs dosing right now. An active titration
 * overrides maintenance — mirrors the logic in dose-schedule-service so the UI
 * never shows a schedule that contradicts the day's real doses.
 */
export function getEffectivePhase(
  phases: MedicationPhase[],
): MedicationPhase | undefined {
  return (
    getActiveTitrationPhase(phases) ??
    getMaintenancePhase(phases) ??
    phases.find((p) => p.status === "active")
  );
}

const FRACTION_GLYPHS: Record<string, string> = {
  "0.25": "\u00BC",
  "0.5": "\u00BD",
  "0.75": "\u00BE",
};

/**
 * Convert a pill count to a human-readable string, e.g. "1 ½ tablets",
 * "-2 ¼ pills", "1.33 tablets". Quarters use Unicode fraction glyphs; any
 * other fraction falls back to a single two-decimal number. Negative stock
 * keeps its sign and whole part. `noun` lets stock displays say "pills".
 */
export function formatPillCount(pills: number, noun = "tablet"): string {
  if (!Number.isFinite(pills)) return `? ${noun}s`;

  // Round to hundredths first so 2.996 carries into the whole part (3) and
  // float noise like 12.0001 collapses to 12.
  const abs = Math.round(Math.abs(pills) * 100) / 100;
  const sign = pills < 0 && abs > 0 ? "-" : "";
  const whole = Math.floor(abs);
  const frac = Math.round((abs - whole) * 100) / 100;
  const glyph = FRACTION_GLYPHS[String(frac)];

  let amount: string;
  if (frac === 0) amount = String(whole);
  else if (glyph) amount = whole > 0 ? `${whole} ${glyph}` : glyph;
  else amount = String(abs);

  const singular = abs === 1 || (whole === 0 && glyph !== undefined);
  return `${sign}${amount} ${noun}${singular ? "" : "s"}`;
}

/**
 * Human-readable amount for one dose slot: the tablet count, the per-tablet
 * strength after "of", and the total when it isn't exactly one tablet — e.g.
 * "2 tablets of 100mg (= 200mg)" or, for a combination brand,
 * "2 tablets of 24/26mg (= 48/52mg)". With no stocked brand to count tablets
 * against, the summed dose is shown on its own (never an invented split).
 * Doses that don't break into whole, half, third or quarter tablets are
 * flagged "uneven split"; a brand with no usable tablet strength is flagged
 * instead of being counted as 0 tablets.
 */
export function formatDoseAmount(slot: DoseSlot): string {
  const { dosageMg, unit, pillsPerDose, inventory } = slot;

  if (slot.inventoryWarning === "invalid_strength") {
    return `${dosageMg}${unit} · tablet strength missing`;
  }
  if (!inventory || pillsPerDose == null || !Number.isFinite(pillsPerDose) || pillsPerDose <= 0) {
    return `${dosageMg}${unit}`;
  }

  const count = formatPillCount(pillsPerDose);
  let perPill: string;
  let total: string;
  if (isCombo(inventory)) {
    perPill = formatCompoundShort(inventory.compounds, unit);
    total = formatCompoundShort(scaleCompounds(inventory.compounds, pillsPerDose), unit);
  } else {
    perPill = `${inventory.strength}${inventory.unit || unit}`;
    total = `${dosageMg}${unit}`;
  }
  const label = pillsPerDose === 1
    ? `${count} of ${perPill}`
    : `${count} of ${perPill} (= ${total})`;
  return isCleanFraction(pillsPerDose) ? label : `${label} \u00B7 uneven split`;
}

/**
 * Pill maths for a dose that is not on the schedule (an extra dose): how many
 * tablets of `brand` it is, labelled like `formatDoseAmount` ("2 tablets of
 * 50mg (= 100mg)"). `pills` is undefined when there is nothing to deduct from:
 * no brand, an unusable tablet strength or a dose that isn't above zero —
 * the same cases `logPrnDose` skips the stock write for.
 */
export function describeBrandDose(
  doseMg: number,
  unit: string,
  brand: Pick<InventoryItem, "strength" | "unit" | "compounds"> | null | undefined,
): { label: string; pills: number | undefined } {
  const valid = Number.isFinite(doseMg) && doseMg > 0;
  if (!brand || !valid || !isValidPillStrength(brand.strength)) {
    return { label: valid ? `${doseMg}${unit}` : "", pills: undefined };
  }
  const pills = Math.round((doseMg / brand.strength) * 10000) / 10000;
  const count = formatPillCount(pills);
  let perPill: string;
  let total: string;
  if (isCombo(brand)) {
    perPill = formatCompoundShort(brand.compounds, unit);
    total = formatCompoundShort(scaleCompounds(brand.compounds, pills), unit);
  } else {
    perPill = `${brand.strength}${brand.unit || unit}`;
    total = `${doseMg}${unit}`;
  }
  const label = pills === 1 ? `${count} of ${perPill}` : `${count} of ${perPill} (= ${total})`;
  return { label: isCleanFraction(pills) ? label : `${label} · uneven split`, pills };
}

/**
 * Undo-toast description after a take: the pills deducted, in the same format
 * as the dose label. A brand with an unusable tablet strength is not deducted
 * (see calculatePillsConsumed), so the toast must not claim it was.
 */
export function formatTakeToastDescription(slot: DoseSlot): string {
  if (!slot.inventory) return "Dose logged. No stock tracked.";
  if (slot.inventoryWarning === "invalid_strength" || slot.pillsPerDose == null) {
    return "Dose logged. Tablet strength missing, so stock did not change.";
  }
  return `${formatPillCount(slot.pillsPerDose)} deducted`;
}

/**
 * Whole days a stock lasts at `dailyPills` a day. Clamped at 0: negative stock
 * is over-consumed, not "-4 days". Infinity when nothing is consumed.
 */
export function daysOfSupply(stock: number, dailyPills: number): number {
  if (!Number.isFinite(dailyPills) || dailyPills <= 0) return Infinity;
  if (!Number.isFinite(stock) || stock <= 0) return 0;
  return Math.floor(stock / dailyPills);
}

/**
 * Refill-alert phrasing for a stock level, e.g. "10 pills left (~5 days)", or
 * "Out of stock (7 pills over)" once stock is zero or negative.
 */
export function formatSupplyRemaining(stock: number, daysLeft: number): string {
  if (stock < 0) return `Out of stock (${formatPillCount(-stock, "pill")} over)`;
  if (stock === 0) return "Out of stock";
  const left = `${formatPillCount(stock, "pill")} left`;
  return Number.isFinite(daysLeft) ? `${left} (~${daysLeft} days)` : left;
}

/**
 * Average daily dose across a week, weighting each schedule by the weekdays it
 * runs — the same basis as the refill estimates. 100mg daily plus 100mg
 * Mon/Wed/Fri averages ~142.86mg/day, not 200.
 */
export function averageDailyDosage(
  schedules: ReadonlyArray<{ dosage: number; daysOfWeek: readonly number[] }>,
): number {
  const total = schedules.reduce((acc, s) => acc + s.dosage * (s.daysOfWeek.length / 7), 0);
  return Math.round(total * 100) / 100;
}

/** Current wall-clock time as a zero-padded 24-hour "HH:MM" string. */
export function getCurrentTimeHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * Haptic feedback for taking a dose.
 */
export function hapticTake(): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(50);
  }
}

/**
 * Haptic feedback for skipping a dose.
 */
export function hapticSkip(): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([30, 50, 30]);
  }
}

/**
 * Compute progress from a DoseSlot array.
 * Counts every scheduled slot for the day so the total reflects the full
 * daily dose count regardless of notification batching or time of day.
 */
export function computeProgress(slots: DoseSlot[]): {
  total: number;
  taken: number;
  skipped: number;
  pending: number;
  pct: number;
  allDone: boolean;
} {
  let total = 0;
  let taken = 0;
  let skipped = 0;
  let pending = 0;

  for (const slot of slots) {
    total++;
    if (slot.status === "taken") taken++;
    else if (slot.status === "skipped") skipped++;
    else pending++;
  }

  const handled = taken + skipped;
  const pct = total > 0 ? Math.round((handled / total) * 100) : 0;
  const allDone = total > 0 && pending === 0;

  return { total, taken, skipped, pending, pct, allDone };
}

// ---------------------------------------------------------------------------
// Time format and labels for the medication screens
// ---------------------------------------------------------------------------

/**
 * A dose time ("08:30") in the user's Time format setting. The one helper
 * for every medication surface, so rows, headers and sheets agree.
 */
export function formatDoseTime(hhmm: string): string {
  return formatClockTime(hhmm);
}

/** The clock time of an instant in the user's Time format ("08:32"). */
export function formatDoseInstant(timestamp: number): string {
  return formatTimeOnly(timestamp);
}

/** "Oct 18" for an instant. */
function shortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Sunday, Oct 18" for a "YYYY-MM-DD" key. */
export function formatDoseDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

/**
 * The name the owner sees on the box: the active brand, else the generic
 * name (the reminders use the same rule).
 */
export function doseDisplayName(slot: Pick<DoseSlot, "inventory" | "prescription">): string {
  return slot.inventory?.brandName?.trim() || slot.prescription.genericName;
}

/** "100 mg · 1 tablet · with food": the dose and the food instruction. */
export function formatDoseLine(slot: DoseSlot): string {
  const food = slot.phase.foodInstruction;
  const parts = [formatDoseAmount(slot)];
  if (food === "before") parts.push("before food");
  else if (food === "after") parts.push("with food");
  return parts.join(" · ");
}

/**
 * "Taken at 08:32", or "Taken at 08:32, Oct 18" when the dose was taken on
 * another day than its own.
 */
export function formatTakenAt(timestamp: number, doseDate: string): string {
  const day = toLocalDateKey(timestamp);
  return day === doseDate
    ? `Taken at ${formatDoseInstant(timestamp)}`
    : `Taken at ${formatDoseInstant(timestamp)}, ${shortDate(timestamp)}`;
}

/**
 * The day after a reminder time, when it is not the dose's own day:
 * ", today", ", tomorrow" or ", Oct 22". Empty on the dose's own day.
 */
export function rescheduleDaySuffix(at: number, doseDate: string, now: number = Date.now()): string {
  const day = toLocalDateKey(at);
  if (day === doseDate) return "";
  const today = toLocalDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (day === today) return ", today";
  if (day === toLocalDateKey(tomorrow)) return ", tomorrow";
  return `, ${shortDate(at)}`;
}

/** "10:00", or "00:30, tomorrow" when the time is on another day than the dose. */
export function formatRescheduleTime(at: number, doseDate: string, now: number = Date.now()): string {
  return `${formatDoseInstant(at)}${rescheduleDaySuffix(at, doseDate, now)}`;
}

/** True for an open dose that waits for its new reminder time. */
export function isRescheduledSlot(slot: Pick<DoseSlot, "status" | "remindAt">): boolean {
  return slot.status === "pending" && slot.remindAt !== undefined;
}

/** "From Sunday, Oct 18, 22:00": where a carried-over dose comes from. */
export function formatCarriedOverOrigin(slot: Pick<DoseSlot, "scheduledDate" | "localTime">): string {
  return `From ${formatDoseDate(slot.scheduledDate)}, ${formatDoseTime(slot.localTime)}`;
}

/** The status line of a dose row, or null for an open dose that is not missed. */
export function doseStatusLine(slot: DoseSlot, now: number = Date.now()): string | null {
  switch (slot.status) {
    case "taken":
      return slot.existingLog?.actionTimestamp !== undefined
        ? formatTakenAt(slot.existingLog.actionTimestamp, slot.scheduledDate)
        : "Taken";
    case "skipped":
      return slot.existingLog?.skipReason ? `Skipped · ${slot.existingLog.skipReason}` : "Skipped";
    case "missed":
      return "Missed";
    default:
      return slot.remindAt !== undefined
        ? `Rescheduled for ${formatRescheduleTime(slot.remindAt, slot.scheduledDate, now)}`
        : null;
  }
}

/** "3 meds", "1 med". */
export function medsCount(n: number): string {
  return `${n} ${n === 1 ? "med" : "meds"}`;
}

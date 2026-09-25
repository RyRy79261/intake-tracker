import type { DoseSlot } from "@/lib/dose-schedule-service";
import type { MedicationPhase } from "@/lib/db";
import { isCleanFraction } from "@/lib/dose-log-service";
import {
  isCombo,
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

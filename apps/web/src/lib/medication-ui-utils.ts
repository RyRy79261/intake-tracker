import type { DoseSlot } from "@/lib/dose-schedule-service";
import type { MedicationPhase } from "@/lib/db";
import {
  isCombo,
  splitDose,
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

/**
 * Convert a pill count to a human-readable fraction string.
 * Uses Unicode fraction characters for common fractions.
 */
export function formatPillCount(pills: number): string {
  // Handle exact common fractions
  if (pills === 0.25) return "\u00BC tablet";
  if (pills === 0.5) return "\u00BD tablet";
  if (pills === 0.75) return "\u00BE tablet";

  // Handle whole + fraction combos
  const whole = Math.floor(pills);
  const frac = Math.round((pills - whole) * 100) / 100;

  if (frac === 0) {
    return pills === 1 ? "1 tablet" : `${pills} tablets`;
  }

  const fracStr =
    frac === 0.25 ? "\u00BC" :
    frac === 0.5 ? "\u00BD" :
    frac === 0.75 ? "\u00BE" :
    frac.toString();

  const combined = whole > 0 ? `${whole}${fracStr}` : fracStr;
  return `${combined} tablets`;
}

/**
 * Human-readable amount for one dose slot. For a combination drug it shows the
 * per-pill compound split (e.g. "2 tablets of 49/51mg") instead of a bare
 * summed milligram figure; single-compound drugs keep the "N of XXmg" form.
 */
export function formatDoseAmount(slot: DoseSlot): string {
  const { dosageMg, unit, pillsPerDose, inventory, prescription } = slot;

  if (isCombo(inventory)) {
    const per = formatCompoundShort(inventory!.compounds, unit);
    return pillsPerDose != null
      ? `${formatPillCount(pillsPerDose)} of ${per}`
      : per;
  }
  if (isCombo(prescription)) {
    return formatCompoundShort(splitDose(dosageMg, prescription.compounds), unit);
  }
  return pillsPerDose != null
    ? `${formatPillCount(pillsPerDose)} of ${dosageMg}${unit}`
    : `${dosageMg}${unit}`;
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

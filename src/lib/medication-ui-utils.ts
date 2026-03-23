import type { DoseSlot } from "./dose-schedule-service";

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
 * Only counts slots up to the current time (plus any future slots already actioned).
 */
export function computeProgress(slots: DoseSlot[]): {
  total: number;
  taken: number;
  skipped: number;
  pending: number;
  pct: number;
  allDone: boolean;
} {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let total = 0;
  let taken = 0;
  let skipped = 0;
  let pending = 0;

  for (const slot of slots) {
    const parts = slot.localTime.split(":").map(Number);
    const slotMinutes = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
    const isFutureSlot = slotMinutes > nowMinutes;

    // Count if slot is in the past/now, OR if a future slot was already actioned
    if (!isFutureSlot || slot.status === "taken" || slot.status === "skipped") {
      total++;
      if (slot.status === "taken") taken++;
      else if (slot.status === "skipped") skipped++;
      else pending++;
    }
  }

  const handled = taken + skipped;
  const pct = total > 0 ? Math.round((handled / total) * 100) : 0;
  const allDone = total > 0 && pending === 0;

  return { total, taken, skipped, pending, pct, allDone };
}

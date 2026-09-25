/**
 * Pure helpers for describing a dosing regimen (a set of phase schedules).
 * Shared by the titration drawer's AI-warnings request and its tests.
 */

export interface RegimenSummary {
  /** Weekly-averaged daily amount, e.g. "10.71mcg/day". */
  averageDaily: string;
  /** "2x daily", or "3 doses/week" when not every schedule runs every day. */
  frequency: string;
}

/**
 * Summarise a set of schedules for a human (or the AI). The daily total is
 * averaged over the week so a Mon/Wed/Fri dose isn't reported as daily.
 * Returns `undefined` when no schedule has a usable dose.
 */
export function summarizeRegimen(
  schedules: readonly { dosage: number; daysOfWeek: readonly number[] }[],
  unit: string,
): RegimenSummary | undefined {
  const valid = schedules.filter(
    (s) => Number.isFinite(s.dosage) && s.dosage > 0 && s.daysOfWeek.length > 0,
  );
  if (valid.length === 0) return undefined;
  const weekly = valid.reduce((sum, s) => sum + s.dosage * s.daysOfWeek.length, 0);
  const average = Math.round((weekly / 7) * 100) / 100;
  const everyDay = valid.every((s) => s.daysOfWeek.length === 7);
  const dosesPerWeek = valid.reduce((sum, s) => sum + s.daysOfWeek.length, 0);
  return {
    averageDaily: `${average}${unit}/day`,
    frequency: everyDay ? `${valid.length}x daily` : `${dosesPerWeek} doses/week`,
  };
}

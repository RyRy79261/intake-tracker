/**
 * Which phase — and which schedules — actually drive a prescription's doses.
 *
 * A prescription can hold several phases at once (a maintenance phase plus a
 * plan-linked titration phase that temporarily overrides it). Every consumer
 * that turns phases into dose slots or reminders must agree on the choice, so
 * the precedence lives here once instead of being re-derived per caller:
 *
 *   1. Only live phases (`deletedAt` null/absent) with `status === "active"`
 *      are candidates.
 *   2. Per prescription, a titration phase linked to a titration plan wins
 *      over any other candidate. Otherwise the first candidate seen is kept.
 *   3. The chosen phase's schedules are its live, `enabled` ones.
 *
 * This mirrors the precedence `getDailyDoseSchedule` has always used. Whether
 * the prescription itself is active is the caller's concern — filter the
 * phases first if it matters.
 *
 * Pure and structurally typed (no Dexie import), so server code working with
 * Drizzle rows — where optional fields arrive as `null` — can reuse it.
 */
import { isLive } from "./lifecycle";

/** The phase fields the precedence rules read. */
export interface PhaseLike {
  id: string;
  prescriptionId: string;
  type: string;
  status: string;
  titrationPlanId?: string | null | undefined;
  deletedAt?: number | null | undefined;
}

/** The schedule fields the precedence rules read. */
export interface ScheduleLike {
  phaseId: string;
  enabled: boolean;
  deletedAt?: number | null | undefined;
}

export interface EffectivePhase<P extends PhaseLike, S extends ScheduleLike> {
  prescriptionId: string;
  phase: P;
  /** Live, enabled schedules of `phase`, in input order. */
  schedules: S[];
}

function isCandidate(phase: PhaseLike): boolean {
  return isLive(phase) && phase.status === "active";
}

function overrides(phase: PhaseLike): boolean {
  return phase.type === "titration" && !!phase.titrationPlanId;
}

/**
 * Pick the effective phase from ONE prescription's phases, or `undefined`
 * when none is live and active.
 */
export function selectEffectivePhase<P extends PhaseLike>(
  phases: readonly P[],
): P | undefined {
  let chosen: P | undefined;
  for (const phase of phases) {
    if (!isCandidate(phase)) continue;
    if (!chosen || overrides(phase)) chosen = phase;
  }
  return chosen;
}

/**
 * Pick the effective phase for every prescription present in `phases` and
 * attach its live, enabled schedules. Prescriptions with no live active phase
 * are omitted. Result order follows each prescription's first appearance.
 */
export function selectEffectivePhases<P extends PhaseLike, S extends ScheduleLike>(
  phases: readonly P[],
  schedules: readonly S[],
): EffectivePhase<P, S>[] {
  const byPrescription = new Map<string, P[]>();
  for (const phase of phases) {
    const bucket = byPrescription.get(phase.prescriptionId);
    if (bucket) bucket.push(phase);
    else byPrescription.set(phase.prescriptionId, [phase]);
  }

  const result: EffectivePhase<P, S>[] = [];
  for (const [prescriptionId, candidates] of byPrescription) {
    const phase = selectEffectivePhase(candidates);
    if (!phase) continue;
    result.push({
      prescriptionId,
      phase,
      schedules: schedules.filter(
        (s) => s.phaseId === phase.id && s.enabled === true && isLive(s),
      ),
    });
  }
  return result;
}

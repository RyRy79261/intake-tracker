export interface TwoStageProgress {
  primaryPct: number;
  extendedPct: number;
  /**
   * Where the daily target sits on the bar (% of bar width). 0 when the
   * bar is rendering single-stage — either the buffer is disabled or
   * the user has not yet crossed the target, so no marker is needed.
   */
  targetPct: number;
  isOverTarget: boolean;
  isOverExtended: boolean;
  /**
   * Whether the bar is currently rendering in two-stage mode — true
   * only once the user has crossed the target AND a non-zero buffer is
   * configured. Below the target the bar stays single-stage
   * (0..target); above it the bar rescales to 0..target+buffer.
   */
  isTwoStage: boolean;
  /**
   * Amount consumed beyond the target. 0 below target; may exceed
   * `extendedTotal` once the user spills past the buffer too — callers
   * display this verbatim so the overshoot is visible.
   */
  extendedCurrent: number;
  /** The configured buffer amount (matches the caller's input). */
  extendedTotal: number;
  /**
   * The denominator the bar uses: `target` while single-stage,
   * `target + buffer` once two-stage kicks in.
   */
  maxAmount: number;
}

export function computeTwoStageProgress(
  current: number,
  target: number,
  extendedBuffer: number
): TwoStageProgress {
  const buffer = Math.max(0, extendedBuffer);

  if (target <= 0) {
    return {
      primaryPct: 0,
      extendedPct: 0,
      targetPct: 0,
      isOverTarget: false,
      isOverExtended: false,
      isTwoStage: false,
      extendedCurrent: 0,
      extendedTotal: buffer,
      maxAmount: 0,
    };
  }

  const safeCurrent = Math.max(0, current);
  const isOverTarget = current > target;
  const isTwoStage = isOverTarget && buffer > 0;
  const isOverExtended = buffer > 0
    ? current > target + buffer
    : isOverTarget;
  const extendedCurrent = Math.max(0, current - target);

  let maxAmount: number;
  let primaryPct: number;
  let extendedPct: number;
  let targetPct: number;

  if (isTwoStage) {
    // Two-stage: bar represents 0..(target + buffer). The primary
    // segment fills the target portion fully; the extended segment
    // grows above it.
    maxAmount = target + buffer;
    primaryPct = (target / maxAmount) * 100;
    const extendedAmount = Math.min(extendedCurrent, buffer);
    extendedPct = (extendedAmount / maxAmount) * 100;
    targetPct = primaryPct;
  } else {
    // Single-stage: bar represents 0..target. The buffer is hidden
    // entirely until the user crosses the target.
    maxAmount = target;
    primaryPct = Math.min((safeCurrent / target) * 100, 100);
    extendedPct = 0;
    targetPct = 0;
  }

  return {
    primaryPct,
    extendedPct,
    targetPct,
    isOverTarget,
    isOverExtended,
    isTwoStage,
    extendedCurrent,
    extendedTotal: buffer,
    maxAmount,
  };
}

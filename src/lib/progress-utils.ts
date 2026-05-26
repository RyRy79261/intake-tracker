export interface TwoStageProgress {
  primaryPct: number;
  extendedPct: number;
  isOverTarget: boolean;
  isOverExtended: boolean;
  maxAmount: number;
}

export function computeTwoStageProgress(
  current: number,
  target: number,
  extendedBuffer: number
): TwoStageProgress {
  if (target <= 0) {
    return {
      primaryPct: 0,
      extendedPct: 0,
      isOverTarget: false,
      isOverExtended: false,
      maxAmount: 0,
    };
  }

  const buffer = Math.max(0, extendedBuffer);
  const maxAmount = target + buffer;
  const isOverTarget = current > target;
  const isOverExtended = current > maxAmount;

  const primaryAmount = Math.min(Math.max(0, current), target);
  const extendedAmount = Math.max(0, Math.min(current - target, buffer));

  return {
    primaryPct: (primaryAmount / maxAmount) * 100,
    extendedPct: buffer > 0 ? (extendedAmount / maxAmount) * 100 : 0,
    isOverTarget,
    isOverExtended,
    maxAmount,
  };
}

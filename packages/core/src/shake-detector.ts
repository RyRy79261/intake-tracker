/**
 * Pure shake-detection state machine, moved out of
 * apps/web/src/hooks/use-shake-gesture.ts (Phase 3b). The React hook
 * (`useShakeGesture`) and the browser permission helpers
 * (`motionPermissionNeeded` / `requestMotionPermission`) stay in the app — only
 * this React/DOM-free algorithm lives here so it can be unit-tested directly.
 */

export interface ShakeSample {
  x: number;
  y: number;
  z: number;
}

export interface ShakeDetectorConfig {
  /**
   * Change in total acceleration magnitude (m/s²) between samples that
   * counts as a jolt. Magnitude is rotation-invariant: tilting the device
   * redistributes gravity across the axes but leaves the magnitude near
   * 9.8, so only real movement — not reorientation — registers.
   */
  threshold: number;
  /** Number of jolts within the rolling window required to fire. */
  requiredJolts: number;
  /** Rolling window the jolts must fall within. */
  windowMs: number;
  /** Minimum gap between two consecutive detections. */
  cooldownMs: number;
}

function magnitude(sample: ShakeSample): number {
  return Math.sqrt(
    sample.x * sample.x + sample.y * sample.y + sample.z * sample.z,
  );
}

/**
 * Pure shake-detection state machine. Feed it accelerometer samples via
 * `process` and it returns `true` on the sample that completes a shake.
 * Kept free of React/DOM so the algorithm can be unit-tested directly.
 */
export function createShakeDetector(config: ShakeDetectorConfig) {
  let lastMagnitude: number | null = null;
  let lastShakeAt = Number.NEGATIVE_INFINITY;
  let jolts: number[] = [];

  return {
    process(sample: ShakeSample, now: number): boolean {
      const mag = magnitude(sample);
      if (lastMagnitude !== null) {
        const delta = Math.abs(mag - lastMagnitude);
        if (delta > config.threshold) jolts.push(now);
      }
      lastMagnitude = mag;

      jolts = jolts.filter((t) => now - t <= config.windowMs);
      if (
        jolts.length >= config.requiredJolts &&
        now - lastShakeAt > config.cooldownMs
      ) {
        lastShakeAt = now;
        jolts = [];
        return true;
      }
      return false;
    },
  };
}

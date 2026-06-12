"use client";

import { useEffect, useRef } from "react";
import { createShakeDetector } from "@intake/core/shake";

// The pure shake-detection state machine moved to @intake/core/shake in
// Phase 3b. Re-export it (and its types) so existing `@/hooks/use-shake-gesture`
// importers — including the unit test — resolve unchanged.
export { createShakeDetector };
export type { ShakeDetectorConfig, ShakeSample } from "@intake/core/shake";

/**
 * iOS 13+ Safari requires a user-gesture-initiated permission grant before
 * `devicemotion` events fire. `DeviceMotionEvent.requestPermission` only
 * exists on those browsers — elsewhere motion works without a prompt.
 */
type MotionPermissionResult = "granted" | "denied" | "unsupported";

type DeviceMotionEventWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** True on browsers (iOS 13+) that gate motion events behind a permission prompt. */
export function motionPermissionNeeded(): boolean {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") {
    return false;
  }
  return (
    typeof (DeviceMotionEvent as DeviceMotionEventWithPermission)
      .requestPermission === "function"
  );
}

export async function requestMotionPermission(): Promise<MotionPermissionResult> {
  if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") {
    return "unsupported";
  }
  const request = (DeviceMotionEvent as DeviceMotionEventWithPermission)
    .requestPermission;
  if (typeof request !== "function") {
    // Non-iOS browsers: motion events fire without an explicit grant.
    return "granted";
  }
  try {
    return await request();
  } catch {
    return "denied";
  }
}

interface UseShakeGestureOptions {
  enabled: boolean;
  onShake: () => void;
  threshold?: number;
  requiredJolts?: number;
  windowMs?: number;
  cooldownMs?: number;
}

/**
 * Fires `onShake` when the device is physically shaken. Requires several
 * acceleration jolts within a short window so a single bump or a phone
 * settling into a pocket does not trigger it.
 */
export function useShakeGesture({
  enabled,
  onShake,
  threshold = 8,
  requiredJolts = 3,
  windowMs = 800,
  cooldownMs = 3000,
}: UseShakeGestureOptions) {
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const detector = createShakeDetector({
      threshold,
      requiredJolts,
      windowMs,
      cooldownMs,
    });
    const SAMPLE_THROTTLE_MS = 60;
    let lastSampleAt = 0;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

      const now = Date.now();
      if (now - lastSampleAt < SAMPLE_THROTTLE_MS) return;
      lastSampleAt = now;

      if (detector.process({ x: acc.x, y: acc.y, z: acc.z }, now)) {
        onShakeRef.current();
      }
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [enabled, threshold, requiredJolts, windowMs, cooldownMs]);
}

"use client";

import { useEffect, useRef } from "react";

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

export interface ShakeSample {
  x: number;
  y: number;
  z: number;
}

export interface ShakeDetectorConfig {
  /** Sum-of-axes acceleration delta (m/s²) that counts as a jolt. */
  threshold: number;
  /** Number of jolts within the rolling window required to fire. */
  requiredJolts: number;
  /** Rolling window the jolts must fall within. */
  windowMs: number;
  /** Minimum gap between two consecutive detections. */
  cooldownMs: number;
}

/**
 * Pure shake-detection state machine. Feed it accelerometer samples via
 * `process` and it returns `true` on the sample that completes a shake.
 * Kept free of React/DOM so the algorithm can be unit-tested directly.
 */
export function createShakeDetector(config: ShakeDetectorConfig) {
  let last: ShakeSample | null = null;
  let lastShakeAt = Number.NEGATIVE_INFINITY;
  let jolts: number[] = [];

  return {
    process(sample: ShakeSample, now: number): boolean {
      if (last) {
        const delta =
          Math.abs(sample.x - last.x) +
          Math.abs(sample.y - last.y) +
          Math.abs(sample.z - last.z);
        if (delta > config.threshold) jolts.push(now);
      }
      last = sample;

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
  threshold = 15,
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

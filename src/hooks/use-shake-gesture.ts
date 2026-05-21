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
  /** Sum-of-axes acceleration delta (m/s²) that counts as a jolt. */
  threshold?: number;
  /** Number of jolts within the rolling window required to fire. */
  requiredJolts?: number;
  /** Rolling window the jolts must fall within. */
  windowMs?: number;
  /** Minimum gap between two consecutive `onShake` calls. */
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
    if (!enabled) return;
    if (typeof window === "undefined" || !("ondevicemotion" in window)) return;

    const SAMPLE_THROTTLE_MS = 60;
    let last: { x: number; y: number; z: number } | null = null;
    let lastSampleAt = 0;
    let lastShakeAt = 0;
    let jolts: number[] = [];

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

      const now = Date.now();
      if (now - lastSampleAt < SAMPLE_THROTTLE_MS) return;
      lastSampleAt = now;

      const current = { x: acc.x, y: acc.y, z: acc.z };
      if (last) {
        const delta =
          Math.abs(current.x - last.x) +
          Math.abs(current.y - last.y) +
          Math.abs(current.z - last.z);
        if (delta > threshold) jolts.push(now);
      }
      last = current;

      jolts = jolts.filter((t) => now - t <= windowMs);
      if (jolts.length >= requiredJolts && now - lastShakeAt > cooldownMs) {
        lastShakeAt = now;
        jolts = [];
        onShakeRef.current();
      }
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [enabled, threshold, requiredJolts, windowMs, cooldownMs]);
}

"use client";

import { useNowTick } from "@intake/ui/use-now-tick";

/**
 * The current time (epoch ms), re-read every `intervalMs` (default 15 s), so
 * a screen that shows "Missed" or the late-window warning updates while it
 * stays open.
 */
export function useNow(intervalMs: number = 15_000): number {
  useNowTick(intervalMs);
  // Read on each tick on purpose: the tick re-renders, the read is the value.
  return Date.now();
}

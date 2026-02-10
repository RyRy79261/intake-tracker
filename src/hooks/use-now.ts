"use client";

import { useState, useEffect } from "react";

/**
 * Returns `Date.now()` refreshed at a configurable interval.
 * Useful for keeping time-based UI (like chart X-axis right edges) current.
 *
 * @param intervalMs  How often to tick (default 60 000 ms = 1 minute)
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

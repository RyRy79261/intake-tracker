"use client";

import { useCallback, useRef } from "react";

/** Identical one-tap logs closer together than this are treated as a double tap. */
export const QUICK_LOG_REPEAT_WINDOW_MS = 2000;

/**
 * Re-entry guard for one-tap "log it now" buttons.
 *
 * A React-state `disabled` flag is not enough: the local Dexie insert
 * finishes in a few ms, so the button is re-enabled before a touch ghost-click
 * or double tap ~50 ms later, and both land as separate records. This keeps
 * the in-flight flag in a ref (synchronous) and also ignores an identical tap
 * (same key) within `windowMs` of the last accepted one.
 */
export function useQuickLogGuard(windowMs: number = QUICK_LOG_REPEAT_WINDOW_MS) {
  const inFlight = useRef(false);
  const last = useRef<{ key: string; at: number } | null>(null);

  /** Returns false when this tap should be ignored. */
  const begin = useCallback(
    (key: string) => {
      if (inFlight.current) return false;
      const now = Date.now();
      if (last.current && last.current.key === key && now - last.current.at < windowMs) {
        return false;
      }
      inFlight.current = true;
      last.current = { key, at: now };
      return true;
    },
    [windowMs],
  );

  /** Call when the write settles. A failed write does not start the window. */
  const end = useCallback((succeeded: boolean) => {
    inFlight.current = false;
    if (!succeeded) last.current = null;
  }, []);

  /** Forget the last tap (e.g. after Undo), so the same size can be re-logged. */
  const reset = useCallback(() => {
    last.current = null;
  }, []);

  return { begin, end, reset };
}

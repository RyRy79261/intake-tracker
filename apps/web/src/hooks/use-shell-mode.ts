"use client";

import { useSyncExternalStore } from "react";

/** From 768px windows sit side by side instead of filling the screen. */
export const WIDE_QUERY = "(min-width: 768px)";

/**
 * Desktop mode: room for several windows and a mouse (or trackpad) to drag
 * them with. Touch tablets of the same width keep the tiled layout.
 */
export const DESKTOP_QUERY = "(min-width: 1024px) and (pointer: fine)";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}

/** True at 768px and wider, where windows tile instead of stacking. */
export function useIsWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}

/**
 * True in desktop mode: free, resizable windows, the task strip in the
 * sys-bar, Home laid out as a grid, and no bottom bar. It implies wide, so
 * every caller (the chrome, the window layer, the task strip) agrees even if
 * one query changes.
 */
export function useIsDesktop(): boolean {
  const wide = useIsWide();
  return useMediaQuery(DESKTOP_QUERY) && wide;
}

/** Put keyboard focus on a window's title bar (next frame, once it is shown). */
export function focusWindowTitle(id: string): void {
  requestAnimationFrame(() => document.getElementById(`wt-${id}`)?.focus({ preventScroll: true }));
}

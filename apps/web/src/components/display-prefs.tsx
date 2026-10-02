"use client";

import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { useSettingsStore } from "@/stores/settings-store";

/** Root classes set by the Appearance settings (styles in app/ward-settings.css). */
export const BIG_TEXT_CLASS = "big-text";
export const REDUCE_MOTION_CLASS = "reduce-motion";

/**
 * Applies the device-only display preferences from Settings > Appearance:
 * - Bigger text: `html.big-text` raises the root font size, so every
 *   rem-based size scales with it.
 * - Reduce motion: `html.reduce-motion` turns CSS animations and transitions
 *   off, and `MotionConfig` stops motion's transform animations (sheets and
 *   drawers appear in place).
 */
export function DisplayPrefs({ children }: { children: ReactNode }) {
  const bigText = useSettingsStore((s) => s.bigText);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(BIG_TEXT_CLASS, bigText);
    root.classList.toggle(REDUCE_MOTION_CLASS, reduceMotion);
  }, [bigText, reduceMotion]);

  return <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>{children}</MotionConfig>;
}

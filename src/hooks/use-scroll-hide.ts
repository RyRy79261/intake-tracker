"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScroll, useMotionValueEvent } from "motion/react";
import { smoothScrollTo } from "@/lib/smooth-scroll";

interface UseScrollHideOptions {
  scrollDurationMs: number;
  autoHideDelayMs: number;
  /** Whether the bottom of the page is currently in view (drives show-at-bottom). */
  isAtBottom?: boolean;
}

interface UseScrollHideReturn {
  isHidden: boolean;
  handleQuickNav: (sectionId: string) => void;
}

/**
 * Manages scroll-based hide/show behavior for header + footer bars.
 * Hides on scroll down, shows on scroll up.
 * Shows bars when isAtBottom is true (bottom sentinel in view).
 * After a quick-nav scroll, force-hides after a configurable delay.
 */
export function useScrollHide({
  scrollDurationMs,
  autoHideDelayMs,
  isAtBottom = false,
}: UseScrollHideOptions): UseScrollHideReturn {
  const [headerHidden, setHeaderHidden] = useState(false);
  const [forceHidden, setForceHidden] = useState(false);
  const forceHiddenRef = useRef(false);
  const forceHiddenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navSeqRef = useRef(0);

  // Keep a ref so the scroll-event callback always reads the latest value
  const isAtBottomRef = useRef(false);
  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  // Scroll detection for hiding/showing header + footer
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (current) => {
    const previous = scrollY.getPrevious() ?? 0;
    const isScrollingDown = current > previous && current > 50;

    setHeaderHidden(isScrollingDown && !isAtBottomRef.current);

    // Clear force-hide on user scroll-up or reaching bottom
    if ((!isScrollingDown || isAtBottomRef.current) && forceHiddenRef.current) {
      if (forceHiddenTimerRef.current) {
        clearTimeout(forceHiddenTimerRef.current);
        forceHiddenTimerRef.current = null;
      }
      forceHiddenRef.current = false;
      setForceHidden(false);
    }
  });

  // When the sentinel enters/leaves view, update header visibility immediately
  // (covers the case where scroll events stop firing at the very bottom)
  useEffect(() => {
    if (isAtBottom) {
      setHeaderHidden(false);
      if (forceHiddenRef.current) {
        if (forceHiddenTimerRef.current) {
          clearTimeout(forceHiddenTimerRef.current);
          forceHiddenTimerRef.current = null;
        }
        forceHiddenRef.current = false;
        setForceHidden(false);
      }
    }
  }, [isAtBottom]);

  // Clear auto-hide timer on unmount
  useEffect(() => {
    return () => {
      if (forceHiddenTimerRef.current) {
        clearTimeout(forceHiddenTimerRef.current);
      }
    };
  }, []);

  // Quick nav: scroll to section, then auto-hide after delay
  const handleQuickNav = useCallback(
    (sectionId: string) => {
      const el = document.getElementById(sectionId);
      if (!el) return;

      const seq = ++navSeqRef.current;

      // Clear any existing auto-hide timer before starting a new one
      if (forceHiddenTimerRef.current) {
        clearTimeout(forceHiddenTimerRef.current);
        forceHiddenTimerRef.current = null;
      }

      smoothScrollTo(el, scrollDurationMs).then(() => {
        if (seq !== navSeqRef.current) return;
        forceHiddenTimerRef.current = setTimeout(() => {
          forceHiddenTimerRef.current = null;
          forceHiddenRef.current = true;
          setForceHidden(true);
        }, autoHideDelayMs);
      });
    },
    [scrollDurationMs, autoHideDelayMs]
  );

  return {
    isHidden: headerHidden || forceHidden,
    handleQuickNav,
  };
}

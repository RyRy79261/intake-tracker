"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScroll, useMotionValueEvent } from "motion/react";
import { smoothScrollTo } from "@/lib/smooth-scroll";

interface UseScrollHideOptions {
  scrollDurationMs: number;
  autoHideDelayMs: number;
}

interface UseScrollHideReturn {
  isHidden: boolean;
  handleQuickNav: (sectionId: string) => void;
}

/**
 * Manages scroll-based hide/show behavior for header + footer bars.
 * Hides on scroll down, shows on scroll up.
 * Shows bars when user has scrolled to the bottom of the page.
 * After a quick-nav scroll, force-hides after a configurable delay.
 */
export function useScrollHide({
  scrollDurationMs,
  autoHideDelayMs,
}: UseScrollHideOptions): UseScrollHideReturn {
  const [headerHidden, setHeaderHidden] = useState(false);
  const [forceHidden, setForceHidden] = useState(false);
  const forceHiddenRef = useRef(false);
  const forceHiddenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navSeqRef = useRef(0);

  // Native scroll listener writes at-bottom state directly to a ref so it's
  // always up-to-date when the framer-motion scroll callback reads it
  // (avoids the React state/effect timing race).
  const isAtBottomRef = useRef(false);
  useEffect(() => {
    const check = () => {
      const { scrollTop, scrollHeight } = document.documentElement;
      isAtBottomRef.current =
        scrollHeight - (window.innerHeight + scrollTop) <= 10;
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    check(); // initial state
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

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

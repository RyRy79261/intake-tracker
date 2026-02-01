"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Hook that provides keyboard-aware scroll behavior for input fields.
 * When an input is focused and the mobile keyboard appears, it scrolls
 * the input into view so it's not hidden behind the keyboard.
 */
export function useKeyboardAwareScroll() {
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToInput = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const target = e.target;
    
    // Small delay to let the keyboard fully open on mobile
    // iOS keyboard animation takes ~300ms
    setTimeout(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 300);
  }, []);

  return {
    /** Attach to input's onFocus to scroll into view when keyboard opens */
    onFocus: scrollToInput,
    /** Optional ref if you need programmatic access to the input */
    inputRef,
  };
}

/**
 * Hook that automatically scrolls focused inputs into view when the
 * visual viewport changes (i.e., when the mobile keyboard appears).
 * This uses the Visual Viewport API for more precise detection.
 */
export function useVisualViewportScroll() {
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;

    const handleResize = () => {
      // When viewport shrinks (keyboard opens), scroll the active input into view
      if (activeInputRef.current && document.activeElement === activeInputRef.current) {
        setTimeout(() => {
          activeInputRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 100);
      }
    };

    viewport.addEventListener("resize", handleResize);
    return () => viewport.removeEventListener("resize", handleResize);
  }, []);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    activeInputRef.current = e.target;
    // Also scroll immediately on focus as a fallback
    setTimeout(() => {
      e.target.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 300);
  }, []);

  const handleBlur = useCallback(() => {
    activeInputRef.current = null;
  }, []);

  return {
    onFocus: handleFocus,
    onBlur: handleBlur,
  };
}

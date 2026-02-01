"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Hook that provides keyboard-aware scroll behavior for input fields.
 * When an input is focused and the mobile keyboard appears, it scrolls
 * the input into view so it's not hidden behind the keyboard.
 */
export function useKeyboardAwareScroll() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToInput = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const target = e.target;
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Small delay to let the keyboard fully open on mobile
    // iOS keyboard animation takes ~300ms
    timeoutRef.current = setTimeout(() => {
      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 300);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    /** Attach to input's onFocus to scroll into view when keyboard opens */
    onFocus: scrollToInput,
  };
}

/**
 * Hook that automatically scrolls focused inputs into view when the
 * visual viewport changes (i.e., when the mobile keyboard appears).
 * This uses the Visual Viewport API for more precise detection.
 */
export function useVisualViewportScroll() {
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;

    const handleResize = () => {
      // When viewport shrinks (keyboard opens), scroll the active input into view
      if (activeInputRef.current && document.activeElement === activeInputRef.current) {
        // Clear previous resize timeout to debounce
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }
        resizeTimeoutRef.current = setTimeout(() => {
          activeInputRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 100);
      }
    };

    viewport.addEventListener("resize", handleResize);
    return () => {
      viewport.removeEventListener("resize", handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    activeInputRef.current = e.target;
    
    // Clear previous focus timeout
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }
    
    // Also scroll immediately on focus as a fallback
    focusTimeoutRef.current = setTimeout(() => {
      e.target.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 300);
  }, []);

  const handleBlur = useCallback(() => {
    activeInputRef.current = null;
    // Clear focus timeout on blur
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }
  }, []);

  // Cleanup focus timeout on unmount
  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  return {
    onFocus: handleFocus,
    onBlur: handleBlur,
  };
}

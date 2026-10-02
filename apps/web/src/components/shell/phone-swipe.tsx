"use client";

import { useEffect, useRef } from "react";
import { goHome, openWindow } from "@/hooks/use-window-history";
import { useSettingsStore } from "@/stores/settings-store";
import { useWindowStore } from "@/stores/window-store";
import { useAuthGate } from "@/components/auth-guard";

/**
 * The pages a sideways swipe moves between on a phone, left to right in the
 * order of the sys-bar: Home (the logo), then Medications, Metrics, History
 * and Profile. Swiping left goes to the next one. Settings is a sheet, not a
 * page, so it is not one of them.
 */
export const SWIPE_PAGES = ["home", "meds", "metrics", "history", "profile"] as const;
export type SwipePage = (typeof SWIPE_PAGES)[number];

/** The pages for this user: Profile only when signed in (the avatar is sign-in otherwise). */
export function swipePages(signedIn: boolean): readonly SwipePage[] {
  return signedIn ? SWIPE_PAGES : SWIPE_PAGES.filter((p) => p !== "profile");
}

/** Movement before the gesture picks an axis. */
const LOCK_PX = 10;
/** Pull past the first or last page moves this much of the finger's travel. */
const RESISTANCE = 0.25;
const COMMIT_MS = 180;
const ENTER_MS = 220;

/** What is on screen: Home, or the app of the window over it (History is Metrics on Records). */
export function currentSwipePage(): SwipePage | null {
  const s = useWindowStore.getState();
  const win = !s.showHome ? s.wins.find((w) => w.id === s.focus && !w.min) : undefined;
  if (!win) return "home";
  if (win.app === "metrics") return win.st.tab === "records" ? "history" : "metrics";
  return win.app === "meds" || win.app === "profile" ? win.app : null;
}

/** The page next to `page` in `pages`: -1 to the left (swipe right), 1 to the right (swipe left). */
export function neighbourPage(
  page: SwipePage,
  dir: -1 | 1,
  pages: readonly SwipePage[] = SWIPE_PAGES,
): SwipePage | null {
  const at = pages.indexOf(page);
  return at < 0 ? null : (pages[at + dir] ?? null);
}

function goTo(page: SwipePage): void {
  if (page === "home") goHome();
  // Like the sys-bar buttons: Metrics opens on Summary, History on Records.
  else if (page === "metrics") openWindow("metrics", { tab: "summary" });
  else openWindow(page);
}

/** The element that shows `page`, to slide with the finger. */
function surfaceFor(page: SwipePage): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    page === "home" ? '[data-testid="home"]' : '[data-testid="window-layer"]',
  );
}

/** Controls that own a sideways drag, and content that scrolls sideways. */
function ownsSidewaysDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="slider"], [data-no-swipe], .recharts-wrapper',
    )
  )
    return true;
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
  }
  return false;
}

function modalOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function slide(el: HTMLElement, x: number, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) {
      el.style.transition = "";
      el.style.transform = x === 0 ? "" : `translateX(${x}px)`;
      resolve();
      return;
    }
    el.style.transition = `transform ${ms}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    el.style.transform = `translateX(${x}px)`;
    window.setTimeout(resolve, ms);
  });
}

function clear(el: HTMLElement | null): void {
  if (!el) return;
  el.style.transition = "";
  el.style.transform = "";
}

/**
 * Phone only: swipe sideways to move between Home, Medications, Metrics,
 * History and Profile, in the sys-bar's order (swipe left for the next). The page
 * follows the finger; past the distance or speed set in Settings it slides
 * out and the next page slides in. Swipes that start on a field, a slider, a
 * chart, or content that scrolls sideways are left to that control, and
 * nothing happens while a dialog or sheet is open.
 */
export function PhoneSwipe() {
  const signedIn = useAuthGate();
  const pagesRef = useRef(swipePages(signedIn));
  useEffect(() => {
    pagesRef.current = swipePages(signedIn);
  }, [signedIn]);

  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null;
    let last = { x: 0, t: 0 };
    let velocity = 0;
    let axis: "x" | "y" | null = null;
    let page: SwipePage | null = null;
    let surface: HTMLElement | null = null;
    let busy = false;

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || modalOpen() || ownsSidewaysDrag(e.target)) {
        start = null;
        return;
      }
      page = currentSwipePage();
      if (!page) {
        start = null;
        return;
      }
      const t = e.touches[0]!;
      start = { x: t.clientX, y: t.clientY, t: e.timeStamp };
      last = { x: t.clientX, t: e.timeStamp };
      velocity = 0;
      axis = null;
      surface = null;
    };

    const onMove = (e: TouchEvent) => {
      if (!start || !page) return;
      const t = e.touches[0]!;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (axis === null) {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axis === "x") surface = surfaceFor(page);
      }
      if (axis !== "x" || !surface) return;
      const dt = e.timeStamp - last.t;
      if (dt > 0) velocity = ((t.clientX - last.x) / dt) * 1000;
      last = { x: t.clientX, t: e.timeStamp };
      const target = neighbourPage(page, dx > 0 ? -1 : 1, pagesRef.current);
      const x = target ? dx : dx * RESISTANCE;
      surface.style.transition = "";
      surface.style.transform = `translateX(${x}px)`;
    };

    const onEnd = async () => {
      const from = page;
      const el = surface;
      const began = start;
      start = null;
      surface = null;
      if (!began || axis !== "x" || !from || !el) return;
      const dx = last.x - began.x;
      const w = window.innerWidth || 1;
      const { swipeNavDistanceThresholdPct: pct, swipeNavVelocityThreshold: minSpeed } = useSettingsStore.getState();
      const dir: -1 | 1 = dx > 0 ? -1 : 1;
      const target = neighbourPage(from, dir, pagesRef.current);
      const far = Math.abs(dx) > (w * pct) / 100;
      const fast = Math.abs(velocity) > minSpeed && Math.sign(velocity) === Math.sign(dx);
      const still = reducedMotion();
      if (!target || !(far || fast)) {
        await slide(el, 0, still ? 0 : ENTER_MS);
        clear(el);
        return;
      }
      busy = true;
      try {
        await slide(el, dx > 0 ? w : -w, still ? 0 : COMMIT_MS);
        goTo(target);
        // The page it went to renders in the next frames; then it comes in
        // from the side the finger moved away from.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        clear(el);
        const next = surfaceFor(target);
        if (next && !still) {
          next.style.transition = "";
          next.style.transform = `translateX(${dx > 0 ? -w : w}px)`;
          await new Promise((r) => requestAnimationFrame(r));
          await slide(next, 0, ENTER_MS);
        }
        clear(next);
      } finally {
        busy = false;
      }
    };

    const onCancel = () => {
      const el = surface;
      start = null;
      surface = null;
      if (el) void slide(el, 0, reducedMotion() ? 0 : ENTER_MS).then(() => clear(el));
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onCancel);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, []);

  return null;
}

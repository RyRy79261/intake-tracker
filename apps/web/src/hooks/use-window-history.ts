"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useWindowStore, type OpenResult } from "@/stores/window-store";
import { windowForRoute, windowHref, type ShellAppId, type WindowState } from "@/lib/nav-routes";

/**
 * Browser history for Ward Console windows.
 *
 * Opening a window pushes a history entry (with the window's route, so the
 * address bar and a reload follow it), which makes the phone or browser
 * Back button close the window on top instead of leaving the app. Every
 * entry the shell touches carries a `wardSeq` that only ever grows, so a
 * `popstate` can tell Back from Forward.
 *
 * Next's app router patches `history.pushState`/`replaceState`: it copies
 * its own `__NA` state into our entries (so it handles their popstate) and
 * syncs `usePathname` when a URL is passed.
 */

interface WardHistoryState {
  wardSeq?: number;
  /** The window this entry opened. */
  wardWin?: string;
}

let lastSeq = 0;
/** How many upcoming popstates are our own `history.back()` calls. */
let skipPops = 0;
/** `wardSeq` of the entry we are on. */
let currentSeq = 0;
/** The first route sync after a page load pushes a Home entry under a deep link. */
let firstSync = true;

function nextSeq(): number {
  lastSeq = Math.max(lastSeq + 1, Date.now());
  currentSeq = lastSeq;
  return lastSeq;
}

function wardState(): WardHistoryState | null {
  if (typeof window === "undefined") return null;
  const s: unknown = window.history.state;
  return s && typeof s === "object" ? (s as WardHistoryState) : null;
}

function seqOf(state: WardHistoryState | null): number {
  return typeof state?.wardSeq === "number" ? state.wardSeq : 0;
}

/**
 * Open (or focus) an app's window. A new window gets its own Back entry,
 * which also moves the address bar to the window's route.
 */
export function openWindow(app: ShellAppId, st?: WindowState): OpenResult {
  const res = useWindowStore.getState().open(app, st);
  if (res?.created) {
    const data: WardHistoryState = { wardSeq: nextSeq(), wardWin: res.win.id };
    window.history.pushState(data, "", windowHref(res.win.app, res.win.st));
  }
  return res;
}

/**
 * Close a window. If the current history entry is the one it pushed, step
 * back over it too, so the address bar returns to what is underneath and a
 * later Back doesn't land on a dead entry.
 */
export function closeWindow(id: string): void {
  useWindowStore.getState().close(id);
  if (wardState()?.wardWin === id) {
    skipPops += 1;
    window.history.back();
  }
}

/**
 * The Home button. On a phone it closes the window on screen (the
 * prototype's `home`); on a wide screen it minimises every window.
 */
export function goHome(): void {
  const s = useWindowStore.getState();
  if (s.wide) {
    s.showDesktop();
    return;
  }
  if (s.focus && !s.showHome) closeWindow(s.focus);
  useWindowStore.setState({ focus: null, showHome: true });
}

function onPopState(event: PopStateEvent): void {
  const state = (event.state && typeof event.state === "object" ? event.state : null) as WardHistoryState | null;
  const prev = currentSeq;
  currentSeq = seqOf(state);
  lastSeq = Math.max(lastSeq, currentSeq);
  if (skipPops > 0) {
    skipPops -= 1;
    return;
  }
  if (currentSeq >= prev) return; // Forward, or an entry we never tagged.

  const s = useWindowStore.getState();
  const onScreen = s.focus && !s.showHome ? s.wins.find((w) => w.id === s.focus && !w.min) : undefined;
  if (onScreen) {
    s.close(onScreen.id);
    return;
  }
  // Nothing to close: this entry belonged to a window closed some other way
  // (the switcher). Keep going back until we reach an entry that isn't ours.
  if (state?.wardWin) window.history.back();
}

/**
 * Mount once in the shell: handles Back, and opens the window for a deep
 * link (`/medications`, `/analytics?tab=records`, `/history`, `/profile`) or
 * for an in-app `router.push` to one of those routes.
 */
export function useWindowHistory(): void {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    currentSeq = seqOf(wardState());
    lastSeq = Math.max(lastSeq, currentSeq);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const isFirst = firstSync;
    firstSync = false;
    const state = wardState();
    // An entry we already handled (including one restored by a reload,
    // whose windows came back from sessionStorage). Don't touch
    // `currentSeq` here: on Back, Next can render the restored route (and
    // run this effect) before our popstate listener sees the event.
    if (seqOf(state) > 0) return;
    const target = windowForRoute(pathname, search);
    const res = target ? useWindowStore.getState().open(target.app, target.st) : null;
    if (!res) {
      window.history.replaceState({ wardSeq: nextSeq() } satisfies WardHistoryState, "");
      return;
    }
    if (isFirst) {
      // A deep link: put Home underneath so Back closes the window rather
      // than leaving the app.
      window.history.replaceState({ wardSeq: nextSeq() } satisfies WardHistoryState, "", "/");
      window.history.pushState(
        { wardSeq: nextSeq(), wardWin: res.win.id } satisfies WardHistoryState,
        "",
        windowHref(res.win.app, res.win.st),
      );
      return;
    }
    window.history.replaceState({ wardSeq: nextSeq(), wardWin: res.win.id } satisfies WardHistoryState, "");
  }, [pathname, search]);
}

/** Test hook: reset the module's history bookkeeping. */
export function __resetWindowHistoryForTests(): void {
  lastSeq = 0;
  skipPops = 0;
  currentSeq = 0;
  firstSync = true;
}

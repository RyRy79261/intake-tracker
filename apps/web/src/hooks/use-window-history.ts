"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useWindowStore, type OpenResult } from "@/stores/window-store";
import { isWindowRoute, windowForRoute, windowHref, type ShellAppId, type WindowState } from "@/lib/nav-routes";
import { isSettingsGroup, useSettingsSheetStore, type SettingsGroupId } from "@/stores/settings-sheet-store";

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
  /** This entry opened the Settings sheet (`/settings`). */
  wardSettings?: boolean;
  /**
   * Not a window's entry: the Settings sheet, or a route outside the shell
   * (Help, /auth). Back from it returns to the window underneath.
   */
  wardOff?: boolean;
}

/** The route that deep-links to the Settings sheet. */
export const SETTINGS_PATH = "/settings";

/** A Settings sheet entry: off the windows, like Help or /auth. */
const SETTINGS_ENTRY = { wardSettings: true, wardOff: true } as const;

let lastSeq = 0;
/** How many upcoming popstates are our own `history.back()` calls. */
let skipPops = 0;
/** `wardSeq` of the entry we are on. */
let currentSeq = 0;
/** `wardWin` / `wardOff` of the entry we are on, so Back knows what it leaves. */
let currentWin: string | undefined;
let currentOff = false;
/** The first route sync after a page load pushes a Home entry under a deep link. */
let firstSync = true;

function nextSeq(): number {
  lastSeq = Math.max(lastSeq + 1, Date.now());
  currentSeq = lastSeq;
  return lastSeq;
}

/** Tag the entry we are on (a fresh `wardSeq`) and remember what it holds. */
function tag(extra: Omit<WardHistoryState, "wardSeq">): WardHistoryState {
  currentWin = extra.wardWin;
  currentOff = extra.wardOff === true;
  return { wardSeq: nextSeq(), ...extra };
}

function track(state: WardHistoryState | null): void {
  currentSeq = seqOf(state);
  currentWin = state?.wardWin;
  currentOff = state?.wardOff === true;
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
    const data = tag({ wardWin: res.win.id });
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
 * Open the global Settings sheet (the sys-bar gear), optionally with a group
 * expanded. It gets its own Back entry at `/settings`, so the phone or
 * browser Back button closes it.
 */
export function openSettings(group?: SettingsGroupId): void {
  const store = useSettingsSheetStore.getState();
  const wasOpen = store.open;
  store.show(group);
  if (wasOpen || typeof window === "undefined") return;
  window.history.pushState(tag(SETTINGS_ENTRY), "", SETTINGS_PATH);
}

/**
 * Close the Settings sheet. If the current history entry is the one that
 * opened it, step back over it, so the address bar returns to what is
 * underneath.
 */
export function closeSettings(): void {
  useSettingsSheetStore.getState().hide();
  if (wardState()?.wardSettings) {
    skipPops += 1;
    window.history.back();
  }
}

/**
 * The Home button. On a phone it closes the window on screen (the
 * prototype's `home`); on a wide screen it minimises every window. Off the
 * shell (`onShell` false, e.g. /settings) no window is on screen, so it only
 * shows Home and leaves the windows open.
 */
export function goHome(onShell = true): void {
  const s = useWindowStore.getState();
  if (s.wide) {
    s.showDesktop();
    return;
  }
  if (!onShell) {
    useWindowStore.setState({ showHome: true });
    return;
  }
  if (s.focus && !s.showHome) closeWindow(s.focus);
  useWindowStore.setState({ focus: null, showHome: true });
}

function onPopState(event: PopStateEvent): void {
  const state = (event.state && typeof event.state === "object" ? event.state : null) as WardHistoryState | null;
  const prev = currentSeq;
  const leftWin = currentWin;
  const leftOff = currentOff;
  track(state);
  lastSeq = Math.max(lastSeq, currentSeq);
  if (skipPops > 0) {
    skipPops -= 1;
    return;
  }
  if (currentSeq >= prev) return; // Forward, or an entry we never tagged.

  // The Settings sheet sits over everything: Back closes it first.
  const sheet = useSettingsSheetStore.getState();
  if (sheet.open) {
    sheet.hide();
    return;
  }

  const s = useWindowStore.getState();
  const alive = (id: string | undefined) => id !== undefined && s.wins.some((w) => w.id === id);
  if (leftOff) {
    // Back from Help/auth (or a Settings entry whose sheet is already shut)
    // returns to the window underneath, if any.
  } else if (leftWin) {
    // Close the window whose entry we left (not whichever is focused), so
    // the address bar and the windows stay in step.
    if (alive(leftWin)) s.close(leftWin);
  } else {
    const onScreen = s.focus && !s.showHome ? s.wins.find((w) => w.id === s.focus && !w.min) : undefined;
    if (onScreen) {
      s.close(onScreen.id);
      return;
    }
  }
  const landed = state?.wardWin;
  if (!landed) return;
  // An entry for a window closed some other way (the switcher) is dead:
  // keep going back until we reach a live one or one that isn't ours.
  if (!alive(landed)) {
    window.history.back();
    return;
  }
  if (leftOff) useWindowStore.getState().switchTo(landed);
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
    track(wardState());
    lastSeq = Math.max(lastSeq, currentSeq);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const isFirst = firstSync;
    firstSync = false;
    const state = wardState();

    // `/settings` opens the Settings sheet over Home and the windows; any
    // other route closes it (e.g. "Open the manual" going to /help).
    const sheet = useSettingsSheetStore.getState();
    if (pathname === SETTINGS_PATH) {
      const group = search?.get("section");
      sheet.show(isSettingsGroup(group) ? group : null);
      if (seqOf(state) > 0) return;
      if (isFirst) {
        // A deep link: put Home underneath so Back closes the sheet rather
        // than leaving the app.
        window.history.replaceState(tag({}), "", "/");
        window.history.pushState(tag(SETTINGS_ENTRY), "", SETTINGS_PATH);
        return;
      }
      window.history.replaceState(tag(SETTINGS_ENTRY), "");
      return;
    }
    if (sheet.open) sheet.hide();

    // An entry we already handled (including one restored by a reload,
    // whose windows came back from sessionStorage). Don't touch
    // `currentSeq` here: on Back, Next can render the restored route (and
    // run this effect) before our popstate listener sees the event.
    if (seqOf(state) > 0) return;
    const target = windowForRoute(pathname, search);
    const res = target ? useWindowStore.getState().open(target.app, target.st) : null;
    if (!res) {
      const off = pathname !== "/" && !isWindowRoute(pathname);
      window.history.replaceState(tag(off ? { wardOff: true } : {}), "");
      return;
    }
    if (isFirst) {
      // A deep link: put Home underneath so Back closes the window rather
      // than leaving the app.
      window.history.replaceState(tag({}), "", "/");
      window.history.pushState(
        tag({ wardWin: res.win.id }),
        "",
        windowHref(res.win.app, res.win.st),
      );
      return;
    }
    window.history.replaceState(tag({ wardWin: res.win.id }), "");
  }, [pathname, search]);
}

/** Test hook: reset the module's history bookkeeping. */
export function __resetWindowHistoryForTests(): void {
  lastSeq = 0;
  skipPops = 0;
  currentSeq = 0;
  currentWin = undefined;
  currentOff = false;
  firstSync = true;
}

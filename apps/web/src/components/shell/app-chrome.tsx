"use client";

import { Suspense, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useWindowStore } from "@/stores/window-store";
import { isChromeRoute, isWindowRoute } from "@/lib/nav-routes";
import { useWindowHistory } from "@/hooks/use-window-history";
import { HomePageBody } from "@/components/home-page-body";
import { WindowLayer } from "@/components/shell/window-layer";
import { useIsDesktop, useIsWide } from "@/hooks/use-shell-mode";
import { cn } from "@/lib/utils";
import { SysBar } from "@/components/shell/sys-bar";
import { BottomBar } from "@/components/shell/bottom-bar";
import { DeskBand } from "@/components/shell/desk-band";
import { PhoneSwipe } from "@/components/shell/phone-swipe";
import { SettingsSheet } from "@/components/settings/settings-sheet";
import { SETTINGS_PATH } from "@/hooks/use-window-history";
import { ErrorBoundary } from "@/components/error-boundary";

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * The app frame around every page: the Ward Console shell (the sys-bar on
 * top, the windows, and the bottom bar with Home, Windows on tiled screens
 * and Hold to talk; on a phone, the quick links over it and sideways swipes
 * along the sys-bar: Home, Medications, Metrics, History, Profile). Desktop mode (1024px or more with a mouse) is a desk instead of
 * Home: the intake modules are free windows in the window layer, the
 * sys-bar carries the task strip, and the desk band along the bottom has
 * Report a bug, the icons of minimised modules and Hold to talk.
 *
 * The shell reads device-only state (open windows in sessionStorage, the
 * screen width), so the server render and hydration show a plain frame and
 * the shell parts are added right after. Non-shell pages (`/privacy`,
 * `/auth`, ...) render their content in that frame, so it is in the server
 * HTML.
 *
 * Home, the window routes (`/medications`, `/analytics`, `/history`,
 * `/profile`) and `/settings` all render Home here, with the app windows
 * (and the Settings sheet) over it, so Home stays mounted while windows open
 * and close and the route only decides which window a deep link opens. Other
 * routes (`/auth`, `/privacy`, ...) render their page; the windows stay
 * mounted behind it, hidden.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  const pathname = usePathname();
  const onShell = pathname === "/" || pathname === SETTINGS_PATH || isWindowRoute(pathname);
  const chrome = isClient && (onShell || isChromeRoute(pathname));
  const wide = useIsWide();
  const desktop = useIsDesktop();
  // On a phone the window on screen covers Home; on a tiled screen the
  // windows fill the area, and Home would only show through the gutters.
  // Either way, take Home out of view, the tab order and the accessibility
  // tree. (The desktop has no Home: its modules are windows.)
  const homeCovered = useWindowStore((s) => {
    const shown = s.wins.filter((w) => !w.min);
    return wide
      ? shown.length >= 2 || shown.some((w) => w.max)
      : !s.showHome && s.wins.some((w) => w.id === s.focus && !w.min);
  });
  /** The desk: desktop mode on Home or a window route. */
  const desk = desktop && onShell;

  // The desk band replaces the bottom bar on the desktop: everything that
  // sits above the bar (the window area, banners, page padding) reads its
  // height from `--bbh`, which the stylesheet sets for
  // `data-shell-mode="desktop"`. A layout effect, so the window layer
  // measures its area (in its own effect, which runs first among passive
  // effects) with the band already taken off.
  useLayoutEffect(() => {
    if (!desktop) return;
    const root = document.documentElement;
    root.dataset.shellMode = "desktop";
    return () => {
      delete root.dataset.shellMode;
    };
  }, [desktop]);

  // The shell parts are added around the page once on the client. The page
  // itself must keep its place in the tree across that switch (same parents,
  // same slot): a page that remounts after hydration runs its mount effects
  // twice (/auth/native-start would start Google sign-in twice) and loses
  // what was typed into it.
  return (
    <main className="min-h-screen overflow-x-clip bg-background" data-shell={isClient ? "ward" : undefined}>
      {isClient && (
        <Suspense fallback={null}>
          <WindowHistorySync />
        </Suspense>
      )}
      {chrome && <SysBar />}
      {(isClient || !onShell) && (
        <div
          className={cn(
            !chrome
              ? "container mx-auto max-w-lg px-4 pb-6 pt-6"
              : desk
                ? // Nothing to lay out: the desk's modules are windows.
                  "hidden"
                : // Phone: the quick links sit over the bottom bar, 48px more.
                  "container mx-auto max-w-lg px-3 pb-[calc(var(--bbh,56px)+env(safe-area-inset-bottom,0px)+24px)] max-md:pb-[calc(56px+48px+env(safe-area-inset-bottom,0px)+24px)] pt-3",
            onShell && !desk && homeCovered && "invisible",
          )}
          inert={onShell && !desk && homeCovered}
          data-testid={isClient ? "home" : undefined}
        >
          {onShell ? (
            // Its own boundary: a Home card that crashes must not take down the
            // shell, or the crash screen's "Report this problem" (a hard load
            // of /settings, which renders Home) would crash again before the
            // Settings sheet mounts.
            desk ? null : (
              <ErrorBoundary>
                <HomePageBody />
              </ErrorBoundary>
            )
          ) : (
            children
          )}
        </div>
      )}
      {isClient && <WindowLayer hidden={!onShell} />}
      {isClient && onShell && !wide && <PhoneSwipe />}
      {chrome && (desktop ? <DeskBand modules={onShell} /> : <BottomBar />)}
      {isClient && <SettingsSheet />}
    </main>
  );
}

/** Back closes windows; deep links open them. Needs Suspense (search params). */
function WindowHistorySync() {
  useWindowHistory();
  return null;
}

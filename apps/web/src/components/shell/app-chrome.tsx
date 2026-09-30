"use client";

import { Suspense, useEffect, useSyncExternalStore, type ReactNode } from "react";
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
 * top, the windows, and the bottom bar with Home, Windows, Hold to talk and
 * Log). Desktop mode (1024px or more with a mouse) has no bottom bar: the
 * sys-bar carries the task strip, and Home is a grid of cards behind free
 * windows.
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
  const desktop = useIsDesktop() && wide;
  // On a phone the window on screen covers Home; on a tiled screen the
  // windows fill the area, and Home would only show through the gutters.
  // Either way, take Home out of view, the tab order and the accessibility
  // tree. On the desktop free windows float over Home, which stays in use
  // around them; only a maximised window (or a snapped pair) covers it.
  const homeCovered = useWindowStore((s) => {
    const shown = s.wins.filter((w) => !w.min);
    if (desktop) {
      return shown.some((w) => w.max) || (shown.some((w) => w.snap === "l") && shown.some((w) => w.snap === "r"));
    }
    return wide
      ? shown.length >= 2 || shown.some((w) => w.max)
      : !s.showHome && s.wins.some((w) => w.id === s.focus && !w.min);
  });

  // Desktop mode has no bottom bar: everything that sits above the bar (the
  // window area, banners, the listening panel) reads its height from
  // `--bbh`, which the stylesheet sets to 0 for `data-shell-mode="desktop"`.
  useEffect(() => {
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
              : desktop && onShell
                ? // The desktop: Home's cards in a grid across the whole width.
                  "mx-auto w-full max-w-[1920px] px-4 pb-6 pt-4"
                : "container mx-auto max-w-lg px-3 pb-[calc(var(--bbh,56px)+env(safe-area-inset-bottom,0px)+24px)] pt-3",
            onShell && homeCovered && "invisible",
          )}
          inert={onShell && homeCovered}
          data-testid={isClient ? "home" : undefined}
        >
          {onShell ? (
            // Its own boundary: a Home card that crashes must not take down the
            // shell, or the crash screen's "Report this problem" (a hard load
            // of /settings, which renders Home) would crash again before the
            // Settings sheet mounts.
            <ErrorBoundary>
              <HomePageBody />
            </ErrorBoundary>
          ) : (
            children
          )}
        </div>
      )}
      {isClient && <WindowLayer hidden={!onShell} />}
      {chrome && !desktop && <BottomBar />}
      {isClient && <SettingsSheet />}
    </main>
  );
}

/** Back closes windows; deep links open them. Needs Suspense (search params). */
function WindowHistorySync() {
  useWindowHistory();
  return null;
}

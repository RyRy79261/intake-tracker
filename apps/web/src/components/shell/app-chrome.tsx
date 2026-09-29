"use client";

import { Suspense, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useWindowStore } from "@/stores/window-store";
import { isChromeRoute, isWindowRoute } from "@/lib/nav-routes";
import { useWindowHistory } from "@/hooks/use-window-history";
import { HomePageBody } from "@/components/home-page-body";
import { WindowLayer, useIsWide } from "@/components/shell/window-layer";
import { cn } from "@/lib/utils";
import { SysBar } from "@/components/shell/sys-bar";
import { BottomBar } from "@/components/shell/bottom-bar";
import { SettingsSheet } from "@/components/settings/settings-sheet";
import { SETTINGS_PATH } from "@/hooks/use-window-history";

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
 * Log).
 *
 * The shell reads device-only state (open windows in sessionStorage, the
 * screen width), so the server render and hydration show a plain frame and
 * the shell swaps in right after. Non-shell pages (`/privacy`, `/auth`, ...)
 * render their content in that frame, so it is in the server HTML.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  const pathname = usePathname();

  if (!isClient) {
    const onShell = pathname === "/" || pathname === SETTINGS_PATH || isWindowRoute(pathname);
    return (
      <main className="min-h-screen overflow-x-clip bg-background">
        {!onShell && <div className="container mx-auto max-w-lg px-4 pb-6 pt-6">{children}</div>}
      </main>
    );
  }

  return <WardShell>{children}</WardShell>;
}

/**
 * The Ward Console frame. Home, the window routes (`/medications`,
 * `/analytics`, `/history`, `/profile`) and `/settings` all render Home
 * here, with the app windows (and the Settings sheet) over it, so Home stays
 * mounted while windows open and close and the route only decides which
 * window a deep link opens. Other routes (`/help`, ...) render their page;
 * the windows stay mounted behind it, hidden.
 */
function WardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onShell = pathname === "/" || pathname === SETTINGS_PATH || isWindowRoute(pathname);
  const chrome = onShell || isChromeRoute(pathname);
  const wide = useIsWide();
  // On a phone the window on screen covers Home; on a wide screen tiled or
  // maximised windows fill the area, and Home would only show through the
  // gutters. Either way, take Home out of view, the tab order and the
  // accessibility tree.
  const homeCovered = useWindowStore((s) =>
    wide
      ? s.wins.filter((w) => !w.min).length >= 2 || s.wins.some((w) => !w.min && w.max)
      : !s.showHome && s.wins.some((w) => w.id === s.focus && !w.min),
  );

  return (
    <main className="min-h-screen overflow-x-clip bg-background" data-shell="ward">
      <Suspense fallback={null}>
        <WindowHistorySync />
      </Suspense>
      {chrome && <SysBar />}
      <div
        className={cn(
          chrome
            ? "container mx-auto max-w-lg px-3 pb-[calc(56px+env(safe-area-inset-bottom,0px)+24px)] pt-3"
            : "container mx-auto max-w-lg px-4 pb-6 pt-6",
          onShell && homeCovered && "invisible",
        )}
        inert={onShell && homeCovered}
        data-testid="home"
      >
        {onShell ? <HomePageBody /> : children}
      </div>
      <WindowLayer hidden={!onShell} />
      {chrome && <BottomBar />}
      <SettingsSheet />
    </main>
  );
}

/** Back closes windows; deep links open them. Needs Suspense (search params). */
function WindowHistorySync() {
  useWindowHistory();
  return null;
}

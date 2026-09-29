"use client";

import { Suspense, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSettingsStore } from "@/stores/settings-store";
import { useWindowStore } from "@/stores/window-store";
import { isChromeRoute, isWindowRoute } from "@/lib/nav-routes";
import { useWindowHistory } from "@/hooks/use-window-history";
import { HomePageBody } from "@/components/home-page-body";
import { WindowLayer, useIsWide } from "@/components/shell/window-layer";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/app-header";
import { SwipeNav } from "@/components/swipe-nav";
import { HomeFloatingBars } from "@/components/home-floating-bars";
import { MedicationsFloatingBars } from "@/components/medications-floating-bars";
import { SysBar } from "@/components/shell/sys-bar";
import { BottomBar } from "@/components/shell/bottom-bar";

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
 * The app frame around every page.
 *
 * With the `wardShell` setting on (Settings > Debug, device-only) it renders
 * the Ward Console shell: the sys-bar on top and the bottom bar (Home,
 * Windows, Hold to talk, Log). Otherwise it renders the legacy header, swipe
 * navigation and floating bars, unchanged. The server always renders the
 * legacy frame (the setting lives in localStorage), so the shell swaps in
 * right after hydration.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const wardShell = useSettingsStore((s) => s.wardShell);
  const isClient = useIsClient();

  if (!(isClient && wardShell)) {
    return (
      <main className="min-h-screen overflow-x-clip bg-background">
        <div className="container mx-auto max-w-lg px-4 pt-6">
          <AppHeader />
        </div>
        <SwipeNav>{children}</SwipeNav>
        <HomeFloatingBars />
        <MedicationsFloatingBars />
      </main>
    );
  }

  return <WardShell>{children}</WardShell>;
}

/**
 * The Ward Console frame. Home and the window routes (`/medications`,
 * `/analytics`, `/history`, `/profile`) all render Home here, with the app
 * windows over it, so Home stays mounted while windows open and close and
 * the route only decides which window a deep link opens. Other routes
 * (`/settings`, `/help`, ...) render their page; the windows stay mounted
 * behind it, hidden.
 */
function WardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onShell = pathname === "/" || isWindowRoute(pathname);
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
    </main>
  );
}

/** Back closes windows; deep links open them. Needs Suspense (search params). */
function WindowHistorySync() {
  useWindowHistory();
  return null;
}

"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSettingsStore } from "@/stores/settings-store";
import { isChromeRoute } from "@/lib/nav-routes";
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
  const pathname = usePathname();

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

  const chrome = isChromeRoute(pathname);
  return (
    <main className="min-h-screen overflow-x-clip bg-background" data-shell="ward">
      {chrome && <SysBar />}
      <div
        className={
          chrome
            ? "container mx-auto max-w-lg px-3 pb-[calc(56px+env(safe-area-inset-bottom,0px)+24px)] pt-3"
            : "container mx-auto max-w-lg px-4 pb-6 pt-6"
        }
      >
        {children}
      </div>
      {chrome && <BottomBar />}
      {/* Owns the Add-medication wizard that the Medications tabs open, so it
          stays mounted until PR 5 replaces its FAB with the dose FAB. */}
      <MedicationsFloatingBars aboveBottomBar={chrome} />
    </main>
  );
}

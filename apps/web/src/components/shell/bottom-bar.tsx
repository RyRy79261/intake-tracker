"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthGate } from "@/components/auth-guard";
import { HoldToTalk } from "@/components/shell/hold-to-talk";
import { QuickLinks } from "@/components/shell/quick-links";
import { ShellIcon } from "@/components/shell/shell-icon";
import { WindowsSwitcher } from "@/components/shell/windows-switcher";
import { goHome } from "@/hooks/use-window-history";
import { useIsWide } from "@/hooks/use-shell-mode";
import { isWindowRoute } from "@/lib/nav-routes";
import { useWindowStore } from "@/stores/window-store";

/** Bottom bar height above the safe area; content pads by this much. */
export const BOTTOM_BAR_HEIGHT_PX = 56;

// Shared cell look; pressed / expanded cells invert to a solid block.
const cellBase =
  "relative flex min-h-11 flex-col items-center justify-center gap-1 border border-line bg-panel " +
  "text-foreground aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background " +
  "aria-expanded:border-foreground aria-expanded:bg-foreground aria-expanded:text-background " +
  "disabled:text-muted-foreground";

/**
 * Ward Console bottom bar: Home, Windows (count, tiled screens only) and
 * Hold to talk (signed in only). Home closes the window on screen (phone) or
 * minimises every window (wide); on Home it scrolls back to the top.
 * Windows opens the switcher. A phone shows one window at a time (the others
 * close), so it has no Windows button; on Home it has the quick links above
 * the bar instead.
 */
export function BottomBar() {
  const pathname = usePathname();
  const router = useRouter();
  const showAi = useAuthGate();
  const wide = useIsWide();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const windowCount = useWindowStore((s) => s.wins.length);
  const showHome = useWindowStore((s) => s.showHome);

  // Home and the window routes all show Home under the windows.
  const onShell = pathname === "/" || isWindowRoute(pathname);
  const onHome = onShell && (showHome || windowCount === 0);
  const homeOn = onHome && !switcherOpen;

  return (
    <>
      {!wide && onHome && <QuickLinks />}
      <nav
        aria-label="Bottom bar"
        data-testid="bottom-bar"
        className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(56px+env(safe-area-inset-bottom,0px))] auto-cols-fr grid-flow-col gap-1 border-t border-line bg-chrome px-1.5 pb-[calc(4px+env(safe-area-inset-bottom,0px))] pt-1"
      >
        <button
          type="button"
          className={cellBase}
          aria-pressed={homeOn}
          aria-label="Home"
          onClick={() => {
            if (onHome) {
              window.scrollTo({ top: 0 });
              return;
            }
            goHome(onShell);
            if (!onShell) router.push("/");
          }}
        >
          <ShellIcon name="home" size={20} />
          <span className="text-xs font-medium">Home</span>
        </button>
        {wide && (
          <button
            type="button"
            className={cellBase}
            aria-label={`Windows, ${windowCount} open`}
            aria-haspopup="dialog"
            aria-expanded={switcherOpen}
            onClick={() => setSwitcherOpen(true)}
          >
            <span className="flex items-center gap-[5px]">
              <ShellIcon name="windows" size={20} />
              <span className="num inline-flex h-4 min-w-[18px] items-center justify-center border border-current px-[3px] text-[0.6875rem] leading-none">
                {windowCount}
              </span>
            </span>
            <span className="text-xs font-medium">Windows</span>
          </button>
        )}
        {showAi && <HoldToTalk />}
      </nav>
      {wide && (
        <WindowsSwitcher
          open={switcherOpen}
          onOpenChange={setSwitcherOpen}
          onSwitch={() => {
            // Switching from another route (e.g. /settings) returns to the windows.
            if (!onShell) router.push("/");
          }}
        />
      )}
    </>
  );
}

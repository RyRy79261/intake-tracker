"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthGate } from "@/components/auth-guard";
import { HoldToTalk } from "@/components/shell/hold-to-talk";
import { LogSheet } from "@/components/shell/log-sheet";
import { ShellIcon } from "@/components/shell/shell-icon";
import { WindowsSwitcher } from "@/components/shell/windows-switcher";
import { goHome } from "@/hooks/use-window-history";
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
 * Ward Console bottom bar: Home, Windows (count), Hold to talk (signed in
 * only) and Log. Home closes the window on screen (phone) or minimises every
 * window (wide); Windows opens the switcher.
 */
export function BottomBar() {
  const pathname = usePathname();
  const router = useRouter();
  const showAi = useAuthGate();
  const [logOpen, setLogOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const windowCount = useWindowStore((s) => s.wins.length);
  const showHome = useWindowStore((s) => s.showHome);

  // Home and the window routes all show Home under the windows.
  const onShell = pathname === "/" || isWindowRoute(pathname);
  const homeOn = onShell && (showHome || windowCount === 0) && !logOpen && !switcherOpen;

  return (
    <>
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
            goHome();
            if (!onShell) router.push("/");
          }}
        >
          <ShellIcon name="home" size={20} />
          <span className="text-xs font-medium">Home</span>
        </button>
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
        {showAi && <HoldToTalk />}
        <button
          type="button"
          className={cellBase}
          aria-label="Log"
          aria-haspopup="dialog"
          aria-expanded={logOpen}
          onClick={() => setLogOpen(true)}
        >
          <ShellIcon name="plus" size={20} />
          <span className="text-xs font-medium">Log</span>
        </button>
      </nav>
      <LogSheet open={logOpen} onOpenChange={setLogOpen} />
      <WindowsSwitcher
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
        onSwitch={() => {
          // Switching from another route (e.g. /settings) returns to the windows.
          if (!onShell) router.push("/");
        }}
      />
    </>
  );
}


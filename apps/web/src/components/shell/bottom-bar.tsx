"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthGate } from "@/components/auth-guard";
import { HoldToTalk } from "@/components/shell/hold-to-talk";
import { LogSheet } from "@/components/shell/log-sheet";
import { ShellIcon } from "@/components/shell/shell-icon";

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
 * only) and Log. Windows is a placeholder until the window manager (PR 3).
 */
export function BottomBar() {
  const pathname = usePathname();
  const router = useRouter();
  const showAi = useAuthGate();
  const [logOpen, setLogOpen] = useState(false);

  // No windows exist yet (PR 3); Home is "on" whenever the home route shows.
  const windowCount = 0;
  const homeOn = pathname === "/" && !logOpen;

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
            if (pathname !== "/") router.push("/");
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
          disabled
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
    </>
  );
}


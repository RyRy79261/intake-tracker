"use client";

import type { CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SHELL_APPS, isWindowRoute, windowHref } from "@/lib/nav-routes";
import { SETTINGS_PATH, goHome } from "@/hooks/use-window-history";
import { focusWindowTitle } from "@/hooks/use-shell-mode";
import { useWindowStore, type Win } from "@/stores/window-store";
import { useSettingsSheetStore } from "@/stores/settings-sheet-store";
import { useModuleWindowStore } from "@/stores/module-window-store";
import { ShellIcon } from "@/components/shell/shell-icon";
import { appColor } from "@/components/shell/window-frame";
import { cn } from "@/lib/utils";

const stripButton =
  "flex h-8 shrink-0 items-center justify-center border border-line bg-panel text-foreground " +
  "hover:border-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring " +
  "aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background " +
  "disabled:text-muted-foreground disabled:hover:border-line";

/**
 * Desktop mode's task strip, in the sys-bar: Home (minimise every app
 * window to show the desk), a button for each open app window, and Tidy
 * (every module back in the default arrangement, the app windows side by
 * side). A window's button focuses it, restores it when it
 * is minimised, and minimises it when it is already the one in front.
 * Replaces the bottom bar's Home and Windows on the desktop.
 */
export function TaskStrip() {
  const pathname = usePathname();
  const router = useRouter();
  const wins = useWindowStore((s) => s.wins);
  const focus = useWindowStore((s) => s.focus);
  const minimise = useWindowStore((s) => s.minimise);
  const switchTo = useWindowStore((s) => s.switchTo);
  const tidy = useWindowStore((s) => s.tidy);
  const settingsOn = useSettingsSheetStore((s) => s.open);
  const onWindows = pathname === "/" || isWindowRoute(pathname);
  const onShell = onWindows || pathname === SETTINGS_PATH;

  const shown = wins.filter((w) => !w.min);
  const homeOn = onWindows && !settingsOn && shown.length === 0;
  const isOn = (w: Win) => onShell && !settingsOn && w.id === focus && !w.min;

  const toggle = (w: Win) => {
    if (isOn(w)) {
      minimise(w.id);
      return;
    }
    switchTo(w.id);
    // From another route (e.g. /privacy): go back to the windows.
    if (!onShell) router.push(windowHref(w.app, w.st));
    focusWindowTitle(w.id);
  };

  return (
    <div className="flex h-full min-w-0 flex-1 items-center gap-1 pl-2" data-testid="task-strip">
      <button
        type="button"
        className={cn(stripButton, "w-8")}
        aria-label="Home"
        aria-pressed={homeOn}
        title="Home: show the desktop"
        onClick={() => {
          goHome(onWindows);
          if (!onWindows) router.push("/");
        }}
      >
        <ShellIcon name="home" size={16} />
      </button>
      <div role="toolbar" aria-label="Open windows" className="flex min-w-0 items-center gap-1 overflow-hidden">
        {wins.map((w) => {
          const app = SHELL_APPS[w.app];
          const on = isOn(w);
          return (
            <button
              key={w.id}
              type="button"
              data-task={w.id}
              data-min={w.min || undefined}
              className={cn(
                "flex h-8 w-44 min-w-10 shrink items-center gap-[7px] border px-2 text-left",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                on
                  ? "border-line bg-background text-foreground shadow-[inset_0_-2px_0_hsl(var(--fg))]"
                  : w.min
                    ? "border-dashed border-muted-foreground bg-panel text-foreground/80 hover:border-foreground"
                    : "border-line bg-panel text-foreground hover:border-muted-foreground",
              )}
              style={{ "--c": appColor(w.app) } as CSSProperties}
              aria-pressed={on}
              aria-label={w.min ? `${app.title} window, minimised` : `${app.title} window`}
              title={on ? `Minimise ${app.title}` : w.min ? `Restore ${app.title}` : `Show ${app.title}`}
              onClick={() => toggle(w)}
            >
              <ShellIcon name={app.icon} size={16} className="shrink-0 text-[color:var(--c)]" />
              <span className="min-w-0 truncate text-[0.8125rem] font-medium">{app.title}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={cn(stripButton, "w-8")}
        aria-label="Tidy windows"
        title="Tidy: every module back in its place, app windows side by side"
        onClick={() => {
          useModuleWindowStore.getState().arrange(useWindowStore.getState().area);
          tidy();
        }}
      >
        <ShellIcon name="tidy" size={16} />
      </button>
    </div>
  );
}

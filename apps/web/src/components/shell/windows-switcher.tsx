"use client";

import type { CSSProperties } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@intake/ui/sheet";
import { SHELL_APPS } from "@/lib/nav-routes";
import { ShellIcon } from "@/components/shell/shell-icon";
import { ControlGlyph, appColor } from "@/components/shell/window-frame";
import { closeWindow } from "@/hooks/use-window-history";
import { useWindowStore, type Win } from "@/stores/window-store";
import { useMedicationUIStore } from "@/stores/medication-ui-store";
import { useDueDoseCount } from "@/components/shell/sys-bar";
import type { MedTab } from "@/components/medications/med-footer";
import { cn } from "@/lib/utils";

const METRICS_TABS: Record<string, string> = {
  summary: "Summary",
  correlations: "Correlations",
  records: "Records",
  titration: "Titration",
};

const MED_TABS: Record<MedTab, string> = {
  schedule: "Schedule",
  prescriptions: "Rx",
  medications: "Meds",
  titrations: "Titrations",
  settings: "Settings",
};

/**
 * One line of state under a window's name, as in the prototype's
 * `winState`: "Schedule · 2 open", "Records".
 */
export function windowStateLabel(win: Win, meds: { tab: MedTab; due: number }): string | null {
  let label: string | null = null;
  if (win.app === "metrics") {
    const tab = typeof win.st.tab === "string" ? win.st.tab : "summary";
    label = METRICS_TABS[tab] ?? null;
  } else if (win.app === "meds") {
    label = `${MED_TABS[meds.tab]} · ${meds.due ? `${meds.due} open` : "all handled"}`;
  }
  if (win.min) return label ? `${label} · minimised` : "Minimised";
  return label;
}

interface WindowsSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a window was picked. */
  onSwitch?: () => void;
}

/**
 * The Windows sheet from the bottom bar: every open window, to switch to or
 * close. On wide screens it also offers "Arrange side by side" and "Show
 * desktop".
 */
export function WindowsSwitcher({ open, onOpenChange, onSwitch }: WindowsSwitcherProps) {
  const wins = useWindowStore((s) => s.wins);
  const focus = useWindowStore((s) => s.focus);
  const showHome = useWindowStore((s) => s.showHome);
  const wide = useWindowStore((s) => s.wide);
  const switchTo = useWindowStore((s) => s.switchTo);
  const tidy = useWindowStore((s) => s.tidy);
  const showDesktop = useWindowStore((s) => s.showDesktop);
  const medTab = useMedicationUIStore((s) => s.activeTab);
  const due = useDueDoseCount();

  const close = (id: string) => {
    closeWindow(id);
    if (useWindowStore.getState().wins.length === 0) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" open={open} className="flex max-h-[88%] flex-col gap-0 bg-panel p-0">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-chrome pl-3.5 pr-12">
          <SheetTitle className="text-xs font-semibold uppercase tracking-[0.06em]">
            Windows · <span className="font-mono">{wins.length}</span> open
          </SheetTitle>
          <SheetDescription className="sr-only">Switch to or close an open window</SheetDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]" data-testid="windows-switcher">
          {wins.length === 0 ? (
            <p className="p-3.5 text-[0.8125rem] text-muted-foreground">
              No windows are open. Open an app from the top bar.
            </p>
          ) : (
            <ul>
              {wins.map((w) => {
                const app = SHELL_APPS[w.app];
                const cur = w.id === focus && !showHome && !w.min;
                const sub = windowStateLabel(w, { tab: medTab, due });
                return (
                  <li
                    key={w.id}
                    className="flex items-center border-t border-line first:border-t-0"
                    data-testid="switcher-row"
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex min-h-[60px] min-w-0 flex-1 items-center gap-3 px-3.5 text-left hover:bg-foreground/[0.07]",
                        cur && "shadow-[inset_4px_0_0_hsl(var(--fg))]",
                      )}
                      style={{ "--c": appColor(w.app) } as CSSProperties}
                      aria-current={cur ? "true" : undefined}
                      onClick={() => {
                        switchTo(w.id);
                        onOpenChange(false);
                        onSwitch?.();
                      }}
                    >
                      <ShellIcon name={app.icon} size={20} className="shrink-0 text-[color:var(--c)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.9375rem] font-semibold">{app.title}</span>
                        {sub && (
                          <span className="block truncate font-mono text-[0.8125rem] text-muted-foreground">{sub}</span>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex h-12 w-12 shrink-0 items-center justify-center"
                      aria-label={`Close ${app.title}`}
                      onClick={() => close(w.id)}
                    >
                      <ControlGlyph kind="close" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {wide && wins.length > 0 && (
            <div className="border-t border-line">
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 px-3.5 text-left hover:bg-foreground/[0.07]"
                onClick={() => {
                  tidy();
                  onOpenChange(false);
                }}
              >
                <ShellIcon name="windows" size={20} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  Arrange side by side
                  <span className="block text-[0.8125rem] text-muted-foreground">
                    {wins.length} open window{wins.length === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 px-3.5 text-left hover:bg-foreground/[0.07]"
                onClick={() => {
                  showDesktop();
                  onOpenChange(false);
                }}
              >
                <ShellIcon name="home" size={20} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  Show desktop
                  <span className="block text-[0.8125rem] text-muted-foreground">
                    Minimises windows; they keep their state
                  </span>
                </span>
              </button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

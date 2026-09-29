"use client";

import type { CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-guard";
import { useDailyDoseSchedule } from "@/hooks/use-medication-queries";
import { useTodayKey } from "@/hooks/use-today-key";
import {
  SHELL_APPS,
  SYS_BAR_APPS,
  isWindowRoute,
  resolveWindowApp,
  windowHref,
  type ShellAppId,
} from "@/lib/nav-routes";
import { SETTINGS_PATH, openSettings, openWindow } from "@/hooks/use-window-history";
import { useWindowStore } from "@/stores/window-store";
import { useSettingsSheetStore } from "@/stores/settings-sheet-store";
import { ShellIcon, ShellLogo } from "@/components/shell/shell-icon";
import { cn } from "@/lib/utils";

/** Today's scheduled doses that are still open (not taken or skipped). */
export function useDueDoseCount(): number {
  const todayKey = useTodayKey();
  const slots = useDailyDoseSchedule(todayKey);
  return slots?.filter((s) => s.status === "pending").length ?? 0;
}

/** "Ryan Noble" -> "RN"; an email or single word -> its first letter. */
export function initialsFor(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name && name !== email ? name : "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    return (first + last).toUpperCase();
  }
  return (email?.[0] ?? "U").toUpperCase();
}

const hbBase =
  "relative flex h-10 w-[38px] items-center justify-center text-[color:var(--c,currentColor)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";

/** Active app: a 3px rule under the icon in the app colour. */
const hbOn = "shadow-[inset_0_-3px_0_var(--c,currentColor)]";

/**
 * Ward Console system bar: logo and title on the left, then the app buttons
 * (Medications with a due-dose pip, Metrics, History), the account avatar and
 * the Settings gear. The app buttons and the avatar open windows; History
 * opens Metrics on Records; the gear opens the global Settings sheet.
 * Sign-in is still a route.
 */
export function SysBar() {
  const pathname = usePathname();
  const router = useRouter();
  const due = useDueDoseCount();
  const { ready, authenticated, user } = useAuth();
  const wins = useWindowStore((s) => s.wins);
  const focus = useWindowStore((s) => s.focus);
  const showHome = useWindowStore((s) => s.showHome);
  const settingsOn = useSettingsSheetStore((s) => s.open);
  const onShell = pathname === "/" || pathname === SETTINGS_PATH || isWindowRoute(pathname);

  const go = (path: string) => {
    if (pathname !== path) router.push(path);
  };

  const open = (id: ShellAppId) => {
    const res = openWindow(id);
    // An already-open window from another route (e.g. /settings): go back
    // to the windows. A new one pushed its own route already.
    if (res && !res.created && !onShell) router.push(windowHref(res.win.app, res.win.st));
  };

  /** Is this app's window the one on screen? History = Metrics on Records. */
  const isOn = (id: ShellAppId): boolean => {
    if (!onShell || showHome || settingsOn) return false;
    const target = resolveWindowApp(id);
    const w = target && wins.find((x) => x.app === target.app);
    if (!w || w.min || w.id !== focus) return false;
    if (id === "history") return w.st.tab === "records";
    if (id === "metrics") return w.st.tab !== "records";
    return true;
  };

  const appButton = (id: ShellAppId) => {
    const app = SHELL_APPS[id];
    const pip = id === "meds" ? due : 0;
    const on = isOn(id);
    return (
      <button
        key={id}
        type="button"
        className={cn(hbBase, on && hbOn)}
        style={app.color ? ({ "--c": app.color } as CSSProperties) : undefined}
        aria-label={pip ? `${app.title}, ${pip} open` : app.title}
        aria-pressed={on}
        onClick={() => open(id)}
      >
        <ShellIcon name={app.icon} size={20} />
        {pip > 0 && (
          <span
            data-testid="dose-pip"
            aria-hidden="true"
            className="absolute right-0.5 top-[3px] h-[15px] min-w-[15px] bg-meds px-[2px] text-center font-mono text-[0.625rem] font-semibold leading-[15px] text-on-domain"
          >
            {pip}
          </span>
        )}
      </button>
    );
  };

  const profileOn = isOn("profile");
  let account;
  if (!ready) {
    account = (
      <button type="button" className={cn(hbBase, "text-muted-foreground")} disabled aria-label="Loading account">
        <ShellIcon name="profile" size={20} />
      </button>
    );
  } else if (authenticated) {
    account = (
      <button
        type="button"
        className={cn(hbBase, profileOn && hbOn)}
        aria-label={`Profile: ${user.name || user.email}, signed in`}
        aria-pressed={profileOn}
        onClick={() => open("profile")}
      >
        <span
          aria-hidden="true"
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-foreground font-mono text-[0.6875rem] font-semibold text-background"
        >
          {initialsFor(user.name, user.email)}
        </span>
      </button>
    );
  } else {
    account = (
      <button
        type="button"
        className={hbBase}
        aria-label="Sign in for AI features"
        onClick={() => go("/auth")}
      >
        <ShellIcon name="profile" size={20} />
      </button>
    );
  }

  return (
    <header
      data-testid="sys-bar"
      className="sticky top-0 z-50 flex h-[calc(44px+env(safe-area-inset-top,0px))] shrink-0 items-center gap-1 border-b border-line bg-chrome px-1.5 pt-[env(safe-area-inset-top,0px)] text-foreground"
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2 pl-1.5">
        <ShellLogo size={24} />
        <h1 className="whitespace-nowrap text-base font-semibold">Intake Tracker</h1>
      </div>
      <nav aria-label="Apps" className="ml-auto flex items-center gap-[2px]">
        {SYS_BAR_APPS.map(appButton)}
        {account}
        <button
          type="button"
          className={cn(hbBase, settingsOn && hbOn)}
          aria-label="Settings"
          aria-haspopup="dialog"
          aria-expanded={settingsOn}
          onClick={() => openSettings()}
        >
          <ShellIcon name="gear" size={20} />
        </button>
      </nav>
    </header>
  );
}

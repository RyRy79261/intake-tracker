"use client";

import type { CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-guard";
import { useDailyDoseSchedule } from "@/hooks/use-medication-queries";
import { useTodayKey } from "@/hooks/use-today-key";
import { SHELL_APPS, SYS_BAR_APPS, isShellAppOn, type ShellAppId } from "@/lib/nav-routes";
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
 * the Settings gear. Until the window manager lands (PR 3) the buttons
 * navigate to the app's route.
 */
export function SysBar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const due = useDueDoseCount();
  const { ready, authenticated, user } = useAuth();

  const go = (path: string, on: boolean) => {
    if (!on) router.push(path);
  };

  const appButton = (id: ShellAppId) => {
    const app = SHELL_APPS[id];
    const pip = id === "meds" ? due : 0;
    const on = isShellAppOn(id, pathname, searchParams);
    return (
      <button
        key={id}
        type="button"
        className={cn(hbBase, on && hbOn)}
        style={app.color ? ({ "--c": app.color } as CSSProperties) : undefined}
        aria-label={pip ? `${app.title}, ${pip} open` : app.title}
        aria-current={on ? "page" : undefined}
        onClick={() => go(app.path, on)}
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

  const profileOn = pathname === "/profile";
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
        aria-current={profileOn ? "page" : undefined}
        onClick={() => go("/profile", profileOn)}
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
        onClick={() => go("/auth", false)}
      >
        <ShellIcon name="profile" size={20} />
      </button>
    );
  }

  const settingsOn = pathname === "/settings";

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
          aria-current={settingsOn ? "page" : undefined}
          onClick={() => go("/settings", settingsOn)}
        >
          <ShellIcon name="gear" size={20} />
        </button>
      </nav>
    </header>
  );
}

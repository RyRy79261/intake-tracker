"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Bell, Cloud, LogOut, Pill, Sparkles, TestTube, User, type LucideIcon } from "lucide-react";
import { useRequireAuth } from "@/components/auth-required-dialog";

export function AccountSection() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;

  return <PrivyAccountSection />;
}

const FEATURES: { icon: LucideIcon; label: string; comingSoon?: boolean }[] = [
  { icon: Sparkles, label: "AI food & drink parsing" },
  { icon: TestTube, label: "Substance lookup" },
  { icon: Pill, label: "Medicine search & interactions" },
  { icon: Bell, label: "Medication reminders" },
  { icon: Cloud, label: "Cloud sync", comingSoon: true },
];

function PrivyAccountSection() {
  const { ready, authenticated, user, logout } = usePrivy();
  const { requireAuth } = useRequireAuth();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
        <User className="w-4 h-4" />
        <h3 className="font-semibold">Account</h3>
      </div>

      {!ready ? (
        <div className="p-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
          Loading…
        </div>
      ) : authenticated ? (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border">
            <p className="text-sm font-medium truncate">
              {user?.email?.address ?? "Authenticated user"}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Signed in — AI & reminders enabled
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-3 rounded-lg border bg-muted/30">
            <p className="text-sm font-medium">Not signed in</p>
            <p className="text-xs text-muted-foreground">
              Local-only mode. Sign in to unlock cloud features.
            </p>
          </div>
          <ul className="space-y-1.5">
            {FEATURES.map(({ icon: Icon, label, comingSoon }) => (
              <li
                key={label}
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {comingSoon && (
                  <span className="text-[10px] uppercase tracking-wide font-medium bg-background border rounded px-1.5 py-0.5">
                    Soon
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Button className="w-full gap-2" onClick={() => requireAuth("general")}>
            <User className="w-4 h-4" />
            Sign In
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";
import { clearLocalAuthState } from "@/components/auth-guard";

const PRIVY_READY_OFFLINE_TIMEOUT_MS = 5000;

export function AccountSection() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;

  return <PrivyAccountSection />;
}

function PrivyAccountSection() {
  const { ready, authenticated, user, logout } = usePrivy();

  // Same timeout as AuthGuard: if Privy can't reach its servers we still
  // want to offer a logout path so users can reach the sign-in card and
  // the bypass form.
  const [readyTimedOut, setReadyTimedOut] = useState(false);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReadyTimedOut(true), PRIVY_READY_OFFLINE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);

  const handleLogout = useCallback(async () => {
    clearLocalAuthState();
    try {
      await logout();
    } catch {
      /* Privy's logout needs the network; local clear is enough to log us out */
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, [logout]);

  // Render the section if Privy says we're authenticated, OR if Privy never
  // reached ready — in the offline case the user is in via the remembered
  // auth or bypass grace and still needs a way out.
  const showSection = authenticated || readyTimedOut;
  if (!showSection) return null;

  const displayName = user?.email?.address || "Authenticated user";
  const sessionLabel = authenticated ? "Signed in" : "Offline session";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
        <User className="w-4 h-4" />
        <h3 className="font-semibold">Account</h3>
      </div>
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border">
          <p className="text-sm font-medium">{displayName}</p>
          <p className="text-xs text-muted-foreground">{sessionLabel}</p>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

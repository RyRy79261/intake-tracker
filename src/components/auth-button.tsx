"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, User } from "lucide-react";
import { clearLocalAuthState } from "@/components/auth-guard";

const PRIVY_READY_OFFLINE_TIMEOUT_MS = 5000;

export function AuthButton() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;

  return <PrivyAuthButton />;
}

function PrivyAuthButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  // Mirrors AuthGuard's timeout pattern: when Privy can't reach its servers
  // `ready` never flips to true, which would otherwise leave this button
  // permanently disabled and lock users into an authenticated session they
  // can't exit. After the timeout we enable the button so logout is
  // clickable even offline.
  const [readyTimedOut, setReadyTimedOut] = useState(false);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReadyTimedOut(true), PRIVY_READY_OFFLINE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);

  const effectivelyReady = ready || readyTimedOut;

  // Logs out even when offline: clears our local auth grace so AuthGuard
  // falls back to the sign-in card, then tries Privy's own logout (which
  // will silently no-op without network). The local clear is what actually
  // makes the guard release the user.
  const handleLogout = useCallback(async () => {
    clearLocalAuthState();
    try {
      await logout();
    } catch {
      /* Privy's logout needs the network; local clear is enough to log us out */
    }
    if (typeof window !== "undefined") {
      // Hard reload so AuthGuard re-evaluates without stale Privy state.
      window.location.reload();
    }
  }, [logout]);

  // Show a disabled placeholder only while we're still waiting for Privy —
  // once the timeout fires we switch to the real logout/login button.
  if (!effectivelyReady) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <User className="w-4 h-4" />
      </Button>
    );
  }

  if (authenticated) {
    const displayName = user?.email?.address || user?.wallet?.address?.slice(0, 8) || "User";

    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {displayName}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  // Privy says we're not authenticated (and didn't time out, so it's
  // reachable). If AuthGuard let us render anyway, we're running on the
  // remembered-auth grace or the bypass — surface a logout button so the
  // user can drop that grace and re-auth/bypass cleanly.
  if (readyTimedOut) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        title="Clear session"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={login}
      className="gap-2"
    >
      <LogIn className="w-4 h-4" />
      <span className="hidden sm:inline">Sign In</span>
    </Button>
  );
}

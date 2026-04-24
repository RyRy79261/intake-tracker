"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, Shield, Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// Remembered-auth window: how long after the last successful Privy
// authentication we'll keep granting access while the device is offline.
// Lets users stay in the PWA on extended offline trips without Privy
// access tokens silently locking them out when they refresh.
const REMEMBERED_AUTH_KEY = "intake-tracker-last-auth";
const REMEMBERED_AUTH_WINDOW_MS = 18 * 24 * 60 * 60 * 1000;
const PRIVY_READY_OFFLINE_TIMEOUT_MS = 5000;

function readRememberedAuthTimestamp(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(REMEMBERED_AUTH_KEY);
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : null;
}

function isRememberedAuthValid(): boolean {
  const ts = readRememberedAuthTimestamp();
  if (ts === null) return false;
  return Date.now() - ts < REMEMBERED_AUTH_WINDOW_MS;
}

function isOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  // navigator.onLine is `false` only when the device has no network at all,
  // which is exactly when we want to honor the remembered session.
  return navigator.onLine === false;
}

/**
 * Protects content behind Privy authentication.
 * Shows login prompt if user is not authenticated.
 */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  // Skip auth entirely when Privy is not configured (dev / CI e2e)
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <>{children}</>;
  }

  return <PrivyAuthGuard fallback={fallback}>{children}</PrivyAuthGuard>;
}

function PrivyAuthGuard({ children, fallback }: AuthGuardProps) {
  const { ready, authenticated, login } = usePrivy();

  // Privy can hang on `ready === false` when offline because its init calls
  // never resolve. Treat the SDK as "ready enough" after a short delay so we
  // can fall through to the remembered-auth check instead of spinning forever.
  const [readyTimedOut, setReadyTimedOut] = useState(false);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReadyTimedOut(true), PRIVY_READY_OFFLINE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);

  // Persist a timestamp on every successful authentication so an offline
  // session knows when the user last logged in via Privy.
  useEffect(() => {
    if (authenticated && typeof window !== "undefined") {
      window.localStorage.setItem(REMEMBERED_AUTH_KEY, String(Date.now()));
    }
  }, [authenticated]);

  const effectivelyReady = ready || readyTimedOut;

  if (!effectivelyReady) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // User is authenticated - show protected content
  if (authenticated) {
    return <>{children}</>;
  }

  // Offline grace: if Privy can't validate (or hasn't become ready) but the
  // device is offline and we recently authenticated, keep the user in.
  if (isOffline() && isRememberedAuthValid()) {
    return <>{children}</>;
  }

  // User is not authenticated - show login prompt or fallback
  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10 w-fit">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle>Sign in Required</CardTitle>
          <CardDescription>
            This app requires authentication to protect your health data and API access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={login}
            className="w-full gap-2"
            size="lg"
          >
            <LogIn className="w-5 h-5" />
            Sign In
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Only authorized accounts can access this app.
            Contact the administrator if you need access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

const noopAuth = {
  ready: true as const,
  authenticated: false as const,
  user: null,
  getAccessToken: async () => null,
  getAuthHeader: async () => ({} as Record<string, string>),
};

/**
 * Hook to check if user is authorized (authenticated + on whitelist)
 * The whitelist check happens server-side when making API calls.
 */
export const useAuth = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  ? function useAuth() {
      const { ready, authenticated, user, getAccessToken } = usePrivy();
      return {
        ready,
        authenticated,
        user,
        getAccessToken,
        getAuthHeader: async () => {
          try {
            const token = await getAccessToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          } catch {
            return {};
          }
        },
      };
    }
  : function useAuth() {
      return noopAuth;
    };

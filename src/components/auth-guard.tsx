"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LogIn, Shield, Loader2, AlertTriangle } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// Remembered-auth window: how long after the last successful Privy
// authentication we'll keep granting access while the device is offline.
// Lets users stay in the PWA on extended offline trips without Privy
// access tokens silently locking them out when they refresh.
export const REMEMBERED_AUTH_KEY = "intake-tracker-last-auth";
const REMEMBERED_AUTH_WINDOW_MS = 18 * 24 * 60 * 60 * 1000;
const PRIVY_READY_OFFLINE_TIMEOUT_MS = 5000;

// TEMPORARY emergency bypass: if the user enters this code on the sign-in
// screen they get the same 18-day grace as a remembered Privy auth. Intended
// for offline trips when Privy can't reach its servers; remove once a more
// permanent offline-auth story is in place.
export const BYPASS_KEY = "intake-tracker-bypass-auth";
const DEFAULT_BYPASS_CODE = "meowmeowmeow";

// URL escape hatch: visiting any page with `?bypass=CODE` activates the
// bypass and strips the query param. Works when every other button in the
// UI is dead (e.g. offline + expired Privy session + disabled logout), so
// users can always recover without clearing site data.
const BYPASS_QUERY_PARAM = "bypass";

function getBypassCode(): string {
  return process.env.NEXT_PUBLIC_BYPASS_CODE || DEFAULT_BYPASS_CODE;
}

function isBypassActive(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(BYPASS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < REMEMBERED_AUTH_WINDOW_MS;
}

function activateBypass(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BYPASS_KEY, String(Date.now()));
}

/**
 * Clears local auth state (remembered Privy timestamp + bypass flag) so the
 * next render of AuthGuard falls through to the sign-in card. Callable from
 * logout flows — lets users reach the bypass form offline, since Privy's
 * own logout() can't complete without the network.
 */
export function clearLocalAuthState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(REMEMBERED_AUTH_KEY);
  window.localStorage.removeItem(BYPASS_KEY);
}

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

  // Re-renders the guard when the bypass is activated from the sign-in card
  // or from the `?bypass=CODE` URL escape hatch.
  const [bypassTick, setBypassTick] = useState(0);

  // URL escape hatch: `?bypass=CODE` activates bypass on any page load.
  // Strips the param from the URL so the code doesn't stick around in
  // history/share targets after activation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get(BYPASS_QUERY_PARAM);
    if (!code) return;
    if (code === getBypassCode()) {
      activateBypass();
      setBypassTick((n) => n + 1);
    }
    url.searchParams.delete(BYPASS_QUERY_PARAM);
    const cleaned = url.pathname + (url.search ? url.search : "") + url.hash;
    window.history.replaceState(null, "", cleaned);
  }, []);

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

  // Offline / network-failure grace: if Privy never became ready within the
  // timeout, we couldn't reach its auth servers — honor the last successful
  // Privy login for up to REMEMBERED_AUTH_WINDOW_MS so the PWA stays usable
  // on flaky or absent networks. We intentionally do NOT use navigator.onLine
  // here because mobile devices routinely report online === true while the
  // radio can't actually reach the internet (captive portals, poor signal,
  // backgrounded PWAs), which was silently locking users out. "Privy didn't
  // become ready in 5s" is a much more reliable signal of network trouble.
  if (readyTimedOut && isRememberedAuthValid()) {
    return <>{children}</>;
  }

  // Emergency bypass — see TEMPORARY note above.
  if (isBypassActive()) {
    void bypassTick; // keep dep on state so re-render reflects activation
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
          <EmergencyBypassForm onUnlock={() => setBypassTick((n) => n + 1)} />
        </CardContent>
      </Card>
    </div>
  );
}

function EmergencyBypassForm({ onUnlock }: { onUnlock: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim() === getBypassCode()) {
      activateBypass();
      onUnlock();
    } else {
      setError(true);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Use emergency bypass code
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Temporary emergency bypass</span>
      </div>
      <Input
        type="password"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError(false);
        }}
        placeholder="Bypass code"
        autoFocus
        autoComplete="off"
        aria-label="Emergency bypass code"
      />
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">Incorrect code.</p>
      )}
      <Button type="submit" variant="secondary" size="sm" className="w-full">
        Unlock
      </Button>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Grants access for 18 days without verifying with the auth server.
        Remove this bypass once normal sign-in works again.
      </p>
    </form>
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

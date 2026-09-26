"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import {
  isCapacitorMode,
  getAuthToken,
  clearAuthToken,
  apiFetch,
} from "@/lib/api-fetch";
import { resumeReminders } from "@/lib/reminder-suspension";

/** Fallback retry delay when a transient validate failure has no 'online' event. */
const RETRY_VALIDATE_MS = 30_000;

interface CapUser {
  id: string;
  email: string;
}

export function useAuth() {
  const { data: session, isPending } = useSession();
  const [capUser, setCapUser] = useState<CapUser | null>(null);
  const [capPending, setCapPending] = useState(false);
  const validated = useRef(false);
  // Bumped to re-run validation after a transient failure.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isCapacitorMode() || session?.user || validated.current) return;
    const token = getAuthToken();
    if (!token) return;

    validated.current = true;
    setCapPending(true);
    let disposed = false;
    let settled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      window.removeEventListener("online", retry);
      clearTimeout(retryTimer);
      if (!disposed) setAttempt((n) => n + 1);
    };
    // Only an explicit 401/403 means the token is dead. A 5xx (Neon Auth
    // outage → 503) or a network error says nothing about the token: keep it
    // and try again when the network returns, or after a pause
    // (audit native-android#5).
    const scheduleRetry = () => {
      validated.current = false;
      if (disposed) return;
      window.addEventListener("online", retry);
      retryTimer = setTimeout(retry, RETRY_VALIDATE_MS);
    };

    apiFetch("/api/auth/validate")
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          clearAuthToken();
          return;
        }
        if (!res.ok) {
          scheduleRetry();
          return;
        }
        const data = (await res.json()) as {
          user?: { id: string; email: string };
        } | null;
        if (data?.user) {
          setCapUser({ id: data.user.id, email: data.user.email });
        } else {
          clearAuthToken();
        }
      })
      .catch(() => scheduleRetry())
      .finally(() => {
        settled = true;
        setCapPending(false);
      });

    return () => {
      disposed = true;
      // A disposed run can no longer schedule its own retry, so let the next
      // run validate again instead of waiting on this in-flight request.
      if (!settled) validated.current = false;
      window.removeEventListener("online", retry);
      clearTimeout(retryTimer);
    };
  }, [session, attempt]);

  const loading = isPending || capPending;
  const user = session?.user ?? capUser;
  const signedInId = loading ? null : (user?.id ?? null);

  // Reminders are suspended at sign-out; bring them back on the next sign-in
  // (audit native-android#8). resumeReminders() is a no-op after the first
  // useAuth instance claims it.
  useEffect(() => {
    if (!signedInId || !resumeReminders()) return;
    import("@/lib/local-notifications")
      .then((m) => m.syncMedicationNotifications())
      .catch(() => {});
  }, [signedInId]);

  if (loading) {
    return { ready: false, authenticated: false, user: null } as const;
  }

  if (!user) {
    return { ready: true, authenticated: false, user: null } as const;
  }

  return {
    ready: true,
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: "name" in user ? (user.name as string) : user.email,
    },
  } as const;
}

export function useAuthGate(): boolean {
  const { ready, authenticated } = useAuth();
  return !ready || authenticated;
}

export function AuthGuard({
  children,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return <>{children}</>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import {
  isCapacitorMode,
  getAuthToken,
  clearAuthToken,
  apiFetch,
} from "@/lib/api-fetch";

interface CapUser {
  id: string;
  email: string;
}

export function useAuth() {
  const { data: session, isPending } = useSession();
  const [capUser, setCapUser] = useState<CapUser | null>(null);
  const [capPending, setCapPending] = useState(false);
  const validated = useRef(false);

  useEffect(() => {
    if (!isCapacitorMode() || session?.user || validated.current) return;
    const token = getAuthToken();
    if (!token) return;

    validated.current = true;
    setCapPending(true);
    apiFetch("/api/auth/validate")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setCapUser({ id: data.user.id, email: data.user.email });
        } else {
          clearAuthToken();
        }
      })
      .catch(() => {})
      .finally(() => setCapPending(false));
  }, [session]);

  const loading = isPending || capPending;
  const user = session?.user ?? capUser;

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

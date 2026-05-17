"use client";

import { useSession } from "@/lib/auth-client";

/**
 * Hook to check if the user is authenticated via Neon Auth.
 *
 * NOTE: Since Phase 41 D-03 (middleware hard gate), AuthGuard is nearly
 * always redundant — unauthenticated users never reach the app shell.
 * The hook is kept primarily for components that want to display the
 * user's email or branch behavior on authenticated state.
 *
 * Per D-06, this hook NO LONGER exposes `getAuthHeader` / `getAccessToken`.
 * Cookies carry auth automatically on same-origin fetch calls, so
 * consumers should just call `fetch(...)` without attaching any
 * Authorization header. Consumer call-sites are updated in plan 41-04;
 * until then they will fail to typecheck — that breakage is documented
 * in plan 41-02 and resolved by plan 41-04.
 */
export function useAuth() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return { ready: false, authenticated: false, user: null } as const;
  }

  if (!session?.user) {
    return { ready: true, authenticated: false, user: null } as const;
  }

  return {
    ready: true,
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
  } as const;
}

/**
 * Whether auth-gated features (AI buttons, push toggle) should be visible
 * in the UI. Returns true when the session is loading (avoids flicker on
 * first paint) or when the user is authenticated. Since Neon Auth uses
 * middleware hard-gating, authenticated users are assumed to be approved.
 */
export function useAuthGate(): boolean {
  const { ready, authenticated } = useAuth();
  // Show AI features while loading (to avoid flicker) or when authenticated
  return !ready || authenticated;
}

/**
 * AuthGuard is now a thin passthrough. The middleware.ts hard gate (D-03)
 * handles all redirects for unauthenticated users, so any wrapping tree
 * already sits inside an authenticated context. This component exists
 * purely for backwards compatibility with existing call-sites; they
 * become no-ops until they are removed in a future cleanup phase.
 */
export function AuthGuard({
  children,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return <>{children}</>;
}

"use client";

import { usePrivy } from "@privy-io/react-auth";

const noopAuth = {
  ready: true as const,
  authenticated: false as const,
  user: null,
  getAccessToken: async () => null,
  getAuthHeader: async () => ({} as Record<string, string>),
};

/**
 * Hook exposing Privy auth state and a header helper for authenticated fetches.
 * When Privy is not configured, returns an unauthenticated noop so the app
 * stays fully usable in local-only mode (dev / CI / offline).
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

/**
 * Whether auth-gated features (AI buttons, push toggle) should be visible
 * in the UI. True when Privy is unconfigured (dev mode — no gate), while
 * Privy is still hydrating (avoids a flicker on first paint), or when the
 * user is authenticated.
 */
export function useAuthGate(): boolean {
  const { ready, authenticated } = useAuth();
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return true;
  if (!ready) return true;
  return authenticated;
}

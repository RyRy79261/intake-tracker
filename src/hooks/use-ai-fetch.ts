"use client";

import { useCallback } from "react";
import { useAuth } from "@/components/auth-guard";
import {
  useRequireAuth,
  type AuthDialogVariant,
} from "@/components/auth-required-dialog";

/**
 * Fetch wrapper for authenticated /api/ai/* endpoints.
 *
 * - Prompts the sign-in modal if the user is not authenticated and waits
 *   for them to log in. Resolves with `null` if the user dismisses.
 * - Attaches the Privy bearer token automatically.
 * - On a 401 with `{ requiresAuth: true }` response body, treats the session
 *   as expired: signs the user out, reopens the modal, and retries once on
 *   successful re-login.
 */
export function useAiFetch() {
  const { getAuthHeader } = useAuth();
  const { requireAuth, notifyExpired } = useRequireAuth();

  return useCallback(
    async (
      input: RequestInfo | URL,
      init: RequestInit = {},
      variant: AuthDialogVariant = "ai"
    ): Promise<Response | null> => {
      const ok = await requireAuth(variant);
      if (!ok) return null;

      const authHeaders = await getAuthHeader();
      const baseHeaders = { ...(init.headers ?? {}), ...authHeaders };
      let res = await fetch(input, { ...init, headers: baseHeaders });

      if (res.status === 401) {
        const body = await res.clone().json().catch(() => ({}));
        if (body?.requiresAuth) {
          const reauthOk = await notifyExpired();
          if (!reauthOk) return res;
          const retryHeaders = {
            ...(init.headers ?? {}),
            ...(await getAuthHeader()),
          };
          res = await fetch(input, { ...init, headers: retryHeaders });
        }
      }

      return res;
    },
    [getAuthHeader, requireAuth, notifyExpired]
  );
}
